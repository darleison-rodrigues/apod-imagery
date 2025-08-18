// src/index.ts
import { APODMetadata, Env } from './types';

async function processAPODRecord(apodRecord: APODMetadata, env: Env): Promise<void> {
    console.log(`Processing APOD record for date: ${apodRecord.date}`);

    // Step 2: Generate embeddings using Workers AI
    const textToEmbed = `${apodRecord.title}. ${apodRecord.explanation}`;
    
    const embeddingsResponse = await env.AI.run(
        "@cf/baai/bge-base-en-v1.5",
        { text: textToEmbed }
    );
    const embeddings = embeddingsResponse.data[0];


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
    } catch (vectorError) {
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
        } catch (upsertError) {
            throw upsertError;
        }
    }

    // Step 4: Update D1 database to mark as processed
    await env.APOD_D1
        .prepare("UPDATE apod_metadata_dev SET processed_at = ? WHERE date = ?")
        .bind(new Date().toISOString(), apodRecord.date)
        .run();

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
            
            let processedCount = 0;
            let errorCount = 0;

            // Process each record in the batch
            for (let i = 0; i < results.length; i++) {
                const apodRecord = results[i];
                
                try {
                    // Validate required fields
                    if (!apodRecord.date) {
                        errorCount++;
                        continue;
                    }

                    
                    // Process the APOD record
                    await processAPODRecord(apodRecord, env);
                    processedCount++;
                    
                    
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