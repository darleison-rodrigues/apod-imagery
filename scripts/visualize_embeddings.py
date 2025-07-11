
import chromadb
import numpy as np
from sklearn.manifold import TSNE
import matplotlib.pyplot as plt
import time

def visualize_embeddings():
    """
    Retrieves embeddings from ChromaDB, performs t-SNE, and creates a visualization.
    """
    # Use a persistent client to access the database
    client = chromadb.PersistentClient(path="apod_chroma_db")

    # Get the collection
    try:
        collection = client.get_collection("apod_embeddings")
    except ValueError:
        print("Error: The 'apod_embeddings' collection does not exist.")
        print("Please run the 'process_apod.py' script first to create and populate the database.")
        return

    # Retrieve all embeddings from the collection
    # Note: This might be slow for very large datasets.
    embeddings_data = collection.get(include=['embeddings'])
    embeddings = np.array(embeddings_data['embeddings'])

    if len(embeddings) == 0:
        print("No embeddings found in the collection.")
        return

    print(f"Found {len(embeddings)} embeddings. Performing t-SNE...")
    tsne_start_time = time.time()
    # Perform t-SNE
    # n_components=2 for 2D visualization
    # perplexity is a key parameter, typically between 5 and 50
    tsne = TSNE(n_components=2, perplexity=30, max_iter=300, random_state=42)
    embeddings_2d = tsne.fit_transform(embeddings)
    tsne_end_time = time.time()
    tsne_duration = tsne_end_time - tsne_start_time
    print(f"t-SNE computation completed in {tsne_duration:.2f} seconds.")

    print("t-SNE complete. Creating plot...")

    # Read categorized data for coloring
    import csv
    with open('apod_categorized.csv', 'r', newline='', encoding='utf-8') as f_in:
        reader = csv.DictReader(f_in)
        categorized_data = list(reader)
    
    # Ensure the order of categories matches the order of embeddings
    # This assumes that the order of data in apod_categorized.csv is the same as in ChromaDB
    # For robustness, one might retrieve metadata from ChromaDB and match by ID
    categories = [row['category'] for row in categorized_data]

    # Map categories to colors
    unique_categories = sorted(list(set(categories)))
    colors = plt.cm.get_cmap('tab20', len(unique_categories)) # Using tab20 colormap for distinct colors
    category_to_color = {category: colors(i) for i, category in enumerate(unique_categories)}
    point_colors = [category_to_color[category] for category in categories]

    # Create a scatter plot
    plt.figure(figsize=(14, 12)) # Slightly larger figure for legend
    scatter = plt.scatter(embeddings_2d[:, 0], embeddings_2d[:, 1], c=point_colors, alpha=0.6, s=15)
    plt.title('t-SNE Visualization of APOD Title Embeddings (Color-coded by Category)')
    plt.xlabel('t-SNE Dimension 1')
    plt.ylabel('t-SNE Dimension 2')
    plt.grid(True)

    # Create a legend
    handles = [plt.Line2D([0], [0], marker='o', color='w', label=category,
                          markerfacecolor=category_to_color[category], markersize=10)
               for category in unique_categories]
    plt.legend(handles=handles, title="Categories", bbox_to_anchor=(1.05, 1), loc='upper left', borderaxespad=0.)
    plt.tight_layout(rect=[0, 0, 0.85, 1]) # Adjust layout to make room for the legend

    # Save the plot to a file
    output_filename = 'apod_visualization_color_coded.png'
    plt.savefig(output_filename)
    print(f"Visualization saved to {output_filename}")
    print(f"Total visualization process completed in {time.time() - tsne_start_time:.2f} seconds.") # Total time for visualization including plotting

if __name__ == '__main__':
    visualize_embeddings()
