import chromadb
from typing import List, Dict, Any

class ChromaDBManager:
    def __init__(self, path: str = "./apod_chroma_db"):
        """
        Initializes the ChromaDB client.
        :param path: The path to the ChromaDB data directory.
        """
        self.client = chromadb.PersistentClient(path=path)
        print(f"ChromaDB client initialized at: {path}")

    def get_or_create_collection(self, collection_name: str):
        """
        Gets an existing collection or creates a new one if it doesn't exist.
        :param collection_name: The name of the collection.
        :return: The ChromaDB collection object.
        """
        print(f"Getting or creating collection: {collection_name}")
        return self.client.get_or_create_collection(name=collection_name)

    def add_embeddings_to_collection(self,
                                     collection_name: str,
                                     embeddings: List[List[float]],
                                     metadatas: List[Dict[str, Any]],
                                     ids: List[str]):
        """
        Adds embeddings and their associated metadata to a specified collection.
        :param collection_name: The name of the collection.
        :param embeddings: A list of embedding vectors.
        :param metadatas: A list of dictionaries, where each dictionary contains metadata for an embedding.
        :param ids: A list of unique IDs for each embedding.
        """
        collection = self.get_or_create_collection(collection_name)
        print(f"Adding {len(embeddings)} embeddings to collection '{collection_name}'...")
        
        # ChromaDB expects embeddings as List[List[float]]
        # Ensure embeddings are converted from numpy arrays or torch tensors if necessary
        processed_embeddings = [e.tolist() if hasattr(e, 'tolist') else e for e in embeddings]

        try:
            collection.add(
                embeddings=processed_embeddings,
                metadatas=metadatas,
                ids=ids
            )
            print(f"Successfully added {len(embeddings)} embeddings.")
        except Exception as e:
            print(f"Error adding embeddings to ChromaDB: {e}")

    def query_collection(self,
                         collection_name: str,
                         query_embeddings: List[List[float]] = None,
                         query_texts: List[str] = None,
                         n_results: int = 10,
                         where: Dict[str, Any] = None,
                         where_document: Dict[str, Any] = None,
                         include: List[str] = ["metadatas", "documents", "distances"]):
        """
        Queries a collection for similar embeddings.
        :param collection_name: The name of the collection.
        :param query_embeddings: A list of embedding vectors to query with.
        :param query_texts: A list of text strings to query with (ChromaDB will embed them).
        :param n_results: The number of results to return.
        :param where: A dictionary for filtering results based on metadata.
        :param where_document: A dictionary for filtering results based on document content.
        :param include: A list of what to include in the results (e.g., "metadatas", "documents", "distances").
        :return: Query results.
        """
        collection = self.get_or_create_collection(collection_name)
        print(f"Querying collection '{collection_name}'...")
        results = collection.query(
            query_embeddings=query_embeddings,
            query_texts=query_texts,
            n_results=n_results,
            where=where,
            where_document=where_document,
            include=include
        )
        return results

    def delete_collection(self, collection_name: str):
        """
        Deletes a collection.
        :param collection_name: The name of the collection to delete.
        """
        print(f"Deleting collection: {collection_name}")
        self.client.delete_collection(name=collection_name)

    def list_collections(self):
        """
        Lists all collections in the database.
        """
        return self.client.list_collections()

# Example Usage (for testing/demonstration)
if __name__ == "__main__":
    # Ensure the apod_chroma_db directory is clean for a fresh start
    import shutil
    import os
    if os.path.exists("./apod_chroma_db"):
        shutil.rmtree("./apod_chroma_db")
        print("Cleaned existing ChromaDB directory.")

    db_manager = ChromaDBManager()
    
    # Example: Add some dummy data
    dummy_embeddings = [
        [1.1, 2.3, 3.2, 4.5],
        [1.2, 2.2, 3.1, 4.4],
        [5.1, 6.3, 7.2, 8.5],
        [5.2, 6.2, 7.1, 8.4],
    ]
    dummy_metadatas = [
        {"source": "apod", "date": "2023-01-01", "category": "galaxy"},
        {"source": "apod", "date": "2023-01-02", "category": "galaxy"},
        {"source": "apod", "date": "2023-01-03", "category": "nebula"},
        {"source": "apod", "date": "2023-01-04", "category": "nebula"},
    ]
    dummy_ids = ["doc1", "doc2", "doc3", "doc4"]

    db_manager.add_embeddings_to_collection("apod_multimodal_embeddings", dummy_embeddings, dummy_metadatas, dummy_ids)

    # Example: Query the collection
    query_results = db_manager.query_collection(
        "apod_multimodal_embeddings",
        query_embeddings=[[1.15, 2.25, 3.15, 4.45]],
        n_results=2
    )
    print("\nQuery Results:")
    for i in range(len(query_results['ids'][0])):
        print(f"  ID: {query_results['ids'][0][i]}, Distance: {query_results['distances'][0][i]}, Metadata: {query_results['metadatas'][0][i]}")

    # Example: List collections
    print("\nCollections:", db_manager.list_collections())

    # Example: Delete a collection
    # db_manager.delete_collection("apod_multimodal_embeddings")
    # print("Collections after deletion:", db_manager.list_collections())
