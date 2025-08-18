import { Env, APODMetadata, VectorizeWorkflowPayload } from '../types';

export class VectorizeWorkflow implements DurableObject {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }

    async fetch(request: Request): Promise<Response> {
        try {
            const payload: VectorizeWorkflowPayload = await request.json();
            const apodRecord = payload.apodRecord;

            console.log(`Processing APOD record for date: ${apodRecord.date}`);

            // 1. Fetch image and generate description using Llava
            let imageDescription = "";
            if (apodRecord.image_url) {
                try {
                    const imageResponse = await fetch(apodRecord.image_url);
                    const imageArrayBuffer = await imageResponse.arrayBuffer();

                    const llavaResponse = await this.env.AI.run(
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

            // 2. Combine all text sources for embedding
            const textToEmbed = `${apodRecord.title}. ${apodRecord.explanation}. ${imageDescription}`;

            // 3. Generate embeddings using Workers AI
            const embeddingsResponse = await this.env.AI.run(
                "@cf/baai/bge-base-en-v1.5", // Using one of the existing models for POC
                { text: textToEmbed }
            );

            const embeddings = embeddingsResponse.result.data[0];

            // 3. Upsert text embeddings into Vectorize index
            // Using APOD_BASE_768D_VECTORIZE as a proof of concept
            await this.env.APOD_BASE_768D_VECTORIZE.upsert({
                id: apodRecord.date, // Using date as unique ID for the vector
                values: embeddings,
                metadata: {
                    date: apodRecord.date,
                    title: apodRecord.title,
                    category: apodRecord.category,
                    confidence: apodRecord.confidence,
                },
            });

            console.log(`Text embeddings upserted for APOD date: ${apodRecord.date}`);

            // 4. Generate and upsert image embeddings using CLIP
            if (apodRecord.image_url && imageArrayBuffer) { // imageArrayBuffer is available from Llava step
                try {
                    const clipEmbeddingsResponse = await this.env.AI.run(
                        "@cf/openai/clip-vit-base-patch32", // CLIP model
                        { image: [...new Uint8Array(imageArrayBuffer)] }
                    );

                    await this.env.APOD_IMAGE_EMBEDDINGS_VECTORIZE.upsert({
                        id: apodRecord.date,
                        values: clipEmbeddingsResponse.result.data[0],
                        metadata: {
                            date: apodRecord.date,
                            title: apodRecord.title,
                            category: apodRecord.category,
                        },
                    });
                    console.log(`Image embeddings upserted for APOD date: ${apodRecord.date}`);
                } catch (clipError) {
                    console.warn(`Could not generate CLIP embeddings for ${apodRecord.date}: ${clipError}`);
                }
            }

            // 4. Update D1 database to mark as processed
            await this.env.APOD_D1
                .prepare("UPDATE apod_metadata_dev SET processed_at = ? WHERE date = ?")
                .bind(new Date().toISOString(), apodRecord.date)
                .run();

            console.log(`APOD record ${apodRecord.date} marked as processed in D1.`);

            return new Response("Processing complete", { status: 200 });
        } catch (error) {
            console.error(`Error processing APOD record: ${error}`);
            return new Response(`Error processing: ${error}`, { status: 500 });
        }
    }
}