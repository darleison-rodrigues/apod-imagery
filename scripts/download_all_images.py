import os
import pandas as pd
import requests
import time
from tqdm import tqdm

# --- CONFIGURATION ---
MASTER_CSV_PATH = "data/apod_master_data.csv"
IMAGE_DIR = "images/"

def download_image(url, file_path):
    """Downloads a single image from a URL to a given file path."""
    try:
        response = requests.get(url, stream=True, timeout=15)
        response.raise_for_status()
        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except requests.exceptions.RequestException as e:
        print(f"\nError downloading {url}: {e}")
        return False

def download_all_images():
    """
    Reads the master CSV and downloads all missing images.
    """
    if not os.path.exists(MASTER_CSV_PATH):
        print(f"Error: Master data file not found at {MASTER_CSV_PATH}")
        print("Please run 'scripts/process_apod.py' first.")
        return

    # Create image directory if it doesn't exist
    os.makedirs(IMAGE_DIR, exist_ok=True)

    df = pd.read_csv(MASTER_CSV_PATH)

    print(f"Found {len(df)} total entries in the master data file.")

    # Filter for entries that are images
    image_df = df[df['media_type'] == 'image'].copy()
    print(f"Found {len(image_df)} entries identified as images.")

    # Use tqdm for a progress bar
    for index, row in tqdm(image_df.iterrows(), total=image_df.shape[0], desc="Downloading Images"):
        date = row['date']
        # Try to get HD URL first, fall back to standard URL
        image_url = row.get('hdurl') or row.get('url')

        if pd.isna(image_url):
            # tqdm.write(f"Skipping {date}: No URL found.")
            continue

        # Get the file extension
        file_extension = os.path.splitext(image_url)[1]
        # Handle cases with no extension or unusual query parameters
        if not file_extension or '?' in file_extension:
            file_extension = ".jpg" # Default to .jpg

        file_name = f"{date}{file_extension}"
        local_file_path = os.path.join(IMAGE_DIR, file_name)

        if os.path.exists(local_file_path):
            # tqdm.write(f"Skipping {file_name}: Already exists.")
            continue

        # tqdm.write(f"Downloading {file_name} from {image_url}")
        download_image(image_url, local_file_path)
        
        # Optional: be respectful to the server
        time.sleep(0.1)

    print("\nImage download process complete.")
    print(f"All available images are saved in the '{IMAGE_DIR}' directory.")

if __name__ == '__main__':
    download_all_images()
