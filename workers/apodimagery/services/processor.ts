import { Ai } from '@cloudflare/ai';
import { APODData, ProcessingMetrics, ProcessingConfig, Env } from '../types';
import { Semaphore } from '../utils/semaphore';
import { AIService } from './ai';
import { StorageService } from './storage';

export class APODProcessor {
	private ai: AIService;
	private storage: StorageService;
	private metrics: ProcessingMetrics;
	private config: ProcessingConfig;

	constructor(env: Env) {
		this.ai = new AIService(new Ai(env.AI));
		this.storage = new StorageService(env);
		this.metrics = this.initializeMetrics();
		this.config = this.loadConfig(env);
	}

	async processAPODData(apodDataList: APODData[]): Promise<ProcessingMetrics> {
		console.log(`Starting APOD classification for ${apodDataList.length} items...`);
		
		const batches = this.chunkArray(apodDataList, this.config.batchSize);
		
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
		const semaphore = new Semaphore(this.config.maxConcurrent);
		
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
			
			if (this.config.enableDetailedLogging) {
				console.log(`✅ Successfully processed ${apodData.date}`);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			
			if (attempt < this.config.retryAttempts) {
				console.log(`⚠️ Retry ${attempt}/${this.config.retryAttempts} for ${apodData.date}: ${errorMessage}`);
				await this.delay(1000 * attempt);
				return this.processWithRetry(apodData, attempt + 1);
			} else {
				console.error(`❌ Failed to process ${apodData.date} after ${this.config.retryAttempts} attempts: ${errorMessage}`);
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

		if (await this.storage.isAlreadyProcessed(apodData.date)) {
			console.log(`Skipping ${apodData.date} - already processed`);
			this.metrics.skipped++;
			return;
		}

		const imageResponse = await fetch(apodData.url);
		if (!imageResponse.ok) {
			throw new Error(`Failed to fetch image from ${apodData.url}`);
		}
		const imageBlob = await imageResponse.blob();

		const classificationResult = await this.ai.classifyAPOD(apodData, imageBlob);
		
		if (classificationResult.isRelevant) {
			this.metrics.relevant++;
			await this.storage.storeAPODData(apodData, classificationResult, imageBlob);
		} else {
			this.metrics.irrelevant++;
			if (this.config.enableDetailedLogging) {
				console.log(`Skipping ${apodData.date} - not a relevant celestial object.`);
			}
		}
	}

	private initializeMetrics(): ProcessingMetrics {
		return {
			processed: 0,
			failed: 0,
			skipped: 0,
			relevant: 0,
			irrelevant: 0,
			startTime: Date.now(),
			errors: []
		};
	}

	private loadConfig(env: Env): ProcessingConfig {
		return {
			maxConcurrent: parseInt(env.MAX_CONCURRENT_PROCESSING || '5'),
			batchSize: parseInt(env.BATCH_SIZE || '10'),
			retryAttempts: parseInt(env.RETRY_ATTEMPTS || '3'),
			enableDetailedLogging: env.ENABLE_DETAILED_LOGGING === 'true'
		};
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