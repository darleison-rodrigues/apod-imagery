// src/index.ts
import { APODMetadata, Env } from './types';

async function processAPODRecord(apodRecord: APODMetadata, env: Env): Promise<void> {
    console.log(`Processing APOD record for date: ${apodRecord.date}`);

    // Step 1: Fetch image and generate description using Llava
    let imageDescription = "";
    if (apodRecord.image_url) {
        try {
            const imageResponse = await fetch(apodRecord.image_url);
            const imageArrayBuffer = await imageResponse.arrayBuffer();

            const llavaResponse = await env.AI.run(
                "@cf/llava-hf/llava-1.5-7b-hf",
                {
                    image: [...new Uint8Array(imageArrayBuffer)],
                    prompt: "Describe this image in detail.",
                }
            );
            
            imageDescription = llavaResponse.description || "";
            console.log(`Llava description for ${apodRecord.date}: ${imageDescription.substring(0, 100)}...`);
        } catch (imageError) {
            console.warn(`Could not generate Llava description for ${apodRecord.date}: ${imageError}`);
            imageDescription = `(Image description failed: ${imageError})`;
        }
    }

    // Step 2: Generate embeddings using Workers AI
    const textToEmbed = `${apodRecord.title}. ${apodRecord.explanation}. ${imageDescription}`;
    
    const embeddingsResponse = await env.AI.run(
        "@cf/baai/bge-base-en-v1.5",
        { text: textToEmbed }
    );

    // Handle different possible response structures
    let embeddings;
    if (embeddingsResponse.data && Array.isArray(embeddingsResponse.data)) {
        embeddings = embeddingsResponse.data[0];
    } else if (embeddingsResponse.result && embeddingsResponse.result.data) {
        embeddings = embeddingsResponse.result.data[0];
    } else {
        throw new Error(`Unexpected embeddings response structure: ${JSON.stringify(embeddingsResponse)}`);
    }

    if (!embeddings || !Array.isArray(embeddings)) {
        throw new Error(`Invalid embeddings format: ${JSON.stringify(embeddings)}`);
    }

    console.log(`Generated embeddings with ${embeddings.length} dimensions for ${apodRecord.date}`);

    // Step 3: Upsert embeddings into Vectorize index
    await env.APOD_BASE_768D_VECTORIZE.upsert({
        id: apodRecord.date,
        values: embeddings,
        metadata: {
            date: apodRecord.date,
            title: apodRecord.title,
            category: apodRecord.category,
            confidence: apodRecord.confidence,
        },
    });

    console.log(`Text embeddings upserted for APOD date: ${apodRecord.date}`);

    // Step 4: Update D1 database to mark as processed
    await env.APOD_D1
        .prepare("UPDATE apod_metadata_dev SET processed_at = ? WHERE date = ?")
        .bind(new Date().toISOString(), apodRecord.date)
        .run();

    console.log(`APOD record ${apodRecord.date} marked as processed in D1.`);
}

async function handleProcessing(env: Env): Promise<Response> {
    try {
        // Validate environment bindings
        if (!env.APOD_D1) {
            throw new Error("D1 database binding (APOD_D1) is not configured");
        }
        
        if (!env.AI) {
            throw new Error("AI binding is not configured");
        }
        
        if (!env.APOD_BASE_768D_VECTORIZE) {
            throw new Error("Vectorize binding (APOD_BASE_768D_VECTORIZE) is not configured");
        }

        // Find the latest unprocessed APOD entry
        const { results } = await env.APOD_D1
                .prepare("SELECT * FROM APODMetadata WHERE processed_at IS NULL ORDER BY date DESC LIMIT 1")
                .all<APODMetadata>();

        if (results && results.length > 0) {
            const apodRecord = results[0];
            
            // Validate required fields
            if (!apodRecord.date) {
                throw new Error("APOD record missing required date field");
            }

            // Process the APOD record directly
            await processAPODRecord(apodRecord, env);

            return new Response(`Successfully processed APOD record: ${apodRecord.date}`, { status: 200 });
        } else {
            console.log("No new APOD entries to process.");
            return new Response("No new APOD entries to process.", { status: 200 });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Error during processing:", errorMessage);
        return new Response(`Error during processing: ${errorMessage}`, { status: 500 });
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        console.log(`Fetch trigger fired at ${new Date().toISOString()}`);
        return handleProcessing(env);
    }
};