
import chromadb
from sentence_transformers import SentenceTransformer

def query_database(query_text, n_results=5):
    """
    Queries the ChromaDB database to find entries semantically similar to the query text.
    """
    # Initialize the sentence transformer model
    model = SentenceTransformer('all-MiniLM-L6-v2')

    # Use a persistent client to access the database
    client = chromadb.PersistentClient(path="apod_chroma_db")

    # Get the collection
    try:
        collection = client.get_collection("apod_embeddings")
    except ValueError:
        print("Error: The 'apod_embeddings' collection does not exist.")
        print("Please run the 'process_apod.py' script first to create and populate the database.")
        return

    # Generate the embedding for the query text
    query_embedding = model.encode([query_text])

    # Query the collection
    results = collection.query(
        query_embeddings=query_embedding.tolist(),
        n_results=n_results
    )

    print(f"Top {n_results} results for query: '{query_text}'")
    print("-" * 30)
    for i, metadata in enumerate(results['metadatas'][0]):
        print(f"{i+1}. {metadata['date']} - {metadata['title']}")

if __name__ == '__main__':
    user_query = input("Enter a search query (e.g., 'red planets', 'distant galaxies'): ")
    if user_query:
        query_database(user_query)
