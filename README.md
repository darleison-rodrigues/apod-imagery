# apod-imagery

This project implements a comprehensive pipeline for processing NASA APOD (Astronomy Picture of the Day) data, generating semantic embeddings, storing images, and serving them through a performant web application. It also includes a robust model evaluation framework.



## Architecture Overview

### Web Application & Frontend

```mermaid
sequenceDiagram
    participant Browser
    participant CloudflarePages as Cloudflare Pages
    participant ReactFrontend as React Frontend
    participant CloudflareWorker as Cloudflare Worker (API Gateway)
    participant CloudflareVectorize as Cloudflare Vectorize (Embeddings DB)

    Browser->>CloudflarePages: Request Static Assets
    CloudflarePages-->>Browser: Serves React App (HTML, CSS, JS)
    Browser->>ReactFrontend: Loads React App
    ReactFrontend->>Browser: Renders Initial UI

    alt User performs Search or Timeline Interaction
        Browser->>CloudflareWorker: 1. API Request (Search/Data Fetch)
        CloudflareWorker->>CloudflareVectorize: 2. Query Embeddings
        CloudflareVectorize-->>CloudflareWorker: 3. Returns Query Results
        CloudflareWorker-->>Browser: 4. Sends JSON Response
        Browser->>ReactFrontend: 5. Receives JSON Data
        ReactFrontend->>ReactFrontend: 6. Processes Data & Updates State
        ReactFrontend->>Browser: 7. Renders Updated UI (D3.js/Anime.js Visualizations, APOD Details)
    end
```
