# apod-imagery

## Architecture Overview

```mermaid
graph TD
    subgraph "Data Ingestion & Processing"
        A[NASA APOD API] --> B{Python Script: process_apod.py}
        B --> C[Extract Title, Explanation, Image URL, Metadata]
        C --> D[Local Storage: apod_master_data.csv]
        D --> E{Python Script: download_all_images.py}
        E --> F[Local Storage: images/]
        D --> G{Python Script: generate_embeddings.py}
        G --> H[Cloudflare Vectorize: Embeddings DB]
        F --> I{Python Script: upload_to_cloudflare_images.py}
        I --> J[Cloudflare Images: Image Storage]
    end

    subgraph "Web Application & Frontend"
        K[React Frontend (Cloudflare Pages)] --> L{User Search Query / Timeline Interaction}
        L --> M(Cloudflare Worker: API Gateway)
        M --> H
        M --> J
        H -- Embeddings Query --> M
        J -- Image URLs --> M
        M -- Combined Data (JSON) --> K
        K --> N[D3.js / Anime.js Visualizations]
        K --> O[Display Categorized Data / APOD Details]
    end

    subgraph "Model Evaluation & Benchmarking"
        P[1. Select 200 Random Titles from apod.csv] --> Q[2. Manually Assign Correct Category]
        Q --> R[3. Create ground_truth.csv]
        R --> S[4. Download Corresponding Images]

        R --> T[Legacy BART Model Text FP32]
        R --> U[Quantized BART Model Text FP16]
        S --> V[CLIP Model Image and Text]

        T --> W["Top-1 Accuracy"]
        T --> X["Top-3 Accuracy"]
        T --> Y["Mean Reciprocal Rank (MRR)"]
        T --> Z["Performance Time per Item"]

        U --> W
        U --> X
        U --> Y
        U --> Z

        V --> W
        V --> X
        V --> Y
        V --> Z

        Z --> AA((Final Report))
        Y --> AA
        X --> AA
        W --> AA
    end

    D --> P
```

**Explanation:**

This project implements a comprehensive pipeline for processing NASA APOD (Astronomy Picture of the Day) data, generating semantic embeddings, storing images, and serving them through a performant web application. It also includes a robust model evaluation framework.

*   **Data Ingestion & Processing:**
    *   **NASA APOD API:** The primary source of APOD data.
    *   **`process_apod.py`:** A Python script that fetches APOD data, extracts relevant information (title, explanation, image URL, metadata), and stores it locally in `apod_master_data.csv`.
    *   **`download_all_images.py`:** Downloads the actual image files to a local `images/` directory for local analysis and model evaluation.
    *   **`generate_embeddings.py`:** Generates various types of embeddings (e.g., title-only, text-enriched) from `apod_master_data.csv` and pushes them to Cloudflare Vectorize.
    *   **`upload_to_cloudflare_images.py`:** (Future script) Uploads images from the local `images/` directory to Cloudflare Images for optimized global delivery.
    *   **Cloudflare Vectorize:** A vector database that stores embeddings, enabling fast semantic similarity searches.
    *   **Cloudflare Images:** Stores and optimizes all APOD images, serving them efficiently via CDN.

*   **Web Application & Frontend:**
    *   **React Frontend (Cloudflare Pages):** The client-side application, deployed on Cloudflare Pages, handles user interaction and renders the UI.
    *   **User Interaction:** Users interact with the frontend through search queries or timeline navigation.
    *   **Cloudflare Worker (API Gateway):** A serverless function acting as the backend for the frontend. It receives requests, orchestrates data retrieval from Cloudflare Vectorize and Cloudflare Images, and prepares responses.
    *   **D3.js / Anime.js Visualizations:** The React app uses these libraries to render interactive visualizations (e.g., t-SNE plots, timelines) and display categorized APOD data.

*   **Model Evaluation & Benchmarking:**
    *   **Ground Truth Creation:** A subset of APOD entries is manually categorized to create `ground_truth.csv` and corresponding images are downloaded.
    *   **Model Comparison:** Evaluates different classification models:
        *   **Legacy BART:** Original, full-precision text-based classifier.
        *   **Quantized BART:** Optimized, half-precision version of the BART model.
        *   **CLIP Model:** A multimodal model using both image and text for prediction.
    *   **Metrics Calculation:** Measures model performance using:
        *   **Top-N Accuracy:** Checks if the correct answer is within the top N predictions.
        *   **Mean Reciprocal Rank (MRR):** Assesses the ranking quality of predictions.
        *   **Performance Time per Item:** Quantifies processing speed.
        *   **GPU Metrics:** Tracks GPU utilization and memory usage during embedding generation and classification.
    *   **Final Report:** Consolidates all metrics for a comprehensive comparison.



