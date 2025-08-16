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
				console.log('Received CSV content length:', csvContent.length);

				// Simple but robust CSV parsing
				const lines = csvContent.split('\n')
					.map(line => line.trim())
					.filter(line => line.length > 0);

				if (lines.length < 2) {
					return new Response('CSV must contain headers and at least one data row.', { status: 400 });
				}

				// Parse headers - your CSV headers
				const headerLine = lines[0];
				const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
				console.log('CSV Headers:', headers);

				const dataToInsert: any[] = [];
				const errors: string[] = [];

				// Process each data row
				for (let i = 1; i < lines.length; i++) {
					try {
						const line = lines[i];
						const values = [];
						let current = '';
						let inQuotes = false;

						// Parse CSV line handling commas in quoted fields
						for (let j = 0; j < line.length; j++) {
							const char = line[j];
							if (char === '"') {
								inQuotes = !inQuotes;
							} else if (char === ',' && !inQuotes) {
								values.push(current.trim().replace(/^"|"$/g, ''));
								current = '';
							} else {
								current += char;
							}
						}
						values.push(current.trim().replace(/^"|"$/g, '')); // Don't forget the last value

						if (values.length !== headers.length) {
							errors.push(`Row ${i + 1}: Column count mismatch. Expected ${headers.length}, got ${values.length}`);
							continue;
						}

						// Create row object
						const row: { [key: string]: string } = {};
						headers.forEach((header, index) => {
							row[header] = values[index] || '';
						});

						// Helper functions
						const getValue = (key: string): string => {
							const val = row[key] || '';
							return val === 'nan' || val === 'NaN' ? '' : val;
						};

						const getFloatValue = (key: string): number | null => {
							const val = getValue(key);
							if (!val || val === 'nan' || val === 'NaN') return null;
							const parsed = parseFloat(val);
							return isNaN(parsed) ? null : parsed;
						};

						// Map your specific CSV columns to D1 schema
						const mappedData = {
							date: getValue('date'),
							title: getValue('title'),
							explanation: getValue('explanation'),
							image_url: getValue('url'),
							r2_url: getValue('hdurl') || getValue('url'),
							category: getValue('predicted_category') || null,
							confidence: getFloatValue('confidence_score'),
							image_description: null, // Not in your CSV
							copyright: getValue('copyright') || null,
							is_relevant: 1, // Default to relevant
						};

						// Validate required fields
						if (!mappedData.date || !mappedData.title || !mappedData.explanation || !mappedData.image_url) {
							errors.push(`Row ${i + 1}: Missing required fields`);
							continue;
						}

						dataToInsert.push(mappedData);

					} catch (rowError) {
						errors.push(`Row ${i + 1}: ${rowError instanceof Error ? rowError.message : 'Parse error'}`);
					}
				}

				if (dataToInsert.length === 0) {
					return new Response(`No valid data to insert. Errors: ${errors.join('; ')}`, { status: 400 });
				}

				console.log(`Preparing to insert ${dataToInsert.length} records`);

				// Create batch insert statements
				const statements: any[] = [];

				for (let i = 0; i < dataToInsert.length; i++) {
					const data = dataToInsert[i];

					// Ensure all parameters are properly typed
					const params = [
						String(data.date || ''),
						String(data.title || ''),
						String(data.explanation || ''),
						String(data.image_url || ''),
						String(data.r2_url || ''),
						data.category === undefined ? null : String(data.category),
						data.confidence === undefined ? null : Number(data.confidence),
						data.image_description === undefined ? null : String(data.image_description),
						data.copyright === undefined ? null : String(data.copyright),
						data.is_relevant === undefined ? 0 : Number(data.is_relevant),
					];
					console.log('Parameters for bind:', JSON.stringify(params)); // Add this logging
					// Debug first few rows
					if (i < 2) {
						console.log(`Row ${i + 1} params:`, params.map((p, idx) => `${idx}: ${typeof p} = ${p}`));
					}

					const statement = env.APOD_D1.prepare(
						`INSERT INTO apod_metadata_dev 
					 (date, title, explanation, image_url, r2_url, category, confidence, image_description, copyright, is_relevant) 
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
					).bind(...params); // Use .bind() with spread operator

					statements.push(statement);
				}

				console.log(`Executing batch insert for ${statements.length} statements`);

				// Execute batch insert
				const results = await env.APOD_D1.batch(statements);

				// Check results
				const failed = results.filter(r => !r.success);
				if (failed.length > 0) {
					console.error('Failed inserts:', failed);
					return new Response(
						`Partial success: ${results.length - failed.length}/${results.length} inserted. ${errors.length} parse errors.`,
						{ status: 207 }
					);
				}

				const message = `Successfully inserted ${results.length} records${errors.length > 0 ? ` (${errors.length} rows skipped)` : ''}.`;
				console.log(message);
				return new Response(message, { status: 200 });

			} catch (error) {
				console.error('Error populating D1:', error);
				return new Response(
					`Error populating D1: ${error instanceof Error ? error.message : 'Unknown error'}`,
					{ status: 500 }
				);
			}
		}

		return new Response('Not found', { status: 404 });
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

			// Assuming the CSV file is named 'apod.csv' in the root of the R2 bucket
			const r2CsvObjectKey = 'apod.csv'; 
			console.log(`Starting embedding generation from R2 CSV: ${r2CsvObjectKey}`);
			const processingMetrics = await processor.processR2CSVAndGenerateEmbeddings(r2CsvObjectKey);
			console.log('Embedding generation complete:', processingMetrics);

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