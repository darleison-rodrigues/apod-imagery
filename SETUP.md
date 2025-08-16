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

---
title: Evaluations · Cloudflare AI Gateway docs
description: Understanding your application's performance is essential for
  optimization. Developers often have different priorities, and finding the
  optimal solution involves balancing key factors such as cost, latency, and
  accuracy. Some prioritize low-latency responses, while others focus on
  accuracy or cost-efficiency.
lastUpdated: 2025-05-01T13:39:24.000Z
chatbotDeprioritize: false
source_url:
  html: https://developers.cloudflare.com/ai-gateway/evaluations/
  md: https://developers.cloudflare.com/ai-gateway/evaluations/index.md
---

Understanding your application's performance is essential for optimization. Developers often have different priorities, and finding the optimal solution involves balancing key factors such as cost, latency, and accuracy. Some prioritize low-latency responses, while others focus on accuracy or cost-efficiency.

AI Gateway's Evaluations provide the data needed to make informed decisions on how to optimize your AI application. Whether it is adjusting the model, provider, or prompt, this feature delivers insights into key metrics around performance, speed, and cost. It empowers developers to better understand their application's behavior, ensuring improved accuracy, reliability, and customer satisfaction.

Evaluations use datasets which are collections of logs stored for analysis. You can create datasets by applying filters in the Logs tab, which help narrow down specific logs for evaluation.

Our first step toward comprehensive AI evaluations starts with human feedback (currently in open beta). We will continue to build and expand AI Gateway with additional evaluators.

[Learn how to set up an evaluation](https://developers.cloudflare.com/ai-gateway/evaluations/set-up-evaluations/) including creating datasets, selecting evaluators, and running the evaluation process.
---
title: Set up Evaluations · Cloudflare AI Gateway docs
description: This guide walks you through the process of setting up an
  evaluation in AI Gateway. These steps are done in the Cloudflare dashboard.
lastUpdated: 2025-01-29T21:21:01.000Z
chatbotDeprioritize: false
source_url:
  html: https://developers.cloudflare.com/ai-gateway/evaluations/set-up-evaluations/
  md: https://developers.cloudflare.com/ai-gateway/evaluations/set-up-evaluations/index.md
---

This guide walks you through the process of setting up an evaluation in AI Gateway. These steps are done in the [Cloudflare dashboard](https://dash.cloudflare.com/).

## 1. Select or create a dataset

Datasets are collections of logs stored for analysis that can be used in an evaluation. You can create datasets by applying filters in the Logs tab. Datasets will update automatically based on the set filters.

### Set up a dataset from the Logs tab

1. Apply filters to narrow down your logs. Filter options include provider, number of tokens, request status, and more.
2. Select **Create Dataset** to store the filtered logs for future analysis.

You can manage datasets by selecting **Manage datasets** from the Logs tab.

Note

Please keep in mind that datasets currently use `AND` joins, so there can only be one item per filter (for example, one model or one provider). Future updates will allow more flexibility in dataset creation.

### List of available filters

| Filter category | Filter options | Filter by description |
| - | - | - |
| Status | error, status | error type or status. |
| Cache | cached, not cached | based on whether they were cached or not. |
| Provider | specific providers | the selected AI provider. |
| AI Models | specific models | the selected AI model. |
| Cost | less than, greater than | cost, specifying a threshold. |
| Request type | Universal, Workers AI Binding, WebSockets | the type of request. |
| Tokens | Total tokens, Tokens In, Tokens Out | token count (less than or greater than). |
| Duration | less than, greater than | request duration. |
| Feedback | equals, does not equal (thumbs up, thumbs down, no feedback) | feedback type. |
| Metadata Key | equals, does not equal | specific metadata keys. |
| Metadata Value | equals, does not equal | specific metadata values. |
| Log ID | equals, does not equal | a specific Log ID. |
| Event ID | equals, does not equal | a specific Event ID. |

## 2. Select evaluators

After creating a dataset, choose the evaluation parameters:

* Cost: Calculates the average cost of inference requests within the dataset (only for requests with [cost data](https://developers.cloudflare.com/ai-gateway/observability/costs/)).
* Speed: Calculates the average duration of inference requests within the dataset.
* Performance:
  * Human feedback: measures performance based on human feedback, calculated by the % of thumbs up on the logs, annotated from the Logs tab.

Note

Additional evaluators will be introduced in future updates to expand performance analysis capabilities.

## 3. Name, review, and run the evaluation

1. Create a unique name for your evaluation to reference it in the dashboard.
2. Review the selected dataset and evaluators.
3. Select **Run** to start the process.

## 4. Review and analyze results

Evaluation results will appear in the Evaluations tab. The results show the status of the evaluation (for example, in progress, completed, or error). Metrics for the selected evaluators will be displayed, excluding any logs with missing fields. You will also see the number of logs used to calculate each metric.

While datasets automatically update based on filters, evaluations do not. You will have to create a new evaluation if you want to evaluate new logs.

Use these insights to optimize based on your application's priorities. Based on the results, you may choose to:

* Change the model or [provider](https://developers.cloudflare.com/ai-gateway/providers/)
* Adjust your prompts
* Explore further optimizations, such as setting up [Retrieval Augmented Generation (RAG)](https://developers.cloudflare.com/reference-architecture/diagrams/ai/ai-rag/)
---
title: Add Human Feedback using Dashboard · Cloudflare AI Gateway docs
description: Human feedback is a valuable metric to assess the performance of
  your AI models. By incorporating human feedback, you can gain deeper insights
  into how the model's responses are perceived and how well it performs from a
  user-centric perspective. This feedback can then be used in evaluations to
  calculate performance metrics, driving optimization and ultimately enhancing
  the reliability, accuracy, and efficiency of your AI application.
lastUpdated: 2024-10-29T21:29:14.000Z
chatbotDeprioritize: false
source_url:
  html: https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback/
  md: https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback/index.md
---

Human feedback is a valuable metric to assess the performance of your AI models. By incorporating human feedback, you can gain deeper insights into how the model's responses are perceived and how well it performs from a user-centric perspective. This feedback can then be used in evaluations to calculate performance metrics, driving optimization and ultimately enhancing the reliability, accuracy, and efficiency of your AI application.

Human feedback measures the performance of your dataset based on direct human input. The metric is calculated as the percentage of positive feedback (thumbs up) given on logs, which are annotated in the Logs tab of the Cloudflare dashboard. This feedback helps refine model performance by considering real-world evaluations of its output.

This tutorial will guide you through the process of adding human feedback to your evaluations in AI Gateway using the [Cloudflare dashboard](https://dash.cloudflare.com/).

On the next guide, you can [learn how to add human feedback via the API](https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback-api/).

## 1. Log in to the dashboard

1. Log into the [Cloudflare dashboard](https://dash.cloudflare.com/) and select your account.
2. Go to **AI** > **AI Gateway**.

## 2. Access the Logs tab

1. Go to **Logs**.

2. The Logs tab displays all logs associated with your datasets. These logs show key information, including:

   * Timestamp: When the interaction occurred.
   * Status: Whether the request was successful, cached, or failed.
   * Model: The model used in the request.
   * Tokens: The number of tokens consumed by the response.
   * Cost: The cost based on token usage.
   * Duration: The time taken to complete the response.
   * Feedback: Where you can provide human feedback on each log.

## 3. Provide human feedback

1. Click on the log entry you want to review. This expands the log, allowing you to see more detailed information.

2. In the expanded log, you can view additional details such as:

   * The user prompt.
   * The model response.
   * HTTP response details.
   * Endpoint information.

3. You will see two icons:

   * Thumbs up: Indicates positive feedback.
   * Thumbs down: Indicates negative feedback.

4. Click either the thumbs up or thumbs down icon based on how you rate the model response for that particular log entry.

## 4. Evaluate human feedback

After providing feedback on your logs, it becomes a part of the evaluation process.

When you run an evaluation (as outlined in the [Set Up Evaluations](https://developers.cloudflare.com/ai-gateway/evaluations/set-up-evaluations/) guide), the human feedback metric will be calculated based on the percentage of logs that received thumbs-up feedback.

Note

You need to select human feedback as an evaluator to receive its metrics.

## 5. Review results

After running the evaluation, review the results on the Evaluations tab. You will be able to see the performance of the model based on cost, speed, and now human feedback, represented as the percentage of positive feedback (thumbs up).

The human feedback score is displayed as a percentage, showing the distribution of positively rated responses from the database.

For more information on running evaluations, refer to the documentation [Set Up Evaluations](https://developers.cloudflare.com/ai-gateway/evaluations/set-up-evaluations/).
---
title: Add Human Feedback using API · Cloudflare AI Gateway docs
description: This guide will walk you through the steps of adding human feedback
  to an AI Gateway request using the Cloudflare API. You will learn how to
  retrieve the relevant request logs, and submit feedback using the API.
lastUpdated: 2025-06-27T16:14:01.000Z
chatbotDeprioritize: false
source_url:
  html: https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback-api/
  md: https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback-api/index.md
---

This guide will walk you through the steps of adding human feedback to an AI Gateway request using the Cloudflare API. You will learn how to retrieve the relevant request logs, and submit feedback using the API.

If you prefer to add human feedback via the dashboard, refer to [Add Human Feedback](https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback/).

## 1. Create an API Token

1. [Create an API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) with the following permissions:

* `AI Gateway - Read`
* `AI Gateway - Edit`

1. Get your [Account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).
2. Using that API token and Account ID, send a [`POST` request](https://developers.cloudflare.com/api/resources/ai_gateway/methods/create/) to the Cloudflare API.

## 2. Retrieve the `cf-aig-log-id`

The `cf-aig-log-id` is a unique identifier for the specific log entry to which you want to add feedback. Below are two methods to obtain this identifier.

### Method 1: Locate the `cf-aig-log-id` in the request response

This method allows you to directly find the `cf-aig-log-id` within the header of the response returned by the AI Gateway. This is the most straightforward approach if you have access to the original API response.

The steps below outline how to do this.

1. **Make a Request to the AI Gateway**: This could be a request your application sends to the AI Gateway. Once the request is made, the response will contain various pieces of metadata.
2. **Check the Response Headers**: The response will include a header named `cf-aig-log-id`. This is the identifier you will need to submit feedback.

In the example below, the `cf-aig-log-id` is `01JADMCQQQBWH3NXZ5GCRN98DP`.

```json
{
  "status": "success",
  "headers": {
    "cf-aig-log-id": "01JADMCQQQBWH3NXZ5GCRN98DP"
  },
  "data": {
    "response": "Sample response data"
  }
}
```

### Method 2: Retrieve the `cf-aig-log-id` via API (GET request)

If you do not have the `cf-aig-log-id` in the response body or you need to access it after the fact, you are able to retrieve it by querying the logs using the [Cloudflare API](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/logs/methods/list/).

Send a `GET` request to get a list of logs and then find a specific ID

Required API token permissions

At least one of the following [token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) is required:

* `AI Gateway Write`
* `AI Gateway Read`

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai-gateway/gateways/$GATEWAY_ID/logs" \
  --request GET \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

```json
{
  "result": [
    {
      "id": "01JADMCQQQBWH3NXZ5GCRN98DP",
      "cached": true,
      "created_at": "2019-08-24T14:15:22Z",
      "custom_cost": true,
      "duration": 0,
      "id": "string",
      "metadata": "string",
      "model": "string",
      "model_type": "string",
      "path": "string",
      "provider": "string",
      "request_content_type": "string",
      "request_type": "string",
      "response_content_type": "string",
      "status_code": 0,
      "step": 0,
      "success": true,
      "tokens_in": 0,
      "tokens_out": 0
    }
  ]
}
```

### Method 3: Retrieve the `cf-aig-log-id` via a binding

You can also retrieve the `cf-aig-log-id` using a binding, which streamlines the process. Here's how to retrieve the log ID directly:

```js
const resp = await env.AI.run(
  "@cf/meta/llama-3-8b-instruct",
  {
    prompt: "tell me a joke",
  },
  {
    gateway: {
      id: "my_gateway_id",
    },
  },
);


const myLogId = env.AI.aiGatewayLogId;
```

Note:

The `aiGatewayLogId` property, will only hold the last inference call log id.

## 3. Submit feedback via PATCH request

Once you have both the API token and the `cf-aig-log-id`, you can send a PATCH request to submit feedback.

Required API token permissions

At least one of the following [token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) is required:

* `AI Gateway Write`

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai-gateway/gateways/$GATEWAY_ID/logs/$ID" \
  --request PATCH \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --json '{
    "feedback": 1
  }'
```

If you had negative feedback, adjust the body of the request to be `-1`.

```json
{
  "feedback": -1
}
```

## 4. Verify the feedback submission

You can verify the feedback submission in two ways:

* **Through the [Cloudflare dashboard ](https://dash.cloudflare.com)**: check the updated feedback on the AI Gateway interface.
* **Through the API**: Send another GET request to retrieve the updated log entry and confirm the feedback has been recorded.
---
title: Add human feedback using Worker Bindings · Cloudflare AI Gateway docs
description: This guide explains how to provide human feedback for AI Gateway
  evaluations using Worker bindings.
lastUpdated: 2025-02-12T17:08:49.000Z
chatbotDeprioritize: false
source_url:
  html: https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback-bindings/
  md: https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback-bindings/index.md
---

This guide explains how to provide human feedback for AI Gateway evaluations using Worker bindings.

## 1. Run an AI Evaluation

Start by sending a prompt to the AI model through your AI Gateway.

```javascript
const resp = await env.AI.run(
  "@cf/meta/llama-3.1-8b-instruct",
  {
    prompt: "tell me a joke",
  },
  {
    gateway: {
      id: "my-gateway",
    },
  },
);


const myLogId = env.AI.aiGatewayLogId;
```

Let the user interact with or evaluate the AI response. This interaction will inform the feedback you send back to the AI Gateway.

## 2. Send Human Feedback

Use the [`patchLog()`](https://developers.cloudflare.com/ai-gateway/integrations/worker-binding-methods/#31-patchlog-send-feedback) method to provide feedback for the AI evaluation.

```javascript
await env.AI.gateway("my-gateway").patchLog(myLogId, {
  feedback: 1, // all fields are optional; set values that fit your use case
  score: 100,
  metadata: {
    user: "123", // Optional metadata to provide additional context
  },
});
```

## Feedback parameters explanation

* `feedback`: is either `-1` for negative or `1` to positive, `0` is considered not evaluated.
* `score`: A number between 0 and 100.
* `metadata`: An object containing additional contextual information.

### patchLog: Send Feedback

The `patchLog` method allows you to send feedback, score, and metadata for a specific log ID. All object properties are optional, so you can include any combination of the parameters:

```javascript
gateway.patchLog("my-log-id", {
  feedback: 1,
  score: 100,
  metadata: {
    user: "123",
  },
});
```

Returns: `Promise<void>` (Make sure to `await` the request.)
