import os
import pandas as pd
import torch
from PIL import Image
Image.MAX_IMAGE_PIXELS = None # Disable DecompressionBombWarning for large images
from transformers import CLIPProcessor, CLIPModel
import time
import csv
from tqdm import tqdm
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from metrics import get_comprehensive_gpu_metrics, calculate_top_n_accuracy, calculate_mrr, calculate_precision_at_k
import gc
from typing import List, Dict, Tuple, Optional
from chroma_db_manager import ChromaDBManager # Import ChromaDBManager

# --- CONFIGURATION ---
MASTER_CSV_PATH = "data/apod_master_data.csv"
OUTPUT_CSV_PATH = "data/apod_broad_categorization.csv"
IMAGE_DIR = "images/"
EMBEDDINGS_DIR = "data/embeddings/"
GPU_METRICS_FILE = "gpu_metrics_clip_categorization.csv"
CHROMA_DB_PATH = "./apod_chroma_db" # Path for ChromaDB

# Performance settings
BATCH_SIZE = 16  # Reduced due to multiple embedding computations
NUM_WORKERS = 4  # For parallel image loading
MAX_IMAGE_SIZE = 512  # Resize large images to save memory
SAVE_EMBEDDINGS_EVERY = 100  # Save embeddings periodically to prevent memory overflow

# Define the categories for classification
APOD_LABELS = [
    "Galaxy", "Nebula", "Star Cluster", "Planet", "Comet", "Asteroid", "Supernova", 
    "Black Hole", "Dark Matter", "Cosmology", "Aurora", "Rocket Launch", "Satellite", 
    "Mars Rover", "Sun", "Moon", "Earth/Atmospheric", "Solar", "Lunar", "Human Activity", 
    "Diagram/Illustration", "Composite/Technical"
]

class EmbeddingBatch:
    """Container for batch embeddings to manage memory efficiently"""
    def __init__(self):
        self.title_embeddings = []
        self.text_image_embeddings = []
        self.image_embeddings = []
        self.multimodal_embeddings = []
        self.indices = []
    
    def add(self, title_emb, text_emb, image_emb, multimodal_emb, idx):
        self.title_embeddings.append(title_emb)
        self.text_image_embeddings.append(text_emb)
        self.image_embeddings.append(image_emb)
        self.multimodal_embeddings.append(multimodal_emb)
        self.indices.append(idx)
    
    def clear(self):
        self.title_embeddings.clear()
        self.text_image_embeddings.clear()
        self.image_embeddings.clear()
        self.multimodal_embeddings.clear()
        self.indices.clear()
    
    def __len__(self):
        return len(self.indices)

def load_and_preprocess_image(image_path: str, max_size: int = MAX_IMAGE_SIZE) -> Optional[Image.Image]:
    """Load and preprocess image with size optimization"""
    try:
        image = Image.open(image_path).convert("RGB")
        # Resize if too large to save memory
        if max(image.size) > max_size:
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        return image
    except Exception as e:
        print(f"Error loading image {image_path}: {e}")
        return None

def preload_valid_images(df_images: pd.DataFrame, max_workers: int = NUM_WORKERS) -> Tuple[pd.DataFrame, Dict[int, str]]:
    """Preload and validate images in parallel"""
    print("Preloading and validating images...")
    
    def check_image_path(row):
        date_str = row['date']
        image_url = row.get('hdurl') or row.get('url')
        
        # Construct local image path
        file_extension = os.path.splitext(image_url)[1] if os.path.splitext(image_url)[1] else ".jpg"
        if '?' in file_extension:
            file_extension = ".jpg"
        local_image_path = os.path.join(IMAGE_DIR, f"{date_str}{file_extension}")
        
        if os.path.exists(local_image_path):
            return row.name, local_image_path, True
        else:
            return row.name, local_image_path, False
    
    # Check image paths in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(tqdm(
            executor.map(check_image_path, [row for _, row in df_images.iterrows()]), 
            total=len(df_images), 
            desc="Validating images"
        ))
    
    # Filter valid images
    valid_indices = []
    image_paths = {}
    
    for idx, path, is_valid in results:
        if is_valid:
            valid_indices.append(idx)
            image_paths[idx] = path
    
    print(f"Found {len(valid_indices)} valid images out of {len(df_images)} total")
    return df_images.loc[valid_indices], image_paths

def save_embeddings_batch(embedding_batch: EmbeddingBatch, batch_num: int, embeddings_dir: str):
    """Save embeddings batch to disk"""
    if len(embedding_batch) == 0:
        return
    
    # Stack embeddings
    title_batch = np.vstack(embedding_batch.title_embeddings)
    text_batch = np.vstack(embedding_batch.text_image_embeddings)
    image_batch = np.vstack(embedding_batch.image_embeddings)
    multimodal_batch = np.vstack(embedding_batch.multimodal_embeddings)
    
    # Save batch files
    np.save(os.path.join(embeddings_dir, f'title_embeddings_batch_{batch_num}.npy'), title_batch)
    np.save(os.path.join(embeddings_dir, f'text_image_embeddings_batch_{batch_num}.npy'), text_batch)
    np.save(os.path.join(embeddings_dir, f'image_embeddings_batch_{batch_num}.npy'), image_batch)
    np.save(os.path.join(embeddings_dir, f'multimodal_embeddings_batch_{batch_num}.npy'), multimodal_batch)
    
    # Save indices for this batch
    np.save(os.path.join(embeddings_dir, f'indices_batch_{batch_num}.npy'), np.array(embedding_batch.indices))

def consolidate_embedding_batches(embeddings_dir: str, total_batches: int):
    """Consolidate all embedding batches into single files"""
    print("Consolidating embedding batches...")
    
    embedding_types = ['title_embeddings', 'text_image_embeddings', 'image_embeddings', 'multimodal_embeddings']
    
    for emb_type in embedding_types:
        all_embeddings = []
        all_indices = []
        
        for batch_num in range(total_batches):
            batch_file = os.path.join(embeddings_dir, f'{emb_type}_batch_{batch_num}.npy')
            indices_file = os.path.join(embeddings_dir, f'indices_batch_{batch_num}.npy')
            
            if os.path.exists(batch_file) and os.path.exists(indices_file):
                batch_embeddings = np.load(batch_file)
                batch_indices = np.load(indices_file)
                
                all_embeddings.append(batch_embeddings)
                if emb_type == 'title_embeddings':  # Only need indices once
                    all_indices.extend(batch_indices)
        
        if all_embeddings:
            # Concatenate all batches
            final_embeddings = np.vstack(all_embeddings)
            np.save(os.path.join(embeddings_dir, f'{emb_type}.npy'), final_embeddings)
            
            # Clean up batch files
            for batch_num in range(total_batches):
                batch_file = os.path.join(embeddings_dir, f'{emb_type}_batch_{batch_num}.npy')
                if os.path.exists(batch_file):
                    os.remove(batch_file)
    
    # Save final indices and clean up
    if all_indices:
        np.save(os.path.join(embeddings_dir, 'embedding_indices.npy'), np.array(all_indices))
    
    # Clean up indices batch files
    for batch_num in range(total_batches):
        indices_file = os.path.join(embeddings_dir, f'indices_batch_{batch_num}.npy')
        if os.path.exists(indices_file):
            os.remove(indices_file)

def process_batch(batch_data: pd.DataFrame, model: CLIPModel, processor: CLIPProcessor, 
                 category_embeddings: torch.Tensor, device: str, image_paths: Dict[int, str]) -> Tuple[List[Dict], EmbeddingBatch, List[List[str]]]:
    """Process a batch of images and texts with all embedding types and return top-k predictions"""
    batch_images = []
    batch_texts_full = []
    batch_texts_title = []
    batch_indices = []
    
    # Prepare batch data
    for idx, row in batch_data.iterrows():
        image_path = image_paths[idx]
        image = load_and_preprocess_image(image_path)
        
        if image is None:
            continue
            
        title = row.get('title', '')
        explanation = row.get('explanation', '')
        text_full = f"{title}. {explanation}"
        
        batch_images.append(image)
        batch_texts_full.append(text_full)
        batch_texts_title.append(title)
        batch_indices.append(idx)
    
    if not batch_images:
        return [], EmbeddingBatch(), []
    
    try:
        with torch.no_grad():
            # Process titles
            title_inputs = processor(
                text=batch_texts_title, 
                return_tensors="pt", 
                padding=True, 
                truncation=True,
                max_length=77
            ).to(device)
            
            title_features = model.get_text_features(
                input_ids=title_inputs.input_ids, 
                attention_mask=title_inputs.attention_mask
            )
            title_features /= title_features.norm(dim=-1, keepdim=True)
            
            # Process full texts
            full_text_inputs = processor(
                text=batch_texts_full, 
                return_tensors="pt", 
                padding=True, 
                truncation=True,
                max_length=77
            ).to(device)
            
            full_text_features = model.get_text_features(
                input_ids=full_text_inputs.input_ids, 
                attention_mask=full_text_inputs.attention_mask
            )
            full_text_features /= full_text_features.norm(dim=-1, keepdim=True)
            
            # Process images
            image_inputs = processor(
                images=batch_images, 
                return_tensors="pt"
            ).to(device)
            
            image_features = model.get_image_features(
                pixel_values=image_inputs.pixel_values
            )
            image_features /= image_features.norm(dim=-1, keepdim=True)
            
            # Create multimodal embeddings
            multimodal_features = torch.cat((full_text_features, image_features), dim=1)
            multimodal_features /= multimodal_features.norm(dim=-1, keepdim=True)
            
            # Classification using full text features
            logits_per_text = (full_text_features @ category_embeddings.T).softmax(dim=-1)
            
            # Get top-k predictions for metrics calculation
            top_k_scores, top_k_label_indices = logits_per_text.cpu().topk(len(APOD_LABELS), dim=-1) # Get all labels for metrics
            
            # Prepare results
            results = []
            embedding_batch = EmbeddingBatch()
            top_k_predictions_batch = []
            
            for i, idx in enumerate(batch_indices):
                predicted_category = APOD_LABELS[top_k_label_indices[i, 0].item()]
                confidence_score = top_k_scores[i, 0].item()
                
                results.append({
                    'index': idx,
                    'predicted_category': predicted_category,
                    'confidence_score': confidence_score
                })
                
                # Add embeddings to batch
                embedding_batch.add(
                    title_features[i:i+1].cpu().numpy(),
                    full_text_features[i:i+1].cpu().numpy(),
                    image_features[i:i+1].cpu().numpy(),
                    multimodal_features[i:i+1].cpu().numpy(),
                    idx
                )
                
                # Store top-k predicted labels for this item
                top_k_predictions_batch.append([APOD_LABELS[j.item()] for j in top_k_label_indices[i]])
            
            return results, embedding_batch, top_k_predictions_batch
    
    except Exception as e:
        print(f"Error processing batch: {e}")
        return [], EmbeddingBatch(), []

def generate_clip_categorized_data(ground_truth_csv="ground_truth.csv"):
    print("Loading CLIP model and processor...")
    model = CLIPModel.from_pretrained("laion/CLIP-ViT-B-32-laion2B-s34B-b79K")
    processor = CLIPProcessor.from_pretrained("laion/CLIP-ViT-B-32-laion2B-s34B-b79K")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    model.eval()
    print(f"Using device: {device}")

    # Initialize GPU metrics tracking
    gpu_metrics_start = None
    all_gpu_metrics = [] # Initialize list to store all GPU metrics
    if device == "cuda":
        gpu_metrics_start = get_comprehensive_gpu_metrics(0)

    print(f"Reading data from {MASTER_CSV_PATH}...")
    df = pd.read_csv(MASTER_CSV_PATH)

    # Filter for image media types and valid URLs
    df_images = df[df['media_type'] == 'image'].copy()
    df_images = df_images.dropna(subset=['url'])

    print(f"Found {len(df_images)} image entries to process.")

    # Preload and validate images
    df_valid, image_paths = preload_valid_images(df_images)

    # Create embeddings directory
    os.makedirs(EMBEDDINGS_DIR, exist_ok=True)

    # Prepare category text embeddings once
    print("Preparing category embeddings...")
    category_inputs = processor(text=APOD_LABELS, return_tensors="pt", padding=True).to(device)
    with torch.no_grad():
        category_embeddings = model.get_text_features(**category_inputs)
        category_embeddings /= category_embeddings.norm(dim=-1, keepdim=True)

    results = []
    all_top_k_predictions = [] # Store all top-k predictions for semantic metrics
    current_embedding_batch = EmbeddingBatch()
    batch_counter = 0
    start_time = time.time()

    # Process in batches
    print(f"Processing {len(df_valid)} valid images in batches of {BATCH_SIZE}...")
    
    for i in tqdm(range(0, len(df_valid), BATCH_SIZE), desc="Processing batches"):
        batch_data = df_valid.iloc[i:i+BATCH_SIZE]
        batch_results, batch_embeddings, top_k_predictions_batch = process_batch(
            batch_data, model, processor, category_embeddings, device, image_paths
        )
        
        # Convert batch results to final format
        for result in batch_results:
            idx = result['index']
            row = df_valid.loc[idx]
            row_dict = row.to_dict()
            row_dict['predicted_category'] = result['predicted_category']
            row_dict['confidence_score'] = result['confidence_score']
            results.append(row_dict)
        
        # Add embeddings to current batch
        for j in range(len(batch_embeddings)):
            current_embedding_batch.add(
                batch_embeddings.title_embeddings[j],
                batch_embeddings.text_image_embeddings[j],
                batch_embeddings.image_embeddings[j],
                batch_embeddings.multimodal_embeddings[j],
                batch_embeddings.indices[j]
            )
        
        # Collect all top-k predictions
        all_top_k_predictions.extend(top_k_predictions_batch)

        # Save embeddings periodically to prevent memory overflow
        if len(current_embedding_batch) >= SAVE_EMBEDDINGS_EVERY:
            save_embeddings_batch(current_embedding_batch, batch_counter, EMBEDDINGS_DIR)
            current_embedding_batch.clear()
            batch_counter += 1
            
            # Clear GPU cache
            if device == "cuda":
                torch.cuda.empty_cache()
            gc.collect()
    
    # Save remaining embeddings
    if len(current_embedding_batch) > 0:
        save_embeddings_batch(current_embedding_batch, batch_counter, EMBEDDINGS_DIR)
        batch_counter += 1

    # Add skipped entries (images not found)
    for idx, row in df_images.iterrows():
        if idx not in image_paths:
            row_dict = row.to_dict()
            row_dict['predicted_category'] = 'Skipped_Image_Not_Found'
            row_dict['confidence_score'] = 0.0
            results.append(row_dict)

    end_time = time.time()
    duration = end_time - start_time
    print(f"CLIP-based categorization and embedding generation complete. Duration: {duration:.2f} seconds")

    # Consolidate embedding batches
    consolidate_embedding_batches(EMBEDDINGS_DIR, batch_counter)

    # Save results to CSV
    print(f"Writing categorized data to {OUTPUT_CSV_PATH}...")
    fieldnames = df.columns.tolist() + ['predicted_category', 'confidence_score']
    
    # Sort results by original index to maintain order
    results_ordered = []
    for _, row in df.iterrows():
        matching_result = next(
            (r for r in results if r['date'] == row['date']), 
            None
        )
        if matching_result:
            results_ordered.append(matching_result)
    
    with open(OUTPUT_CSV_PATH, 'w', newline='', encoding='utf-8') as f_out:
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results_ordered)
    
    print(f"Categorized data saved to {OUTPUT_CSV_PATH}")
    print(f"Embeddings saved to {EMBEDDINGS_DIR}")

    # Save GPU metrics
    if device == "cuda":
        # Collect final GPU metrics
        gpu_metrics_end = get_comprehensive_gpu_metrics(0)
        if gpu_metrics_end:
            all_gpu_metrics.append({
                'timestamp': time.strftime("%Y-%m-%d %H:%M:%S"),
                'process': 'clip_categorization_end',
                'duration_seconds': duration,
                'gpu_name': gpu_metrics_end['gpu_name'],
                'gpu_utilization_percent': gpu_metrics_end['gpu_utilization'],
                'gpu_memory_used_bytes': gpu_metrics_end['memory_used'],
                'gpu_memory_total_bytes': gpu_metrics_end['memory_total']
            })

        # Write all collected GPU metrics to CSV
        with open(GPU_METRICS_FILE, 'w', newline='') as f_metrics:
            metric_fieldnames = [
                'timestamp', 'process', 'duration_seconds', 'gpu_name', 
                'gpu_utilization_percent', 'gpu_memory_used_bytes', 'gpu_memory_total_bytes'
            ]
            metrics_writer = csv.DictWriter(f_metrics, fieldnames=metric_fieldnames)
            metrics_writer.writeheader()
            metrics_writer.writerows(all_gpu_metrics)
        print(f"GPU metrics saved to {GPU_METRICS_FILE}")

    # Calculate semantic metrics if ground truth is available
    if os.path.exists(ground_truth_csv):
        print(f"Calculating semantic metrics using {ground_truth_csv}...")
        ground_truth_df = pd.read_csv(ground_truth_csv)
        
        # Convert results to DataFrame for easier merging
        processed_df = pd.DataFrame(results)
        
        # Merge with ground truth to align predictions and true labels
        # Use 'date' and 'title' for merging, assuming they are unique identifiers
        merged_df = pd.merge(processed_df, ground_truth_df, on=['date', 'title'], how='inner')
        
        if not merged_df.empty:
            true_labels = merged_df['true_category'].tolist()
            
            # Map all_top_k_predictions back to the order of merged_df
            # Create a mapping from (date, title) to its corresponding top-k predictions
            top_k_map = {}
            for i, row in df_valid.iterrows(): # Use df_valid as it contains original indices
                key = (row['date'], row['title'])
                # Find the index of this row in the original df_valid to get its top-k predictions
                original_idx = df_valid.index.get_loc(i)
                if original_idx < len(all_top_k_predictions):
                    top_k_map[key] = all_top_k_predictions[original_idx]

            predictions_for_metrics = []
            for _, row in merged_df.iterrows():
                key = (row['date'], row['title'])
                predictions_for_metrics.append(top_k_map.get(key, []))

            top1_accuracy = calculate_top_n_accuracy(predictions_for_metrics, true_labels, n=1)
            top3_accuracy = calculate_top_n_accuracy(predictions_for_metrics, true_labels, n=3)
            mrr = calculate_mrr(predictions_for_metrics, true_labels)
            precision_at_1 = calculate_precision_at_k(predictions_for_metrics, true_labels, k=1)
            
            semantic_metrics = {
                'top1_accuracy': top1_accuracy,
                'top3_accuracy': top3_accuracy,
                'mrr': mrr,
                'precision_at_1': precision_at_1
            }
            
            semantic_metrics_filename = "data/semantic_metrics_clip.csv"
            with open(semantic_metrics_filename, 'w', newline='') as f_sem_metrics:
                writer = csv.DictWriter(f_sem_metrics, fieldnames=semantic_metrics.keys())
                writer.writeheader()
                writer.writerow(semantic_metrics)
            print(f"Semantic metrics saved to {semantic_metrics_filename}")
        else:
            print("No matching entries found between processed data and ground truth for semantic metrics calculation.")
    else:
        print(f"Ground truth file {ground_truth_csv} not found. Skipping semantic metrics calculation.")

    # Clean up
    if device == "cuda":
        torch.cuda.empty_cache()
    gc.collect()
    
    print("Processing complete.")

if __name__ == '__main__':
    generate_clip_categorized_data()