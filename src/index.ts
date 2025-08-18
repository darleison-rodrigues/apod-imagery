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
			const analysisPrompt = [
				'Analyze this astronomical image in detail.',
				'Identify celestial objects, cosmic phenomena, and structural features.',
				'Describe colors, brightness patterns, and spatial relationships.',
				'Note any telescopic or observational characteristics visible.',
			].join(' ');
            const llavaResponse = await env.AI.run(
                "@cf/llava-hf/llava-1.5-7b-hf",
                {
                    image: [...new Uint8Array(imageArrayBuffer)],
                    prompt: analysisPrompt,
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

    // Handle embeddings response - check for async response first
    if ('request_id' in embeddingsResponse) {
        throw new Error(`Received async response with request_id: ${embeddingsResponse.request_id}. Async processing not implemented.`);
    }

    // Validate embeddings response structure
    if (!embeddingsResponse.data || !Array.isArray(embeddingsResponse.data)) {
        throw new Error(`Invalid embeddings response structure - missing or invalid data array: ${JSON.stringify(embeddingsResponse)}`);
    }

    if (embeddingsResponse.data.length === 0) {
        throw new Error(`Empty embeddings data array: ${JSON.stringify(embeddingsResponse)}`);
    }

    // Extract the first (and likely only) embedding array
    const embeddings = embeddingsResponse.data[0];

    if (!Array.isArray(embeddings)) {
        throw new Error(`Unexpected embeddings format - expected array but got: ${typeof embeddings}`);
    }

    if (embeddings.length === 0) {
        throw new Error(`Empty embeddings array for ${apodRecord.date}`);
    }

    console.log(`Generated embeddings with ${embeddings.length} dimensions for ${apodRecord.date}`);
    console.log(`Response shape: ${embeddingsResponse.shape || 'not provided'}`);
    console.log(`Pooling method: ${embeddingsResponse.pooling || 'not provided'}`);

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
                .prepare("SELECT * FROM apod_metadata_dev ORDER BY date DESC LIMIT 1")
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