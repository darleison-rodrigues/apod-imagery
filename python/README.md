# apod-imagery

This project implements a comprehensive pipeline for processing NASA APOD (Astronomy Picture of the Day) data. It automates the fetching of data, generates semantic embeddings for text and images, and stores them in a vector database for efficient similarity search and classification. The project also includes scripts for evaluating different classification models and visualizing the embedding space.

## Project Structure

```
├── data/                     # Raw and processed data, including embeddings and vector DB
├── db/                       # Scripts related to database schema
├── src/
│   ├── data_processing/      # Scripts for fetching and processing APOD data
│   ├── ml_models/            # Scripts for ML models, embedding, and classification
│   ├── plots/                  # Output for embedding visualizations
│   └── utils/                  # Utility scripts, e.g., for metrics
└── README.md
```

## Pipeline Overview

1.  **Data Ingestion**: The `src/data_processing/process_apod.py` script fetches all APOD entries from the NASA API, from its inception in 1995 to the present day. It handles rate limiting and saves the data to `data/apod_master_data.csv`.

2.  **Text and Image Embeddings**: Machine learning models are used to generate semantic embeddings from the APOD titles, descriptions, and images. This allows for a deeper understanding of the content beyond simple keywords.

3.  **Vector Database Storage**: The generated embeddings are stored in a ChromaDB vector database. The `src/ml_models/chroma_db_manager.py` script manages the database, including the creation of collections and the addition of embeddings.

4.  **Semantic Search**: The `src/ml_models/query_apod.py` script provides a command-line interface to perform semantic searches on the APOD database. You can find entries based on concepts and phrases, not just keywords. For example, searching for "red planets" will return entries about Mars, even if the word "Mars" is not in the description.

5.  **Classification**: The `src/ml_models/fastclassifier.py` script uses a fast sentence-embedding-based approach to classify APOD entries into categories like "Galaxy," "Nebula," "Planet," etc. It also includes a comparison with other zero-shot classification models.

6.  **Visualization**: The project includes scripts to visualize the high-dimensional embedding space using techniques like t-SNE and UMAP, helping to understand the relationships between different APOD entries. The output visualizations are saved in the `src/plots/` directory.

## Key Technologies

*   **Python**: The core language for all scripts.
*   **Requests**: For fetching data from the NASA APOD API.
*   **Sentence-Transformers**: For generating high-quality sentence embeddings.
*   **ChromaDB**: For storing and querying vector embeddings efficiently.
*   **Scikit-learn**: For machine learning tasks and metrics.
*   **Transformers**: For using state-of-the-art models from Hugging Face.
*   **Pandas**: For data manipulation and analysis.
*   **Matplotlib/Seaborn**: For generating plots and visualizations.