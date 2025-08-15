# db/vectorize_schema.py

# Cloudflare Vectorize Core Vector Configuration
VECTORIZE_INDEX_CONFIG = {
  "dimensions": 384,
  "distance_metric": "cosine",
  "metadata_config": {
    "indexed_fields": ["category", "date", "media_type", "has_objects"],
    "filterable_fields": ["category", "date_year", "date_month", "media_type", "copyright_status"]
  }
}

# Cloudflare Vectorize Improved Metadata Structure Example
VECTORIZE_METADATA_EXAMPLE = {
  "id": "1995-06-16",
  "namespace": "apod_v1",
  "values": [0.123, 0.456, 0.789], # Placeholder for actual embedding values
  "metadata": {
    # Core fields (always present)
    "title": "The Lagoon Nebula",
    "date": "1995-06-16",
    "date_year": 1995,
    "date_month": 6,
    "category": "nebula",
    "media_type": "image",
    "image_url": "https://apod.nasa.gov/apod/image/9506/lagoon_hst_big.jpg",
    
    # Content summary (for efficient retrieval)
    "explanation_excerpt": "The Lagoon Nebula is a giant interstellar cloud...",
    "explanation_length": 1247,
    "has_technical_content": True,
    
    # Classification fields
    "objects_detected": ["nebula", "star_formation"],
    "primary_object": "nebula",
    "secondary_objects": ["stars", "dust_clouds"],
    
    # Operational metadata
    "copyright_status": "nasa_public",
    "copyright": "NASA, STScI",
    "embedding_model": "all-MiniLM-L6-v2",
    "embedding_version": "v1.0",
    "processed_date": "2024-01-15",
    "quality_score": 0.95,
    
    # Future-ready fields (nullable)
    "spectral_features": None,
    "color_analysis": None,
    "brightness_magnitude": None
  }
}
