# db/chromadb_schema.py

import chromadb
from chromadb.config import Settings

# ChromaDB Collection Setup with Metadata Schema

# Production-ready client configuration
client = chromadb.PersistentClient(
    path="/data/vectordb",
    settings=Settings(
        allow_reset=False,
        anonymized_telemetry=False
    )
)

# Create collection with explicit configuration
collection = client.get_or_create_collection(
    name="apod_embeddings_v1",
    embedding_function=None,  # We'll provide embeddings directly
    metadata={"version": "1.0", "model": "all-MiniLM-L6-v2"}
)

# Enhanced Metadata Structure for ChromaDB
CHROMADB_METADATA_SCHEMA = {
    # Core identification
    "id": "1995-06-16",
    "title": "The Lagoon Nebula",
    "date": "1995-06-16",
    "date_year": 1995,
    "date_month": 6,
    "date_day": 16,
    
    # Content classification
    "category": "nebula",
    "subcategory": "emission_nebula",
    "media_type": "image",
    "content_type": "astronomical_image",
    
    # URLs and references
    "image_url": "https://apod.nasa.gov/apod/image/9506/lagoon_hst_big.jpg",
    "hd_image_url": "https://apod.nasa.gov/apod/image/9506/lagoon_hst_big.jpg",
    "source_url": "https://apod.nasa.gov/apod/ap950616.html",
    
    # Full content (advantage of local storage)
    "explanation": "The Lagoon Nebula is a giant interstellar cloud...",
    "explanation_word_count": 156,
    "explanation_reading_time": 45,  # seconds
    
    # Object detection and classification
    "objects_detected": ["nebula", "star_formation", "dust_lanes"],
    "primary_object_type": "nebula",
    "object_count": 3,
    "has_stellar_objects": True,
    
    # Technical metadata
    "copyright": "NASA, STScI",
    "copyright_status": "public_domain",
    "instrument": "HST",
    "telescope": "Hubble Space Telescope",
    "wavelength": "optical",
    
    # Processing metadata
    "embedding_model": "all-MiniLM-L6-v2",
    "embedding_version": "1.0",
    "processed_timestamp": "2024-01-15T10:30:00Z",
    "processing_pipeline_version": "v2.1",
    "quality_metrics": {
        "image_quality": 0.95,
        "text_quality": 0.89,
        "embedding_confidence": 0.92
    },
    
    # Advanced features (future-ready)
    "color_palette": ["#FF6B6B", "#4ECDC4", "#45B7D1"],
    "dominant_colors": ["red", "blue", "white"],
    "brightness_distribution": [0.2, 0.3, 0.4, 0.1],
    "spectral_lines": ["H_alpha", "OIII", "H_beta"],
    
    # Semantic enrichment
    "keywords": ["nebula", "star_formation", "interstellar", "hydrogen"],
    "concepts": ["stellar_nursery", "ionized_gas", "emission_spectrum"],
    "difficulty_level": "intermediate",
    "educational_topics": ["star_formation", "nebulae", "astrophysics"],
    
    # Relationships
    "related_apods": ["1995-06-17", "1995-06-15"],
    "constellation": "Sagittarius",
    "season_visibility": "summer",
    "celestial_coordinates": {
        "ra": "18h 03m 37s",
        "dec": "-24° 23' 12\"",
        "galactic_lon": 6.0,
        "galactic_lat": -1.9
    }
}