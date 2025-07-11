
import csv
import os
import requests
from transformers import pipeline
from datetime import datetime
from dotenv import load_dotenv
import torch # Import torch

load_dotenv()

# Define the categories for classification
CATEGORIES = ["Galaxy", "Nebula", "Star Cluster", "Planet", "Comet", "Asteroid", "Supernova", "Black Hole", "Dark Matter", "Cosmology"]

# Initialize the zero-shot classification pipeline
print("Initializing zero-shot classification pipeline...")
# Check for GPU availability and get device information
if torch.cuda.is_available():
    device = 0  # Use GPU 0
    gpu_name = torch.cuda.get_device_name(0)
    print(f"Using GPU: {gpu_name}")
else:
    device = -1  # Use CPU
    print("Using CPU.")

classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli", device=device)

def categorize_text(text):
    """
    Categorizes the given text using a zero-shot classification model.
    """
    result = classifier(text, CATEGORIES)
    return result['labels'][0]

def get_image_url(date_str):
    """
    Gets the image URL from the NASA APOD API for a given date.
    """
    # The API expects the date in YYYY-MM-DD format
    try:
        # First, try to parse the date in the format 'YYYY Month DD'
        date_obj = datetime.strptime(date_str, '%Y %B %d')
    except ValueError:
        # If that fails, try the format 'Month DD, YYYY'
        date_obj = datetime.strptime(date_str, '%B %d, %Y')

    api_date = date_obj.strftime('%Y-%m-%d')
    api_key = os.getenv("NASA_API_KEY")
    if not api_key:
        api_key = "DEMO_KEY"
        print("Warning: NASA_API_KEY not found in .env file. Using DEMO_KEY.")

    api_url = f"https://api.nasa.gov/planetary/apod?api_key={api_key}&date={api_date}"
    
    try:
        response = requests.get(api_url)
        response.raise_for_status()  # Raise an exception for bad status codes
        data = response.json()
        return data
    except requests.exceptions.RequestException as e:
        print(f"Error fetching image URL for {date_str}: {e}")
        return None

def download_image(url, category, title):
    """
    Downloads an image from a given URL and saves it to a category-specific folder.
    """
    if not url:
        return

    # Create a directory for the category if it doesn't exist
    if not os.path.exists(category):
        os.makedirs(category)

    # Get the image content
    try:
        response = requests.get(url)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error downloading image {url}: {e}")
        return

    # Sanitize the title to use as a filename
    sanitized_title = "".join(c for c in title if c.isalnum() or c in (' ', '-')).rstrip()
    filename = f"{category}/{sanitized_title}.jpg"

    # Save the image
    with open(filename, 'wb') as f:
        f.write(response.content)
    print(f"Downloaded: {filename}")

if __name__ == '__main__':
    # Read the CSV file
    with open('apod.csv', 'r') as f:
        reader = csv.DictReader(f)
        apod_data = list(reader)

    # Get user input for the category
    print("Available categories:", ", ".join(CATEGORIES))
    selected_category = input("Enter a category to download images for: ")

    if selected_category not in CATEGORIES:
        print("Invalid category.")
    else:
        for item in apod_data:
            title = item['title']
            date = item['date']
            
            # Categorize the title
            category = categorize_title(title)
            
            if category == selected_category:
                print(f"Found a match: '{title}' in category '{category}'")
                api_data = get_image_url(date)
                if api_data:
                    image_url = api_data.get('hdurl') or api_data.get('url')
                    # The date is already available in the item['date']
                    # The explanation is in api_data.get('explanation')
                    # The media_type is in api_data.get('media_type')
                    download_image(image_url, category, title)
