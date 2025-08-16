CREATE TABLE apod_metadata (
    date TEXT PRIMARY KEY,
    title TEXT,
    explanation TEXT,
    image_url TEXT,
    r2_url TEXT,
    category TEXT,
    confidence REAL,
    image_description TEXT,
    copyright TEXT,
    processed_at TEXT,
    is_relevant INTEGER
);
