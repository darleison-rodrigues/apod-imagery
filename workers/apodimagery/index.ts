import { Ai } from '@cloudflare/ai';

export interface Env {
	AI: any;
	VECTORIZE_INDEX: VectorizeIndex;
	APOD_R2: R2Bucket;
	APOD_D1: D1Database;
	// Add environment variables for configuration
	MAX_CONCURRENT_PROCESSING?: string;
	BATCH_SIZE?: string;
	RETRY_ATTEMPTS?: string;
	ENABLE_DETAILED_LOGGING?: string;
}

interface APODData {
	date: string;
	title: string;
	explanation: string;
	url: string;
	media_type?: string;
	hdurl?: string;
	copyright?: string;
}

interface ProcessingMetrics {
	processed: number;
	failed: number;
	skipped: number;
	relevant: number;
	irrelevant: number;
	startTime: number;
	errors: Array<{ date: string; error: string; step: string }>;
}

interface ClassificationResult {
	category: string;
	confidence: number;
	imageDescription: string;
	embeddings: number[];
	isRelevant: boolean;
}

class APODProcessor {
	private ai: Ai;
	private env: Env;
	private metrics: ProcessingMetrics;
	private maxConcurrent: number;
	private batchSize: number;
	private retryAttempts: number;
	private enableDetailedLogging: boolean;

	constructor(env: Env) {
		this.ai = new Ai(env.AI);
		this.env = env;
		this.metrics = {
			processed: 0,
			failed: 0,
			skipped: 0,
			relevant: 0,
			irrelevant: 0,
			startTime: Date.now(),
			errors: []
		};
		
		// Configuration with defaults
		this.maxConcurrent = parseInt(env.MAX_CONCURRENT_PROCESSING || '5');
		this.batchSize = parseInt(env.BATCH_SIZE || '10');
		this.retryAttempts = parseInt(env.RETRY_ATTEMPTS || '3');
		this.enableDetailedLogging = env.ENABLE_DETAILED_LOGGING === 'true';
	}

	async processAPODData(apodDataList: APODData[]): Promise<ProcessingMetrics> {
		console.log(`Starting APOD classification for ${apodDataList.length} items...`);
		
		const batches = this.chunkArray(apodDataList, this.batchSize);
		
		for (const [batchIndex, batch] of batches.entries()) {
			console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);
			
			await this.processBatchWithConcurrency(batch);
			
			if (batchIndex < batches.length - 1) {
				await this.delay(100);
			}
		}

		this.logFinalMetrics();
		return this.metrics;
	}

	private async processBatchWithConcurrency(batch: APODData[]): Promise<void> {
		const semaphore = new Semaphore(this.maxConcurrent);
		
		const promises = batch.map(async (apodData) => {
			await semaphore.acquire();
			try {
				await this.processWithRetry(apodData);
			} finally {
				semaphore.release();
			}
		});

		await Promise.allSettled(promises);
	}

	private async processWithRetry(apodData: APODData, attempt: number = 1): Promise<void> {
		try {
			await this.processSingleAPOD(apodData);
			this.metrics.processed++;
			
			if (this.enableDetailedLogging) {
				console.log(`✅ Successfully processed ${apodData.date}`);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			
			if (attempt < this.retryAttempts) {
				console.log(`⚠️ Retry ${attempt}/${this.retryAttempts} for ${apodData.date}: ${errorMessage}`);
				await this.delay(1000 * attempt);
				return this.processWithRetry(apodData, attempt + 1);
			} else {
				console.error(`❌ Failed to process ${apodData.date} after ${this.retryAttempts} attempts: ${errorMessage}`);
				this.metrics.failed++;
				this.metrics.errors.push({
					date: apodData.date,
					error: errorMessage,
					step: 'processing'
				});
			}
		}
	}

	private async processSingleAPOD(apodData: APODData): Promise<void> {
		if (apodData.media_type && apodData.media_type !== 'image') {
			console.log(`Skipping ${apodData.date} - not an image (${apodData.media_type})`);
			this.metrics.skipped++;
			return;
		}

		if (await this.isAlreadyProcessed(apodData.date)) {
			console.log(`Skipping ${apodData.date} - already processed`);
			this.metrics.skipped++;
			return;
		}

		const step = { current: 'initialization' };
		
		try {
			step.current = 'image_fetching';
			const imageResponse = await fetch(apodData.url);
			if (!imageResponse.ok) {
				throw new Error(`Failed to fetch image from ${apodData.url}`);
			}
			const imageBlob = await imageResponse.blob();

			step.current = 'ai_processing';
			const classificationResult = await this.runAIClassification(apodData, imageBlob);
			
			if (classificationResult.isRelevant) {
				this.metrics.relevant++;
				step.current = 'data_storage';
				await this.storeAPODData(apodData, classificationResult, imageBlob);
			} else {
				this.metrics.irrelevant++;
				if (this.enableDetailedLogging) {
					console.log(`Skipping ${apodData.date} - not a relevant celestial object.`);
				}
			}
			
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Step '${step.current}': ${errorMessage}`);
		}
	}

	private async runAIClassification(apodData: APODData, imageBlob: Blob): Promise<ClassificationResult> {
		const text = `${apodData.title}. ${apodData.explanation}`;
		
		const [imageToTextResult, textClassificationResult, textEmbeddings] = await Promise.all([
			this.runImageToText(imageBlob),
			this.runTextClassification(text),
			this.generateTextEmbeddings(text)
		]);

		const category = textClassificationResult[0]?.label || 'unknown';
		const isRelevant = this.isCelestialObject(category);

		return {
			category: category,
			confidence: textClassificationResult[0]?.score || 0,
			imageDescription: imageToTextResult.description || 'No description available',
			embeddings: textEmbeddings,
			isRelevant: isRelevant,
		};
	}

	private isCelestialObject(category: string): boolean {
		const celestialCategories = ["Galaxy", "Nebula", "Star Cluster", "Planet", "Comet", "Asteroid", "Supernova", "Black Hole"];
		return celestialCategories.includes(category);
	}

	private async runImageToText(imageBlob: Blob): Promise<any> {
		const imageToTextModel = '@cf/llava-hf/llava-1.5-7b-hf';
		const inputs = {
			prompt: 'Describe this astronomical image in detail, including any celestial objects, phenomena, or structures visible.',
			image: [...new Uint8Array(await imageBlob.arrayBuffer())],
		};
		return await this.ai.run(imageToTextModel, inputs);
	}

	private async runTextClassification(text: string): Promise<any> {
		const textClassificationModel = '@cf/huggingface/distilbert-sst-2-int8';
		return await this.ai.run(textClassificationModel, { text });
	}

	private async generateTextEmbeddings(text: string): Promise<number[]> {
		const textEmbeddingModel = '@cf/baai/bge-base-en-v1.5';
		const { data: embeddings } = await this.ai.run(textEmbeddingModel, { text: [text] });
		return embeddings[0];
	}

	private async storeAPODData(apodData: APODData, result: ClassificationResult, imageBlob: Blob): Promise<void> {
		const r2Key = `${apodData.date}.jpg`;
		await this.env.APOD_R2.put(r2Key, imageBlob);

		const db = this.env.APOD_D1;
		
		try {
			const insertResult = await db.prepare(`
				INSERT OR REPLACE INTO apod_metadata 
				(date, title, explanation, image_url, r2_url, category, confidence, image_description, copyright, processed_at, is_relevant)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				apodData.date,
				apodData.title,
				apodData.explanation,
				apodData.hdurl || apodData.url,
				r2Key,
				result.category,
				result.confidence,
				result.imageDescription,
				apodData.copyright || null,
				new Date().toISOString(),
				1 // 1 for true
			).run();

			if (!insertResult.success) {
				throw new Error(`D1 insert failed: ${insertResult.error || 'Unknown error'}`);
			}

			const vector = {
				id: apodData.date,
				values: result.embeddings,
				metadata: {
					date: apodData.date,
					title: apodData.title,
					category: result.category,
					confidence: result.confidence,
				},
			};

			await this.env.VECTORIZE_INDEX.upsert([vector]);
			
		} catch (error) {
			await this.env.APOD_R2.delete(r2Key).catch(() => {});
			await db.prepare('DELETE FROM apod_metadata WHERE date = ?')
				.bind(apodData.date)
				.run()
				.catch(() => {});
			
			throw error;
		}
	}

	private async isAlreadyProcessed(date: string): Promise<boolean> {
		try {
			const result = await this.env.APOD_D1.prepare(
				'SELECT date FROM apod_metadata WHERE date = ? LIMIT 1'
			).bind(date).first();
			
			return !!result;
		} catch (error) {
			console.warn(`Error checking if ${date} is already processed: ${error}`);
			return false;
		}
	}

	private chunkArray<T>(array: T[], chunkSize: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += chunkSize) {
			chunks.push(array.slice(i, i + chunkSize));
		}
		return chunks;
	}

	private async delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private logFinalMetrics(): void {
		const duration = Date.now() - this.metrics.startTime;
		const total = this.metrics.processed + this.metrics.failed + this.metrics.skipped;
		
		console.log(`
=== APOD Processing Complete ===
📊 Total Items: ${total}
✅ Processed: ${this.metrics.processed}
❌ Failed: ${this.metrics.failed}
⏭️ Skipped: ${this.metrics.skipped}
👍 Relevant: ${this.metrics.relevant}
👎 Irrelevant: ${this.metrics.irrelevant}
⏱️ Duration: ${(duration / 1000).toFixed(2)}s
⚡ Rate: ${total > 0 ? (total / (duration / 1000)).toFixed(2) : 0} items/sec
		`);

		if (this.metrics.errors.length > 0) {
			console.log('\n=== Errors ===');
			this.metrics.errors.forEach(error => {
				console.log(`${error.date} [${error.step}]: ${error.error}`);
			});
		}
	}
}

class Semaphore {
	private permits: number;
	private promiseResolverQueue: Array<(value: void) => void> = [];

	constructor(permits: number) {
		this.permits = permits;
	}

	async acquire(): Promise<void> {
		if (this.permits > 0) {
			this.permits--;
			return Promise.resolve();
		}

		return new Promise<void>((resolver) => {
			this.promiseResolverQueue.push(resolver);
		});
	}

	release(): void {
		this.permits++;
		if (this.promiseResolverQueue.length > 0) {
			const resolver = this.promiseResolverQueue.shift();
			if (resolver) {
				this.permits--;
				resolver();
			}
		}
	}
}

const apodDataList: APODData[] = [];

export default {
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		try {
			console.log("🚀 Starting enhanced APOD classification worker...");
			
			const processor = new APODProcessor(env);
			
			// In a real application, you would fetch this data from the NASA API
			// For this example, we'll use the placeholder list.
			const metrics = await processor.processAPODData(apodDataList);
			
			if (metrics.failed > 0) {
				console.warn(`⚠️ Processing completed with ${metrics.failed} failures`);
			}
			
			console.log("✨ APOD classification worker completed successfully");
			
		} catch (error) {
			console.error("💥 Critical error in APOD classification worker:", error);
			
			throw error;
		}
	},
};