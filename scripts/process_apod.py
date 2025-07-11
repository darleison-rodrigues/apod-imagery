
import csv
import re
import chromadb
from sentence_transformers import SentenceTransformer
import time

def parse_apod_data(file_path):
    """
    Parses the APOD data from the given file.
    """
    with open(file_path, 'r') as f:
        lines = f.readlines()

    # The first line is a header, skip it.
    lines = lines[1:]

    data = []
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Regex to capture the date and title
        match = re.match(r'(\d{4}\s\w+\s\d{1,2}):\s(.*)', line)
        if match:
            date_str = match.group(1)
            title = match.group(2)
            data.append({'date': date_str, 'title': title})
    return data

def write_to_csv(data, csv_file):
    """
    Writes the data to a CSV file.
    """
    with open(csv_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['date', 'title'])
        writer.writeheader()
        writer.writerows(data)

def create_and_store_embeddings(data, batch_size=5000):
    """
    Generates embeddings for the titles and stores them in ChromaDB in batches.
    """
    # Initialize the sentence transformer model
    model = SentenceTransformer('all-MiniLM-L6-v2')

    # Initialize ChromaDB client
    # Use a persistent client to save the database to disk
    client = chromadb.PersistentClient(path="apod_chroma_db")

    # Create a collection
    collection = client.get_or_create_collection("apod_embeddings")

    # Process data in batches
    for i in range(0, len(data), batch_size):
        batch_data = data[i:i + batch_size]
        
        # Extract titles for the current batch
        titles = [item['title'] for item in batch_data]

        # Generate embeddings for the current batch
        embeddings = model.encode(titles)

        # Prepare data for ChromaDB for the current batch
        ids = [str(j) for j in range(i, i + len(batch_data))]
        metadatas = [{'date': item['date'], 'title': item['title']} for item in batch_data]

        # Add data to the collection
        collection.add(
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
        print(f"Successfully processed batch {i // batch_size + 1}")

    print("Successfully created and stored all embeddings in ChromaDB.")


if __name__ == '__main__':
    apod_data = parse_apod_data('apod.txt')
    if apod_data:
        write_to_csv(apod_data, 'apod.csv')
        print("Successfully created apod.csv")
        
        start_time = time.time()
        create_and_store_embeddings(apod_data)
        end_time = time.time()
        duration = end_time - start_time
        print(f"Embedding generation and storage completed in {duration:.2f} seconds.")
    else:
        print("No data parsed from apod.txt. Please check the file format.")
