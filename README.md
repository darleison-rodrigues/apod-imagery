# APOD Imagery :telescope:

> A comprehensive pipeline for processing NASA's Astronomy Picture of the Day (APOD) data with semantic search, intelligent image analysis, and interactive visualizations.

## Overview

This project provides a suite of tools for performing machine learning tasks on NASA's Astronomy Picture of the Day (APOD) archive. It includes scripts for data processing, model training, and evaluation, with a focus on semantic search, content classification, and visual discovery of space imagery.

## :guardsman: Models & Processing Pipeline

The system leverages multiple specialized AI models from Cloudflare's catalog:

| Model | Purpose | Use Case |
|-------|---------|----------|
| `@cf/llava-hf/llava-1.5-7b-hf` | **Vision-Language** | Generate descriptive captions from astronomical images |
| `@cf/baai/bge-base-en-v1.5` | **Text Embedding** | Create semantic vectors for search and similarity matching |
| `@cf/huggingface/distilbert-sst-2-int8` | **Text Classification** | Categorize APOD content by astronomical phenomena |
| `@cf/facebook/detr-resnet-50` | **Object Detection** | Identify celestial objects and structures in images |
| `@cf/microsoft/resnet-50` | **Image Classification** | Classify image types and astronomical categories |

### Processing Workflow

1. **Data Ingestion**: Fetch APOD data from NASA's API
2. **Image Analysis**: Generate captions and detect objects using vision models
3. **Text Processing**: Create embeddings and classify content
4. **Vector Storage**: Store embeddings in ChromaDB
5. **Search & Discovery**: Enable semantic search and content recommendations

## :gear: Setup and Installation

### Prerequisites

- Python 3.8+
- Pip
- Virtualenv (recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/apod-imagery.git
cd apod-imagery/python

# Create and activate a virtual environment
virtualenv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## :file_folder: Project Structure

```
apod-imagery/
├── python/
│   ├── data/
│   │   ├── processed/
│   │   └── embeddings/
│   ├── db/
│   │   ├── chromadb_schema.py
│   │   ├── schema_versioning.py
│   │   └── vectorize_schema.py
│   ├── src/
│   │   ├── data_processing/
│   │   ├── ml_models/
│   │   └── utils/
│   └── README.md
└── workers/
    └── apodimagery/
        ├── index.ts
        └── wrangler.jsonc
```
