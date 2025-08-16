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

				// Better CSV parsing - handle quotes and commas within fields
				const parseCSVLine = (line: string): string[] => {
					const result: string[] = [];
					let current = '';
					let inQuotes = false;

					for (let i = 0; i < line.length; i++) {
						const char = line[i];

						if (char === '"') {
							if (inQuotes && line[i + 1] === '"') {
								// Handle escaped quotes
								current += '"';
								i++; // Skip next quote
							} else {
								// Toggle quote state
								inQuotes = !inQuotes;
							}
						} else if (char === ',' && !inQuotes) {
							// End of field
							result.push(current.trim());
							current = '';
						} else {
							current += char;
						}
					}

					// Add the last field
					result.push(current.trim());
					return result;
				};

				const lines = csvContent.split('\n')
					.map(line => line.trim())
					.filter(line => line.length > 0);

				if (lines.length === 0) {
					return new Response('No CSV content provided.', { status: 400 });
				}

				if (lines.length < 2) {
					return new Response('CSV must contain at least headers and one data row.', { status: 400 });
				}

				const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));

				const dataToInsert: any[] = [];
				const errors: string[] = [];

				for (let i = 1; i < lines.length; i++) {
					try {
						const values = parseCSVLine(lines[i]);

						if (values.length !== headers.length) {
							// Continue processing, but pad with empty strings if needed
						}

						const row: { [key: string]: any } = {};
						headers.forEach((header, index) => {
							const value = values[index] ? values[index].replace(/^"|"$/g, '').trim() : '';
							row[header] = value;
						});

						// Helper function to safely get values
						const getValue = (key: string): string => row[key] || '';
						const getFloatValue = (key: string): number | null => {
							const val = getValue(key);
							if (!val) return null;
							const parsed = parseFloat(val);
							return isNaN(parsed) ? null : parsed;
						};
						const getIntValue = (key: string): number => {
							const val = getValue(key);
							if (!val) return 0;
							const parsed = parseInt(val);
							return isNaN(parsed) ? 0 : parsed;
						};

						// Map CSV data to D1 schema with better error handling
						const mappedData = {
							date: getValue('date'),
							title: getValue('title'),
							explanation: getValue('explanation'),
							image_url: getValue('url') || getValue('image_url'),
							r2_url: getValue('hdurl') || getValue('url') || getValue('image_url'),
							category: getValue('category') || null,
							confidence: getFloatValue('confidence'),
							image_description: getValue('image_description') || null,
							copyright: getValue('copyright') || null,
							is_relevant: getIntValue('is_relevant'),
						};

						// Validate required fields
						if (!mappedData.date) {
							errors.push(`Row ${i + 1}: Missing required 'date' field`);
							continue;
						}
						if (!mappedData.title) {
							errors.push(`Row ${i + 1}: Missing required 'title' field`);
							continue;
						}

						dataToInsert.push(mappedData);

					} catch (rowError) {
						errors.push(`Row ${i + 1}: ${rowError instanceof Error ? rowError.message : 'Unknown parsing error'}`);
					}
				}

				if (dataToInsert.length === 0) {
					return new Response(`No valid data to insert. Errors: ${errors.join(', ')}`, { status: 400 });
				}

				// Log warnings for any errors but continue with valid data
				if (errors.length > 0) {
				}

				// Prepare batch insert statements with proper parameterization
				const statements = dataToInsert.map(data => {
					const params = [
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
					];

					return env.APOD_D1.prepare(
						`INSERT INTO apod_metadata_dev (date, title, explanation, image_url, r2_url, category, confidence, image_description, copyright, is_relevant)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						params
					);
				});


				// Execute batch insert
				const results = await env.APOD_D1.batch(statements);

				// Check for any failed statements
				const failedResults = results.filter(result => !result.success);
				if (failedResults.length > 0) {
					return new Response(
						`Partially successful: ${results.length - failedResults.length} inserted, ${failedResults.length} failed. ${errors.length > 0 ? `Parse errors: ${errors.length}` : ''}`,
						{ status: 207 }
					);
				}

				const responseMessage = `Successfully populated D1 with ${dataToInsert.length} records.${errors.length > 0 ? ` (${errors.length} rows skipped due to errors)` : ''}`;
				return new Response(responseMessage, { status: 200 });

			} catch (error) {

				// More detailed error information
				const errorMessage = error instanceof Error
					? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
					: 'Unknown error occurred';

				return new Response(`Error populating D1: ${errorMessage}`, { status: 500 });
			}
		}

		// Fallback for other requests
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