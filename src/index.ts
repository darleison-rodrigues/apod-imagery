// src/index.ts
import { APODMetadata, Env } from './types';
export { VectorizeWorkflow } from './workflows/vectorize';

// The ScheduledController is a typed object for Cron Triggers.
export default {
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log(`Cron trigger fired at ${new Date().toISOString()}`);

        try {
            // Find the latest unprocessed APOD entry
            const { results } = await env.APOD_D1
                .prepare("SELECT * FROM apod_metadata_dev")
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
            } else {
                console.log("No new APOD entries to process.");
            }
        } catch (error) {
            console.error("Error in scheduled worker:", error);
        }
    }
};