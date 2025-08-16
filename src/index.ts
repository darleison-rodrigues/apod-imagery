import { APODProcessor } from './services/processor';
import { Env, APODData } from './types';

/**
 * APOD Data storage - In production, this should be replaced with external data source
 */
const apodDataList: APODData[] = [];

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
			
			// TODO: Replace with NASA API integration
			// Current implementation uses placeholder data for development
			// Production should fetch from: https://api.nasa.gov/planetary/apod
			const processingMetrics = await processor.processAPODData(apodDataList);
			
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