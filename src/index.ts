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

    // Step 3: Insert embeddings into Vectorize index (using insert instead of upsert)
    try {
        await env.APOD_BASE_768D_VECTORIZE.insert([
            {
                id: apodRecord.date,
                values: embeddings,
                metadata: {
                    date: apodRecord.date,
                    title: apodRecord.title,
                    category: apodRecord.category,
                    confidence: apodRecord.confidence,
                },
            }
        ]);
        console.log(`Text embeddings inserted for APOD date: ${apodRecord.date}`);
    } catch (vectorError) {
        console.error(`Vectorize insert failed for ${apodRecord.date}:`, vectorError);
        // Try upsert as fallback
        try {
            await env.APOD_BASE_768D_VECTORIZE.upsert([
                {
                    id: apodRecord.date,
                    values: embeddings,
                    metadata: {
                        date: apodRecord.date,
                        title: apodRecord.title,
                        category: apodRecord.category,
                        confidence: apodRecord.confidence,
                    },
                }
            ]);
            console.log(`Text embeddings upserted (fallback) for APOD date: ${apodRecord.date}`);
        } catch (upsertError) {
            console.error(`Both insert and upsert failed for ${apodRecord.date}:`, upsertError);
            throw upsertError;
        }
    }

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

        // Find unprocessed APOD entries (batch processing)
        const batchSize = 50; // Process 50 records at a time to avoid timeouts
        const { results } = await env.APOD_D1
            .prepare("SELECT * FROM apod_metadata_dev WHERE processed_at IS NOT NULL ORDER BY date DESC LIMIT ?")
            .bind(batchSize)
            .all<APODMetadata>();

        if (results && results.length > 0) {
            console.log(`Found ${results.length} unprocessed APOD records to process`);
            
            let processedCount = 0;
            let errorCount = 0;

            // Process each record in the batch
            for (let i = 0; i < results.length; i++) {
                const apodRecord = results[i];
                
                try {
                    // Validate required fields
                    if (!apodRecord.date) {
                        console.error(`APOD record at index ${i} missing required date field`);
                        errorCount++;
                        continue;
                    }

                    console.log(`Processing record ${i + 1}/${results.length}: ${apodRecord.date}`);
                    
                    // Process the APOD record
                    await processAPODRecord(apodRecord, env);
                    processedCount++;
                    
                    console.log(`✅ Successfully processed ${apodRecord.date} (${i + 1}/${results.length})`);
                    
                    // Add a small delay to avoid rate limiting
                    if (i < results.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                } catch (recordError) {
                    errorCount++;
                    const errorMessage = recordError instanceof Error ? recordError.message : String(recordError);
                    console.error(`❌ Failed to process ${apodRecord.date}: ${errorMessage}`);
                    
                    // Continue processing other records even if one fails
                    continue;
                }
            }

            const summary = `Batch processing complete. Processed: ${processedCount}, Errors: ${errorCount}, Total attempted: ${results.length}`;
            console.log(summary);
            return new Response(summary, { status: 200 });
            
        } else {
            console.log("No unprocessed APOD entries found.");
            return new Response("No unprocessed APOD entries found.", { status: 200 });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Error during batch processing:", errorMessage);
        return new Response(`Error during batch processing: ${errorMessage}`, { status: 500 });
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        console.log(`Batch processing triggered at ${new Date().toISOString()}`);
        return handleProcessing(env);
    }
};