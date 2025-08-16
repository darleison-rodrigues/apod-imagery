import { APODProcessor } from './services/processor';
import { Env, APODData } from './types';
import { Semaphore } from './utils/semaphore';

// Define a semaphore for NASA API calls
const nasaApiSemaphore = new Semaphore(1); // Limit to 1 concurrent call for now, can be configured

/**
 * Fetches APOD data from the NASA API.
 *
 * @param apiKey - The NASA API key.
 * @returns A promise that resolves to an array of APOD data.
 */
async function fetchAPODData(apiKey: string, startDate: string, endDate: string): Promise<APODData[]> {
	if (!apiKey) {
		throw new Error('NASA_API_KEY is not defined');
	}

	// Acquire a permit from the semaphore before making the API call
	await nasaApiSemaphore.acquire();
	try {
		const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${apiKey}&start_date=${startDate}&end_date=${endDate}`);
		if (!response.ok) {
			throw new Error(`Failed to fetch APOD data: ${response.statusText}`);
		}

		return response.json();
	} finally {
		// Release the permit after the API call (whether successful or not)
		nasaApiSemaphore.release();
	}
}

/**
 * Cloudflare Worker for processing NASA Astronomy Picture of the Day (APOD) data
 * Handles scheduled execution for APOD classification and processing
 */
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/populate-d1') {
			try {
				const csvContent = await request.text();
				const lines = csvContent.split('\n').filter(line => line.trim() !== '');

				if (lines.length === 0) {
					return new Response('No CSV content provided.', { status: 400 });
				}

				const headers = lines[0].split(',');
				const dataToInsert: any[] = [];

				for (let i = 1; i < lines.length; i++) {
					const values = lines[i].split(',');
					const row: { [key: string]: any } = {};
					headers.forEach((header, index) => {
						row[header.trim()] = values[index] ? values[index].trim() : '';
					});

					// Map CSV data to D1 schema
					dataToInsert.push({
						date: row.date,
						title: row.title,
						explanation: row.explanation,
						image_url: row.url, // Assuming 'url' from CSV maps to 'image_url'
						r2_url: row.hdurl || row.url, // Use hdurl if available, else url
						category: row.category || null,
						confidence: row.confidence ? parseFloat(row.confidence) : null,
						image_description: row.image_description || null,
						copyright: row.copyright || null,
						is_relevant: row.is_relevant ? parseInt(row.is_relevant) : 0,
					});
				}

				// Prepare batch insert statements
				const statements = dataToInsert.map(data =>
					env.APOD_D1.prepare(
						`INSERT INTO apod_metadata_dev (date, title, explanation, image_url, r2_url, category, confidence, image_description, copyright, is_relevant)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
						[
							data.date,
							data.title,
							data.explanation,
							data.image_url,
							data.r2_url,
							data.category,
							data.confidence,
							data.image_description,
							data.copyright,
							data.is_relevant,
						]
					)
				);

				await env.APOD_D1.batch(statements);

				return new Response(`Successfully populated D1 with ${dataToInsert.length} records.`, { status: 200 });

			} catch (error) {
				console.error('Error populating D1:', error);
				return new Response(`Error populating D1: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
			}
		}

		// Fallback for other requests (e.g., scheduled events)
		return new Response('Not found or invalid request.', { status: 404 });
	},

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
			
			// Determine dates for fetching APOD data in 5-year chunks
			const currentYear = new Date().getFullYear();
			const START_APOD_YEAR = 1995; // First year of APOD data

			for (let year = START_APOD_YEAR; year <= currentYear; year += 5) {
				const batchStartDate = `${year}-01-01`;
				const batchEndDate = `${Math.min(year + 4, currentYear)}-12-31`; // End of 5-year period or current year end

				console.log(`Fetching APOD data for range: ${batchStartDate} to ${batchEndDate}`);

				// Fetch data from NASA API for the current batch
				const apodData = await fetchAPODData(env.NASA_API_KEY, batchStartDate, batchEndDate);
				
				// Process the fetched data
				const processingMetrics = await processor.processAPODData(apodData);
				
				// Log metrics for the current batch
				console.log(`Batch processing metrics for ${batchStartDate} to ${batchEndDate}:`, processingMetrics);

				// Handle processing failures for the current batch
				if (processingMetrics.failed && processingMetrics.failed > 0) {
					const errorRate = (processingMetrics.failed / processingMetrics.processed) * 100;
					if (errorRate > 50) {
						throw new Error(`High error rate detected for batch ${batchStartDate} to ${batchEndDate}: ${errorRate.toFixed(2)}% - manual intervention required`);
					}
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