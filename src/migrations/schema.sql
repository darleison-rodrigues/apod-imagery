-- D1 Database Schema for APOD Metadata
CREATE TABLE IF NOT EXISTS apod_metadata (
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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_apod_date ON apod_metadata(date);
CREATE INDEX IF NOT EXISTS idx_apod_category ON apod_metadata(category);
CREATE INDEX IF NOT EXISTS idx_apod_relevant ON apod_metadata(is_relevant);
CREATE INDEX IF NOT EXISTS idx_apod_processed_at ON apod_metadata(processed_at);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_apod_metadata_timestamp 
    AFTER UPDATE ON apod_metadata
    BEGIN
        UPDATE apod_metadata SET updated_at = CURRENT_TIMESTAMP WHERE date = NEW.date;
    END;