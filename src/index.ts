import { APODProcessor } from './services/processor';
import { Env, APODData } from './types';

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

			console.log('Checking APOD data count in D1...');
			const { results: countResults } = await env.APOD_D1.prepare('SELECT COUNT(*) as count FROM apod_metadata_dev').all();
			const rowCount = countResults && countResults.length > 0 ? (countResults[0] as any).count : 0;

			if (rowCount === 0) {
				console.warn('No APOD data found in D1 (count is 0).');
				return;
			}
			console.log(`Found ${rowCount} APOD items in D1. Fetching all data...`);

			const { results } = await env.APOD_D1.prepare('SELECT * FROM apod_metadata_dev').all();

			const apodDataList: APODData[] = results.map((row: any) => ({
				date: row.date,
				title: row.title,
				explanation: row.explanation,
				url: row.image_url, // Assuming image_url in D1 maps to url in APODData
				media_type: row.media_type || 'image',
				hdurl: row.r2_url, // Assuming r2_url in D1 maps to hdurl in APODData
				copyright: row.copyright,
				service_version: row.service_version,
				// Add other fields as necessary from your D1 schema
			}));

			console.log(`Successfully fetched ${apodDataList.length} APOD items from D1.`);

			console.log(`Starting processing for ${apodDataList.length} APOD items.`);
			const processingMetrics = await processor.processAPODData(apodDataList);
			console.log('APOD processing complete:', processingMetrics);

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