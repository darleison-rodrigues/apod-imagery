import os
import pandas as pd
import numpy as np
from sklearn.manifold import TSNE
import umap
import plotly.express as px
import plotly.graph_objects as go
from PIL import Image
import base64
from io import BytesIO
from tqdm import tqdm

# --- CONFIGURATION ---
CATEGORIZED_CSV_PATH = "data/apod_broad_categorization.csv"
EMBEDDINGS_DIR = "data/embeddings/"
IMAGE_DIR = "images/"
PLOTS_DIR = "plots/"

# Ensure plots directory exists
os.makedirs(PLOTS_DIR, exist_ok=True)

def load_data():
    """Loads categorized data and embeddings."""
    print(f"Loading categorized data from {CATEGORIZED_CSV_PATH}...")
    df = pd.read_csv(CATEGORIZED_CSV_PATH)

    print(f"Loading embeddings from {EMBEDDINGS_DIR}...")
    title_embeddings = np.load(os.path.join(EMBEDDINGS_DIR, 'title_embeddings.npy'))
    text_image_embeddings = np.load(os.path.join(EMBEDDINGS_DIR, 'text_image_embeddings.npy'))
    image_embeddings = np.load(os.path.join(EMBEDDINGS_DIR, 'image_embeddings.npy'))
    multimodal_embeddings = np.load(os.path.join(EMBEDDINGS_DIR, 'multimodal_embeddings.npy'))
    
    # Load the indices to align embeddings with DataFrame
    embedding_indices = np.load(os.path.join(EMBEDDINGS_DIR, 'embedding_indices.npy'))
    
    # Filter df to only include entries for which embeddings were generated
    df_filtered = df[df.index.isin(embedding_indices)].copy()
    # Reindex df_filtered to match the order of embeddings
    df_filtered = df_filtered.loc[embedding_indices].reset_index(drop=True)

    return df_filtered, {
        'title': title_embeddings,
        'text_image': text_image_embeddings,
        'image': image_embeddings,
        'multimodal': multimodal_embeddings
    }

def get_image_thumbnail_base64(date_str, image_url):
    """Generates a base64 encoded thumbnail for an image."""
    file_extension = os.path.splitext(image_url)[1] if os.path.splitext(image_url)[1] else ".jpg"
    if '?' in file_extension:
        file_extension = ".jpg"
    local_image_path = os.path.join(IMAGE_DIR, f"{date_str}{file_extension}")

    if not os.path.exists(local_image_path):
        return ""
    
    try:
        img = Image.open(local_image_path).convert("RGB")
        img.thumbnail((128, 128)) # Create a small thumbnail
        buffered = BytesIO()
        img.save(buffered, format="JPEG")
        return base64.b64encode(buffered.getvalue()).decode("utf-8")
    except Exception as e:
        print(f"Error creating thumbnail for {local_image_path}: {e}")
        return ""

def perform_dimensionality_reduction(embeddings, method='tsne', n_components=2):
    """Performs dimensionality reduction using t-SNE or UMAP."""
    print(f"Performing {method.upper()} dimensionality reduction...")
    if method == 'tsne':
        reducer = TSNE(n_components=n_components, random_state=42, perplexity=30)
    elif method == 'umap':
        reducer = umap.UMAP(n_components=n_components, random_state=42, n_neighbors=15, min_dist=0.1)
    else:
        raise ValueError("Method must be 'tsne' or 'umap'")
    
    reduced_embeddings = reducer.fit_transform(embeddings)
    return reduced_embeddings

def create_interactive_plot(df, reduced_embeddings, title, filename, image_thumbnails=None):
    """Creates and saves an interactive Plotly scatter plot."""
    print(f"Creating plot: {title}...")
    df['x'] = reduced_embeddings[:, 0]
    df['y'] = reduced_embeddings[:, 1]

    hover_data = {'date': True, 'title': True, 'predicted_category': True, 'confidence_score': ':.2f'}
    if image_thumbnails is not None:
        df['thumbnail'] = image_thumbnails
        hover_data['thumbnail'] = False # Don't show in default hover, will use customdata

    fig = px.scatter(
        df,
        x='x',
        y='y',
        color='predicted_category',
        title=title,
        hover_data=hover_data,
        color_discrete_sequence=px.colors.qualitative.Pastel
    )

    if image_thumbnails is not None:
        fig.update_traces(
            customdata=df['thumbnail'],
            hovertemplate=
                '<b>Date</b>: %{customdata[0]}<br>' +
                '<b>Title</b>: %{customdata[1]}<br>' +
                '<b>Category</b>: %{customdata[2]}<br>' +
                '<b>Confidence</b>: %{customdata[3]:.2f}<br>' +
                '<extra></extra>' # This removes the default trace name
        )
        # Custom hover template to include image
        fig.update_traces(hovertemplate=None)
        fig.update_layout(
            hoverlabel=dict(bgcolor="white", font_size=12, font_family="Arial"),
            hovermode="closest"
        )
        # Add custom hover behavior for images
        fig.data[0].hovertemplate = (
            '<b>Date</b>: %{customdata[0]}<br>' +
            '<b>Title</b>: %{customdata[1]}<br>' +
            '<b>Category</b>: %{customdata[2]}<br>' +
            '<b>Confidence</b>: %{customdata[3]:.2f}<br>' +
            '<img src="data:image/jpeg;base64,%{customdata[4]}" width="128" height="128"><br>' +
            '<extra></extra>'
        )
        # Update customdata to include all hover_data fields + thumbnail
        fig.update_traces(customdata=np.stack((df['date'], df['title'], df['predicted_category'], df['confidence_score'], df['thumbnail']), axis=-1))


    plot_path = os.path.join(PLOTS_DIR, filename)
    fig.write_html(plot_path)
    print(f"Plot saved to {plot_path}")

def main():
    df, embeddings_dict = load_data()

    # Generate image thumbnails once
    print("Generating image thumbnails...")
    image_thumbnails = []
    for index, row in tqdm(df.iterrows(), total=len(df), desc="Generating thumbnails"):
        image_thumbnails.append(get_image_thumbnail_base64(row['date'], row['url']))
    df['thumbnail_base64'] = image_thumbnails

    # Define embedding types and their corresponding titles
    embedding_types = {
        'title': "Title Embeddings Visualization",
        'text_image': "Title + Explanation Embeddings Visualization",
        'image': "Image Embeddings Visualization",
        'multimodal': "Multimodal (Text+Image) Embeddings Visualization"
    }

    for emb_type, title_prefix in embedding_types.items():
        current_embeddings = embeddings_dict[emb_type]
        
        # t-SNE plot
        tsne_reduced = perform_dimensionality_reduction(current_embeddings, method='tsne')
        create_interactive_plot(
            df.copy(), 
            tsne_reduced, 
            f"{title_prefix} (t-SNE)", 
            f"{emb_type}_tsne_plot.html",
            image_thumbnails=df['thumbnail_base64']
        )

        # UMAP plot
        umap_reduced = perform_dimensionality_reduction(current_embeddings, method='umap')
        create_interactive_plot(
            df.copy(), 
            umap_reduced, 
            f"{title_prefix} (UMAP)", 
            f"{emb_type}_umap_plot.html",
            image_thumbnails=df['thumbnail_base64']
        )

if __name__ == '__main__':
    main()