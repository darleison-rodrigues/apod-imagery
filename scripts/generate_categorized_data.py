
import csv
import time
import torch
from fastclassifier import FastClassifier
from metrics import get_comprehensive_gpu_metrics

# Define the categories for classification (from plan.txt)
APOD_LABELS = [
    "Galaxy", "Nebula", "Star Cluster", "Planet", "Comet", "Asteroid", "Supernova", "Black Hole", "Dark Matter", "Cosmology", "Aurora", "Rocket Launch", "Satellite", "Mars Rover", "Sun", "Moon", "Earth/Atmospheric", "Solar", "Lunar", "Human Activity", "Diagram/Illustration", "Composite/Technical"
]

def categorize_data(input_csv, output_csv):
    """
    Reads APOD data, categorizes each entry using combined title and explanation,
    and saves the result to a new CSV with confidence scores.
    """
    print("Initializing FastClassifier (embedding method)...")
    
    gpu_metrics_start = None
    if torch.cuda.is_available():
        device = 0  # Use GPU 0
        gpu_name = torch.cuda.get_device_name(0)
        print(f"Attempting to use GPU: {gpu_name}")
        gpu_metrics_start = get_comprehensive_gpu_metrics(device)
        if gpu_metrics_start is None:
            print("ERROR: GPU is available but NVML initialization failed. Exiting as requested.")
            exit() # Stop execution if NVML fails
    else:
        print("ERROR: No GPU detected. Exiting as requested.")
        exit() # Stop execution if no GPU is available

    print("Initializing FastClassifier on GPU...")

    classifier = FastClassifier('embedding')

    print(f"Reading from {input_csv}...")
    with open(input_csv, 'r', newline='', encoding='utf-8') as f_in:
        reader = csv.DictReader(f_in)
        data = list(reader)
        # Combine title and explanation for classification
        texts_to_classify = [f"{row.get('title', '')}. {row.get('explanation', '')}" for row in data]

    print(f"Found {len(texts_to_classify)} entries. Starting classification...")
    start_time = time.time()
    classified_results = classifier.classify_batch(texts_to_classify, APOD_LABELS)
    end_time = time.time()
    duration = end_time - start_time
    print("Classification complete.")

    gpu_metrics_end = None
    if torch.cuda.is_available():
        gpu_metrics_end = get_comprehensive_gpu_metrics(device)

    # Add the category and confidence to each data row
    for i, row in enumerate(data):
        # classified_results[i] is expected to be a dictionary like {'labels': [...], 'scores': [...]}
        if classified_results[i]['labels']:
            row['predicted_category'] = classified_results[i]['labels'][0]
            row['confidence_score'] = classified_results[i]['scores'][0]
        else:
            row['predicted_category'] = 'Uncategorized'
            row['confidence_score'] = 0.0

    print(f"Writing categorized data to {output_csv}...")
    with open(output_csv, 'w', newline='', encoding='utf-8') as f_out:
        # Include 'explanation' and new fields in fieldnames
        fieldnames = ['date', 'title', 'explanation', 'url', 'hdurl', 'media_type', 'copyright', 'predicted_category', 'confidence_score']
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

    # Save GPU metrics to a separate CSV
    metrics_filename = "gpu_metrics_categorization.csv"
    with open(metrics_filename, 'w', newline='') as f_metrics:
        metric_fieldnames = ['timestamp', 'process', 'duration_seconds', 'gpu_name', 'gpu_utilization_percent', 'gpu_memory_used_bytes', 'gpu_memory_total_bytes']
        metrics_writer = csv.DictWriter(f_metrics, fieldnames=metric_fieldnames)
        metrics_writer.writeheader()
        
        metrics_writer.writerow({
            'timestamp': time.strftime("%Y-%m-%d %H:%M:%S"),
            'process': 'categorization',
            'duration_seconds': duration,
            'gpu_name': gpu_metrics_start['gpu_name'] if gpu_metrics_start else 'N/A',
            'gpu_utilization_percent': gpu_metrics_end['gpu_utilization'] if gpu_metrics_end and 'gpu_utilization' in gpu_metrics_end else 'N/A',
            'gpu_memory_used_bytes': gpu_metrics_end['memory_used'] if gpu_metrics_end and 'memory_used' in gpu_metrics_end else 'N/A',
            'gpu_memory_total_bytes': gpu_metrics_end['memory_total'] if gpu_metrics_end and 'memory_total' in gpu_metrics_end else 'N/A'
        })
    print(f"GPU metrics saved to {metrics_filename}")

    print("Processing complete.")

if __name__ == '__main__':
    categorize_data('data/apod_master_data.csv', 'data/apod_broad_categorization.csv')
