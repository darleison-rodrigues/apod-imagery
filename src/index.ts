// src/index.ts
import { APODMetadata, Env } from './types';
export { VectorizeWorkflow } from './workflows/vectorize';

// The ScheduledController is a typed object for Cron Triggers.
async function handleProcessing(env: Env): Promise<Response> {
    try {
        // Find the latest unprocessed APOD entry
        const { results } = await env.APOD_D1
            .prepare("SELECT * FROM apod_metadata_dev ORDER BY date DESC LIMIT 1")
            .all<APODMetadata>();

        if (results && results.length > 0) {
            const apodRecord = results[0];
            const durableObjectId = env.VECTORIZE_WORKFLOW.idFromName(apodRecord.date);
            const stub = env.VECTORIZE_WORKFLOW.get(durableObjectId);

            // Send the APOD record to the Durable Object for processing
            await stub.fetch(new Request("https://dummy-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apodRecord }),
            }));

            console.log(`Sent APOD record for date ${apodRecord.date} to VectorizeWorkflow Durable Object.`);
            return new Response(`Processing initiated for APOD record: ${apodRecord.date}`, { status: 200 });
        } else {
            console.log("No new APOD entries to process.");
            return new Response("No new APOD entries to process.", { status: 200 });
        }
    } catch (error) {
        console.error("Error during processing:", error);
        return new Response(`Error during processing: ${error}`, { status: 500 });
    }
}

export default {
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log(`Cron trigger fired at ${new Date().toISOString()}`);
        await handleProcessing(env);
    },

    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        console.log(`Fetch trigger fired at ${new Date().toISOString()}`);
        return handleProcessing(env);
    }
};