# APOD Classification Worker Setup Guide

## Project Structure
```
apod-worker/
├── src/
│   ├── index.ts                 # Main worker entry point
│   ├── types.ts                 # TypeScript type definitions
│   ├── services/
│   │   ├── processor.ts         # Main processing logic
│   │   ├── ai.ts               # AI/ML service integration
│   │   └── storage.ts          # Data storage operations
│   └── utils/
│       └── semaphore.ts        # Concurrency control utility
├── package.json                # Dependencies and scripts
├── wrangler.toml              # Cloudflare Worker configuration
├── schema.sql                 # D1 database schema
└── tsconfig.json              # TypeScript configuration
```

## Required Cloudflare Bindings

### 1. AI Binding
```toml
[ai]
binding = "AI"
```
- **Purpose**: Access to Cloudflare AI models for image-to-text, text classification, and embeddings
- **Models Used**:
  - `@cf/llava-hf/llava-1.5-7b-hf` (Image-to-text)
  - `@cf/huggingface/distilbert-sst-2-int8` (Text classification)
  - `@cf/baai/bge-base-en-v1.5` (Text embeddings)

### 2. D1 Database Binding
```toml
[[d1_databases]]
binding = "APOD_D1"
database_name = "apod-metadata"
database_id = "your-d1-database-id"
```
- **Purpose**: Store APOD metadata, classifications, and processing status
- **Tables**: `apod_metadata` (see schema.sql)

### 3. R2 Storage Binding
```toml
[[r2_buckets]]
binding = "APOD_R2"
bucket_name = "apod-images"
```
- **Purpose**: Store processed APOD images
- **File Format**: JPG images with date-based naming (`YYYY-MM-DD.jpg`)

### 4. Vectorize Binding
```toml
[[vectorize]]
binding = "VECTORIZE_INDEX"
index_name = "apod-embeddings"
```
- **Purpose**: Store and search text embeddings for semantic similarity
- **Dimensions**: 768 (BGE model output size)

## Setup Commands

### 1. Initialize Project
```bash
npm create cloudflare@latest apod-worker
cd apod-worker
npm install @cloudflare/ai
```

### 2. Generate TypeScript Types
```bash
npm run cf-typegen
```
This generates `worker-configuration.d.ts` with proper types for your bindings.

### 3. Create D1 Database
```bash
# Create database
wrangler d1 create apod-metadata

# Apply schema
wrangler d1 execute apod-metadata --file=./schema.sql

# Update wrangler.toml with the returned database_id
```

### 4. Create R2 Bucket
```bash
wrangler r2 bucket create apod-images
```

### 5. Create Vectorize Index
```bash
wrangler vectorize create apod-embeddings --dimensions=768 --metric=cosine
```

### 6. Environment Variables
Set these in your `wrangler.toml` or via dashboard:

```toml
[vars]
MAX_CONCURRENT_PROCESSING = "5"    # Concurrent AI processing limit
BATCH_SIZE = "10"                  # Items per processing batch
RETRY_ATTEMPTS = "3"               # Retry failed operations
ENABLE_DETAILED_LOGGING = "false"  # Verbose logging toggle
```

## Development Commands

```bash
# Install dependencies
npm install

# Generate types for bindings
npm run cf-typegen

# Start local development server
npm run dev

# Deploy to Cloudflare
npm run deploy

# View logs
wrangler tail

# Test D1 database
wrangler d1 execute apod-metadata --command "SELECT * FROM apod_metadata LIMIT 5"
```

## Database Operations

### Query Examples
```sql
-- Check processing status
SELECT 
    COUNT(*) as total,
    SUM(is_relevant) as relevant,
    COUNT(*) - SUM(is_relevant) as irrelevant
FROM apod_metadata;

-- Find by category
SELECT date, title, category, confidence 
FROM apod_metadata 
WHERE category = 'Galaxy' 
ORDER BY confidence DESC;

-- Recent processing
SELECT date, title, category, processed_at 
FROM apod_metadata 
ORDER BY processed_at DESC 
LIMIT 10;
```

### Backup and Restore
```bash
# Backup
wrangler d1 export apod-metadata --output=backup.sql

# Restore
wrangler d1 execute apod-metadata --file=backup.sql
```

## Monitoring and Debugging

### Key Metrics to Monitor
- Processing rate (items/second)
- AI model response times
- Storage operation success rates
- Error patterns by processing step

### Log Analysis
```bash
# Real-time logs
wrangler tail --format=pretty

# Filter by log level
wrangler tail --format=json | jq 'select(.level == "error")'
```

### Performance Tuning
- Adjust `MAX_CONCURRENT_PROCESSING` based on AI model limits
- Optimize `BATCH_SIZE` for memory usage vs. throughput
- Monitor R2 egress costs for image storage

## Security Considerations

1. **API Keys**: Store NASA API keys as encrypted secrets
2. **Rate Limits**: Respect NASA API rate limits (1000 requests/hour)
3. **Data Privacy**: Ensure APOD images comply with usage terms
4. **Access Control**: Limit worker access to necessary bindings only

## Cost Optimization

- **AI Usage**: Monitor token consumption across models
- **R2 Storage**: Implement lifecycle policies for old images
- **D1 Queries**: Use indexes for efficient data retrieval
- **Vectorize**: Optimize embedding dimensions vs. accuracy tradeoffs