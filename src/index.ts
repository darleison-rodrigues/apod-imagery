import { APODProcessor } from './services/processor';
import { Env, APODData } from './types';

/**
 * Fetches APOD data from the NASA API.
 *
 * @param apiKey - The NASA API key.
 * @returns A promise that resolves to an array of APOD data.
 */
async function fetchAPODData(apiKey: string, batchSize: string): Promise<APODData[]> {
	if (!apiKey) {
		throw new Error('NASA_API_KEY is not defined');
	}

	const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${apiKey}&count=${batchSize}`);
	if (!response.ok) {
		throw new Error(`Failed to fetch APOD data: ${response.statusText}`);
	}

	return response.json();
}

/**
 * Cloudflare Worker for processing NASA Astronomy Picture of the Day (APOD) data
 * Handles scheduled execution for APOD classification and processing
 */
export default {

	/**
	 * Scheduled event handler for APOD processing
	 * 
	 * @param controller - Cloudflare scheduled controller instance
	 * @param env - Environment variables and bindings
	 * @param ctx - Execution context for managing async operations
	 * @throws {Error} Propagates critical processing errors
	 */
	async scheduled(
		controller: ScheduledController, 
		env: Env, 
		ctx: ExecutionContext
	): Promise<void> {
		const startTime = Date.now();
		
		try {
			// Validate environment configuration
			if (!env) {
				throw new Error('Environment configuration is required');
			}
			
			const processor = new APODProcessor(env);
			
			// Fetch data from NASA API
			const apodData = await fetchAPODData(env.NASA_API_KEY, env.BATCH_SIZE);
			
			const processingMetrics = await processor.processAPODData(apodData);
			
			// Calculate processing duration
			const duration = Date.now() - startTime;
			
			// Handle processing failures
			if (processingMetrics.failed && processingMetrics.failed > 0) {
				const errorRate = (processingMetrics.failed / processingMetrics.processed) * 100;
				
				// Consider alerting or retry logic for high error rates
				if (errorRate > 50) {
					// High error rate detected - consider implementing alerting mechanism
					throw new Error(`High error rate detected: ${errorRate.toFixed(2)}% - manual intervention required`);
				}
			}
			
		} catch (error) {
			const duration = Date.now() - startTime;
			
			// Structure error information for proper error handling
			const errorDetails = {
				message: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
				duration: `${duration}ms`,
				timestamp: new Date().toISOString()
			};
			
			// Ensure error is properly propagated for monitoring systems
			throw new Error(`APOD worker failed: ${errorDetails.message}`);
		}
	}
};