import chromadb
import numpy as np
import pandas as pd
from sklearn.manifold import TSNE
import umap
import matplotlib.pyplot as plt
import seaborn as sns
from collections import Counter
import time
import warnings
import os
from concurrent.futures import ThreadPoolExecutor
warnings.filterwarnings('ignore')

# --- CONFIGURATION ---
CHROMADB_PATH = "apod_chroma_db"
COLLECTION_NAME = "apod_embeddings"
CATEGORIZED_CSV_PATH = "data/apod_categorized.csv"
OUTPUT_DIR = "plots/"
DPI = 300
FIGURE_SIZE = (14, 10)
ENHANCED_FIGURE_SIZE = (18, 8)

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_chromadb_data():
    """
    Efficiently retrieves embeddings and metadata from ChromaDB.
    """
    print("Connecting to ChromaDB...")
    client = chromadb.PersistentClient(path=CHROMADB_PATH)

    try:
        collection = client.get_collection(COLLECTION_NAME)
    except ValueError:
        print(f"Error: The '{COLLECTION_NAME}' collection does not exist.")
        print("Please run the 'process_apod.py' script first to create and populate the database.")
        return None, None, None

    print("Retrieving embeddings and metadata from ChromaDB...")
    start_time = time.time()
    
    # Get all data including embeddings, documents, and metadata
    embeddings_data = collection.get(include=['embeddings', 'documents', 'metadatas'])
    
    embeddings = np.array(embeddings_data['embeddings'])
    documents = embeddings_data['documents']
    metadatas = embeddings_data['metadatas'] if embeddings_data['metadatas'] else []
    ids = embeddings_data['ids']
    
    load_time = time.time() - start_time
    print(f"Retrieved {len(embeddings)} embeddings in {load_time:.2f} seconds")
    
    if len(embeddings) == 0:
        print("No embeddings found in the collection.")
        return None, None, None
    
    return embeddings, documents, metadatas, ids

def load_categories():
    """
    Loads category data from CSV file efficiently.
    """
    print(f"Loading categories from {CATEGORIZED_CSV_PATH}...")
    try:
        df = pd.read_csv(CATEGORIZED_CSV_PATH)
        return df['category'].tolist() if 'category' in df.columns else []
    except FileNotFoundError:
        print(f"Warning: {CATEGORIZED_CSV_PATH} not found. Using default categories.")
        return []
    except Exception as e:
        print(f"Error loading categories: {e}")
        return []

def perform_dimensionality_reduction(embeddings, method='tsne', n_components=2):
    """
    Performs optimized dimensionality reduction.
    """
    print(f"Performing {method.upper()} dimensionality reduction on {len(embeddings)} embeddings...")
    start_time = time.time()
    
    if method == 'tsne':
        # Optimized t-SNE parameters
        perplexity = min(30, max(5, len(embeddings) // 4))
        reducer = TSNE(
            n_components=n_components,
            perplexity=perplexity,
            max_iter=1000,  # Reduced for speed
            random_state=42,
            learning_rate='auto',
            init='pca',
            n_jobs=1  # Single thread for stability
        )
    elif method == 'umap':
        # Optimized UMAP parameters
        n_neighbors = min(15, max(5, len(embeddings) // 10))
        reducer = umap.UMAP(
            n_components=n_components,
            n_neighbors=n_neighbors,
            min_dist=0.1,
            random_state=42,
            n_jobs=1
        )
    else:
        raise ValueError("Method must be 'tsne' or 'umap'")
    
    reduced_embeddings = reducer.fit_transform(embeddings)
    
    reduction_time = time.time() - start_time
    print(f"{method.upper()} computation completed in {reduction_time:.2f} seconds")
    
    return reduced_embeddings

def create_color_mapping(categories):
    """
    Creates an optimized color mapping for categories.
    """
    unique_categories = sorted(list(set(categories)))
    n_categories = len(unique_categories)
    
    # Use different color palettes based on number of categories
    if n_categories <= 10:
        colors = sns.color_palette("tab10", n_categories)
    elif n_categories <= 20:
        colors = sns.color_palette("tab20", n_categories)
    else:
        colors = sns.color_palette("husl", n_categories)
    
    return {category: colors[i] for i, category in enumerate(unique_categories)}

def create_standard_plot(embeddings_2d, categories, title, filename):
    """
    Creates a standard scatter plot visualization.
    """
    print(f"Creating standard plot: {title}...")
    
    # Set up the plot
    plt.style.use('default')
    fig, ax = plt.subplots(figsize=FIGURE_SIZE, dpi=DPI)
    
    # Create color mapping
    category_to_color = create_color_mapping(categories)
    
    # Plot each category separately for better legend control
    for category in sorted(category_to_color.keys()):
        mask = np.array(categories) == category
        if np.any(mask):
            ax.scatter(
                embeddings_2d[mask, 0], 
                embeddings_2d[mask, 1],
                c=[category_to_color[category]], 
                label=category,
                alpha=0.7,
                s=25,
                edgecolors='white',
                linewidth=0.3
            )
    
    # Customize the plot
    ax.set_title(title, fontsize=16, fontweight='bold', pad=20)
    ax.set_xlabel('Dimension 1', fontsize=12)
    ax.set_ylabel('Dimension 2', fontsize=12)
    ax.grid(True, alpha=0.3)
    
    # Add legend
    legend = ax.legend(
        bbox_to_anchor=(1.05, 1), 
        loc='upper left',
        frameon=True,
        fancybox=True,
        shadow=True,
        title="Categories",
        title_fontsize=12
    )
    legend.get_frame().set_facecolor('white')
    legend.get_frame().set_alpha(0.9)
    
    # Remove top and right spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    
    plt.tight_layout()
    
    # Save the plot
    output_path = os.path.join(OUTPUT_DIR, filename)
    plt.savefig(output_path, dpi=DPI, bbox_inches='tight', 
                facecolor='white', edgecolor='none')
    plt.close()
    
    print(f"Plot saved to {output_path}")

def create_enhanced_plot(embeddings_2d, categories, title, filename):
    """
    Creates an enhanced plot with additional statistics and insights.
    """
    print(f"Creating enhanced plot: {title}...")
    
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=ENHANCED_FIGURE_SIZE, dpi=DPI)
    
    # Main scatter plot
    category_to_color = create_color_mapping(categories)
    
    for category in sorted(category_to_color.keys()):
        mask = np.array(categories) == category
        if np.any(mask):
            ax1.scatter(
                embeddings_2d[mask, 0], 
                embeddings_2d[mask, 1],
                c=[category_to_color[category]], 
                label=category,
                alpha=0.7,
                s=20,
                edgecolors='white',
                linewidth=0.3
            )
    
    ax1.set_title(title, fontsize=14, fontweight='bold')
    ax1.set_xlabel('Dimension 1', fontsize=11)
    ax1.set_ylabel('Dimension 2', fontsize=11)
    ax1.grid(True, alpha=0.3)
    ax1.legend(bbox_to_anchor=(1.05, 1), loc='upper left', fontsize=9)
    
    # Category distribution
    category_counts = Counter(categories)
    categories_sorted = sorted(category_counts.keys())
    counts = [category_counts[cat] for cat in categories_sorted]
    colors = [category_to_color[cat] for cat in categories_sorted]
    
    bars = ax2.bar(range(len(categories_sorted)), counts, color=colors, alpha=0.7)
    ax2.set_title('Category Distribution', fontsize=14, fontweight='bold')
    ax2.set_xlabel('Category', fontsize=11)
    ax2.set_ylabel('Count', fontsize=11)
    ax2.set_xticks(range(len(categories_sorted)))
    ax2.set_xticklabels(categories_sorted, rotation=45, ha='right', fontsize=9)
    ax2.grid(True, alpha=0.3, axis='y')
    
    # Add count labels on bars
    for bar, count in zip(bars, counts):
        height = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                f'{count}', ha='center', va='bottom', fontsize=9, fontweight='bold')
    
    # Distribution of points in 2D space (density plot)
    ax3.hexbin(embeddings_2d[:, 0], embeddings_2d[:, 1], gridsize=30, cmap='Blues', alpha=0.7)
    ax3.set_title('Point Density Distribution', fontsize=14, fontweight='bold')
    ax3.set_xlabel('Dimension 1', fontsize=11)
    ax3.set_ylabel('Dimension 2', fontsize=11)
    
    # Category statistics
    stats_text = f"Total Points: {len(embeddings_2d)}\n"
    stats_text += f"Categories: {len(category_counts)}\n"
    stats_text += f"Largest Category: {max(category_counts, key=category_counts.get)} ({max(category_counts.values())})\n"
    stats_text += f"Smallest Category: {min(category_counts, key=category_counts.get)} ({min(category_counts.values())})\n"
    stats_text += f"Mean per Category: {np.mean(list(category_counts.values())):.1f}\n"
    stats_text += f"Std per Category: {np.std(list(category_counts.values())):.1f}"
    
    ax4.text(0.05, 0.95, stats_text, transform=ax4.transAxes, fontsize=11,
             verticalalignment='top', bbox=dict(boxstyle='round', facecolor='lightgray', alpha=0.8))
    ax4.set_title('Dataset Statistics', fontsize=14, fontweight='bold')
    ax4.axis('off')
    
    plt.tight_layout()
    
    # Save the enhanced plot
    output_path = os.path.join(OUTPUT_DIR, filename)
    plt.savefig(output_path, dpi=DPI, bbox_inches='tight', 
                facecolor='white', edgecolor='none')
    plt.close()
    
    print(f"Enhanced plot saved to {output_path}")

def visualize_embeddings():    """    Main function to create optimized embeddings visualizations for different types.    """    total_start_time = time.time()        # Load categories once    categories_df = pd.read_csv(CATEGORIZED_CSV_PATH)    # Ensure 'category' column exists, otherwise use a placeholder    if 'predicted_category' not in categories_df.columns:        print(f"Warning: 'predicted_category' column not found in {CATEGORIZED_CSV_PATH}. Using default categories.")        categories_df['predicted_category'] = 'Unknown'    embedding_types_to_process = {        'title': 'Title Embeddings',        'text_image': 'Title + Explanation Embeddings',        'multimodal': 'Multimodal Embeddings'    }    methods = ['tsne', 'umap']        for emb_key, emb_name in embedding_types_to_process.items():        print(f"\n--- Processing {emb_name} ---")        embeddings, indices = load_embeddings_from_npy(emb_key)                if embeddings is None or indices is None:            continue        # Align categories with loaded embeddings based on indices        # Create a series from categories_df with original DataFrame index        aligned_categories = categories_df.loc[indices, 'predicted_category'].tolist()                for method in methods:            print(f"\n--- Performing {method.upper()} for {emb_name} ---")                        # Perform dimensionality reduction            embeddings_2d = perform_dimensionality_reduction(embeddings, method=method)                        # Create standard plot            title = f'{emb_name} ({method.upper()}) Visualization'            create_standard_plot(                embeddings_2d,                 aligned_categories,                 title,                f'{emb_key}_{method}.png'            )                        # Create enhanced plot            create_enhanced_plot(                embeddings_2d,                 aligned_categories,                 title,                f'{emb_key}_{method}_enhanced.png'            )        total_time = time.time() - total_start_time    print(f"\n--- All visualizations completed in {total_time:.2f} seconds ---")    print(f"PNG files saved in: {OUTPUT_DIR}")if __name__ == '__main__':    visualize_embeddings()