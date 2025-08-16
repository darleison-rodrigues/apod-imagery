-- D1 Database Schema for APOD Metadata (Development Environment)
CREATE TABLE IF NOT EXISTS apod_metadata_dev (
    date TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    image_url TEXT NOT NULL,
    r2_url TEXT NOT NULL,
    category TEXT,
    confidence REAL,
    image_description TEXT,
    copyright TEXT,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_relevant INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    embeddings_generated INTEGER DEFAULT 0 -- New column to flag if embeddings have been generated
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_apod_date ON apod_metadata_dev(date);
CREATE INDEX IF NOT EXISTS idx_apod_category ON apod_metadata_dev(category);
CREATE INDEX IF NOT EXISTS idx_apod_relevant ON apod_metadata_dev(is_relevant);
CREATE INDEX IF NOT EXISTS idx_apod_processed_at ON apod_metadata_dev(processed_at);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_apod_metadata_timestamp
    AFTER UPDATE ON apod_metadata_dev
    BEGIN
        UPDATE apod_metadata_dev SET updated_at = CURRENT_TIMESTAMP WHERE date = NEW.date;
    END;