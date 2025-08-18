-- Add last_processed_at column to apod_metadata_dev table
ALTER TABLE apod_metadata_dev
ADD COLUMN last_processed_at DATETIME DEFAULT NULL;

-- Create an index for faster queries on last_processed_at
CREATE INDEX IF NOT EXISTS idx_apod_last_processed_at ON apod_metadata_dev(last_processed_at);