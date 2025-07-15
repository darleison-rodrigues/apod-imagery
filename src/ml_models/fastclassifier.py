import torch
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from transformers import pipeline
import time

class FastClassifier:
    def __init__(self, method='embedding'):
        self.method = method
        
        if method == 'embedding':
            # Much faster for large datasets
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            self.model.to('cuda' if torch.cuda.is_available() else 'cpu')
        elif method == 'small_zeroshot':
            # Smaller zero-shot model
            self.classifier = pipeline(
                "zero-shot-classification",
                model="typeform/distilbert-base-uncased-mnli",
                device=0 if torch.cuda.is_available() else -1
            )
        elif method == 'quantized_bart':
            # Quantized BART
            self.classifier = pipeline(
                "zero-shot-classification",
                model="facebook/bart-large-mnli",
                torch_dtype=torch.float16,
                device=0 if torch.cuda.is_available() else -1
            )
    
    def classify_embedding_method(self, texts, candidate_labels, batch_size=64):
        """
        Fast classification using sentence embeddings and cosine similarity
        """
        # Encode texts and labels
        text_embeddings = self.model.encode(texts, batch_size=batch_size, show_progress_bar=True)
        label_embeddings = self.model.encode(candidate_labels)
        
        # Calculate similarities
        similarities = cosine_similarity(text_embeddings, label_embeddings)
        
        results = []
        for i, text in enumerate(texts):
            scores = similarities[i]
            sorted_indices = np.argsort(scores)[::-1]
            
            result = {
                'sequence': text,
                'labels': [candidate_labels[idx] for idx in sorted_indices],
                'scores': [float(scores[idx]) for idx in sorted_indices]
            }
            results.append(result)
        
        return results
    
    def classify_batch(self, texts, candidate_labels, batch_size=32):
        """
        Batch processing for zero-shot classification
        """
        if self.method == 'embedding':
            return self.classify_embedding_method(texts, candidate_labels, batch_size)
        
        results = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            batch_results = self.classifier(batch, candidate_labels)
            if isinstance(batch_results, list):
                results.extend(batch_results)
            else:
                results.append(batch_results)
        
        return results

# Performance comparison function
def compare_methods(texts, labels, sample_size=100):
    """
    Compare different classification methods
    """
    # Use subset for testing
    test_texts = texts[:sample_size]
    
    methods = {
        'embedding': FastClassifier('embedding'),
        'small_zeroshot': FastClassifier('small_zeroshot'),
        # 'quantized_bart': FastClassifier('quantized_bart')  # Uncomment if you want to test
    }
    
    results = {}
    
    for method_name, classifier in methods.items():
        print(f"\nTesting {method_name}...")
        start_time = time.time()
        
        try:
            classification_results = classifier.classify_batch(test_texts, labels)
            end_time = time.time()
            
            results[method_name] = {
                'time': end_time - start_time,
                'time_per_item': (end_time - start_time) / len(test_texts),
                'estimated_total_time': (end_time - start_time) / len(test_texts) * len(texts),
                'results': classification_results[:3]  # Show first 3 results
            }
            
            print(f"  Time: {end_time - start_time:.2f} seconds")
            print(f"  Time per item: {(end_time - start_time) / len(test_texts):.4f} seconds")
            print(f"  Estimated time for full dataset: {(end_time - start_time) / len(test_texts) * len(texts):.2f} seconds")
            
        except Exception as e:
            print(f"  Error: {e}")
            results[method_name] = {'error': str(e)}
    
    return results

# Example usage for APOD dataset
def classify_apod_dataset(descriptions, batch_size=64):
    """
    Optimized classification for APOD dataset
    """
    # Common APOD categories
    apod_labels = [
        "galaxy", "nebula", "star", "planet", "solar system", 
        "constellation", "asteroid", "comet", "spacecraft", 
        "telescope view", "aurora", "eclipse", "moon"
    ]
    
    # Use fastest method for large dataset
    classifier = FastClassifier('embedding')
    
    print(f"Classifying {len(descriptions)} APOD descriptions...")
    start_time = time.time()
    
    results = classifier.classify_batch(descriptions, apod_labels, batch_size=batch_size)
    
    end_time = time.time()
    print(f"Classification completed in {end_time - start_time:.2f} seconds")
    print(f"Average time per item: {(end_time - start_time) / len(descriptions):.4f} seconds")
    
    return results

# Example usage
if __name__ == "__main__":
    # Sample APOD descriptions
    sample_texts = [
        "This stunning image shows the Andromeda Galaxy in all its spiral glory",
        "The Orion Nebula glows with the light of newly formed stars",
        "Mars appears as a red dot in the night sky",
        "The Hubble Space Telescope captured this deep field image",
        "A spectacular aurora lights up the polar sky"
    ]
    
    labels = ["galaxy", "nebula", "planet", "spacecraft", "aurora", "star"]
    
    # Compare methods
    results = compare_methods(sample_texts, labels)
    
    # Print comparison
    print("\n" + "="*50)
    print("PERFORMANCE COMPARISON")
    print("="*50)
    
    for method, data in results.items():
        if 'error' not in data:
            print(f"\n{method.upper()}:")
            print(f"  Time for {len(sample_texts)} items: {data['time']:.2f}s")
            print(f"  Estimated time for 10k items: {data['estimated_total_time']:.2f}s")
            print(f"  Speed improvement: {2068.40 / data['estimated_total_time']:.1f}x faster")