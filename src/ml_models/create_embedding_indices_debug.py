
import os
import pandas as pd
import numpy as np

MASTER_CSV_PATH = "data/apod_master_data.csv"
CATEGORIZED_CSV_PATH = "data/apod_broad_categorization.csv"
IMAGE_DIR = "images/"
EMBEDDINGS_DIR = "data/embeddings/"

def create_embedding_indices():
    print("Loading categorized data...")
    df = pd.read_csv(CATEGORIZED_CSV_PATH)
    print(f"DataFrame loaded with {len(df)} rows.")

    # Filter for image media types and valid URLs, similar to generate_clip_categorized_data.py
    df_images = df[df['media_type'] == 'image'].copy()
    df_images = df_images.dropna(subset=['url'])

    print(f"Found {len(df_images)} image entries in categorized data after filtering.")

    valid_indices = []
    for idx, row in df_images.iterrows():
        date_str = row['date']
        image_url = row.get('hdurl') or row.get('url')
        
        file_extension = os.path.splitext(image_url)[1] if os.path.splitext(image_url)[1] else ".jpg"
        if '?' in file_extension:
            file_extension = ".jpg"
        local_image_path = os.path.join(IMAGE_DIR, f"{date_str}{file_extension}")
        
        if os.path.exists(local_image_path):
            valid_indices.append(idx)
        else:
            print(f"Image file not found: {local_image_path}")
    
    print(f"Found {len(valid_indices)} valid images with corresponding local files.")

    if valid_indices:
        # Ensure the indices are sorted and unique if necessary, though iterrows should maintain order
        embedding_indices = np.array(sorted(list(set(valid_indices))))
        np.save(os.path.join(EMBEDDINGS_DIR, 'embedding_indices.npy'), embedding_indices)
        print(f"Successfully created {os.path.join(EMBEDDINGS_DIR, 'embedding_indices.npy')} with {len(embedding_indices)} indices.")
    else:
        print("No valid image indices found to create embedding_indices.npy. File not created.")

if __name__ == '__main__':
    create_embedding_indices()
