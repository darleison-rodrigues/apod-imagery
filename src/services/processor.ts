import { APODData, ProcessingMetrics, ProcessingConfig, Env } from '../types';
import { Semaphore } from '../utils/semaphore';
import { AIService } from './ai';
import { StorageService } from './storage';

export class APODProcessor {
	private ai: AIService;
	private storage: StorageService;
	private metrics: ProcessingMetrics;
	private config: ProcessingConfig;

	private db: D1Database;
	private vectorizeIndex: VectorizeIndex; // Add this line

	constructor(env: Env) {
		this.ai = new AIService(env.AI);
		this.storage = new StorageService(env);
		this.db = env.APOD_D1;
		this.vectorizeIndex = env.VECTORIZE_INDEX; // Initialize Vectorize binding
		this.metrics = this.initializeMetrics();
		this.config = this.loadConfiguration(env);
	}

	/**
	 * Processes a list of APOD data items with classification and storage
	 * @param apodDataList - Array of APOD data to process
	 * @returns Promise<ProcessingMetrics> - Complete processing statistics
	 */
	async processAPODData(apodDataList: APODData[]): Promise<ProcessingMetrics> {
		console.log(`Starting processing for ${apodDataList.length} APOD items.`);
		this.validateInput(apodDataList);
		
		const batches = this.createBatches(apodDataList, this.config.batchSize);
		
		for (const [batchIndex, batch] of batches.entries()) {
			await this.processBatchWithConcurrency(batch);
			
			// Brief delay between batches to prevent overwhelming downstream services
			if (batchIndex < batches.length - 1) {
				await this.delay(this.config.batchDelayMs);
			}
		}

		const finalMetrics = this.finalizeProcessing();
		console.log('APOD processing complete.');
		return finalMetrics;
	}

	/**
	 * Processes a batch of APOD items with controlled concurrency
	 * @param batch - Batch of APOD data items to process
	 */
	private async processBatchWithConcurrency(batch: APODData[]): Promise<void> {
		const semaphore = new Semaphore(this.config.maxConcurrent);
		
		const processingPromises = batch.map(async (apodData) => {
			await semaphore.acquire();
			try {
				await this.processWithRetryLogic(apodData);
			} finally {
				semaphore.release();
			}
		});

		await Promise.allSettled(processingPromises);
	}

	/**
	 * Processes a single APOD item with retry logic for resilience
	 * @param apodData - APOD data item to process
	 * @param currentAttempt - Current retry attempt number
	 */
	private async processWithRetryLogic(apodData: APODData, currentAttempt: number = 1): Promise<void> {
		try {
			await this.processSingleAPODItem(apodData);
			this.metrics.processed++;
		} catch (error) {
			const errorMessage = this.extractErrorMessage(error);
			
			if (currentAttempt < this.config.retryAttempts) {
				const backoffDelay = this.calculateBackoffDelay(currentAttempt);
				await this.delay(backoffDelay);
				return this.processWithRetryLogic(apodData, currentAttempt + 1);
			} else {
				this.recordProcessingFailure(apodData, errorMessage);
			}
		}
	}

	/**
	 * Processes a single APOD item through the complete pipeline
	 * @param apodData - Individual APOD data item to process
	 */
		private async processSingleAPODItem(apodData: APODData): Promise<void> {
		// Skip non-image media types
		if (!this.isImageMedia(apodData)) {
			console.log(`Skipping ${apodData.date}: Not an image media type.`);
			this.metrics.skipped++;
			return;
		}

		// Skip already processed items
		if (await this.storage.isAlreadyProcessed(apodData.date)) {
			console.log(`Skipping ${apodData.date}: Already processed.`);
			this.metrics.skipped++;
			return;
		}

		try {
			const imageBlob = await this.fetchImageContent(apodData.url);
			const classificationResult = await this.ai.classifyAPOD(apodData, imageBlob);
			
			if (classificationResult.isRelevant) {
				this.metrics.relevant++;
				await this.storage.storeAPODData(apodData, classificationResult, imageBlob);
				console.log(`Successfully processed and stored ${apodData.date}.`);
			} else {
				this.metrics.irrelevant++;
			}
		} catch (error) {
			throw error; // Re-throw to be caught by retry logic
		}
	}

	/**
	 * Fetches image content from the provided URL
	 * @param imageUrl - URL of the image to fetch
	 * @returns Promise<Blob> - Image blob data
	 */
	private async fetchImageContent(imageUrl: string): Promise<Blob> {
		const response = await fetch(imageUrl);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
		}

		const contentType = response.headers.get('content-type');
		if (!contentType?.startsWith('image/')) {
			throw new Error(`Invalid content type: ${contentType}`);
		}

		return response.blob();
	}

	/**
	 * Validates input data before processing
	 * @param apodDataList - List of APOD data to validate
	 */
	private validateInput(apodDataList: APODData[]): void {
		if (!Array.isArray(apodDataList)) {
			throw new Error('APOD data must be an array');
		}

		if (apodDataList.length === 0) {
			throw new Error('APOD data array cannot be empty');
		}

		// Validate required fields for each item
		for (const item of apodDataList) {
			if (!item.date || !item.url) {
				throw new Error(`Invalid APOD data item: missing required fields (date, url)`);
			}
		}
	}

	/**
	 * Determines if the media type is processable (image)
	 * @param apodData - APOD data item to check
	 * @returns boolean - Whether the item contains processable image media
	 */
	private isImageMedia(apodData: APODData): boolean {
		return !apodData.media_type || apodData.media_type === 'image';
	}

	/**
	 * Extracts a meaningful error message from various error types
	 * @param error - Error object or unknown type
	 * @returns string - Formatted error message
	 */
	private extractErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		return 'Unknown processing error occurred';
	}

	/**
	 * Calculates exponential backoff delay for retry attempts
	 * @param attempt - Current attempt number
	 * @returns number - Delay in milliseconds
	 */
	private calculateBackoffDelay(attempt: number): number {
		const baseDelay = 1000; // 1 second base delay
		const exponentialFactor = Math.pow(2, attempt - 1);
		const jitter = Math.random() * 500; // Add jitter to prevent thundering herd
		
		return Math.min(baseDelay * exponentialFactor + jitter, 30000); // Cap at 30 seconds
	}

	/**
	 * Records processing failure in metrics
	 * @param apodData - Failed APOD data item
	 * @param errorMessage - Error message describing the failure
	 */
	private recordProcessingFailure(apodData: APODData, errorMessage: string): void {
		this.metrics.failed++;
		this.metrics.errors.push({
			date: apodData.date,
			error: errorMessage,
			step: 'processing',
			timestamp: new Date().toISOString()
		});
	}

	/**
	 * Initializes processing metrics tracking
	 * @returns ProcessingMetrics - Fresh metrics object
	 */
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

	/**
	 * Loads configuration from environment variables with validation
	 * @param env - Environment object containing configuration
	 * @returns ProcessingConfig - Validated configuration object
	 */	
	private loadConfiguration(env: Env): ProcessingConfig {
		const config = {
			maxConcurrent: this.parseIntegerConfig(env.MAX_CONCURRENT_PROCESSING, 5, 1, 50),
			batchSize: this.parseIntegerConfig(env.BATCH_SIZE, 10, 1, 100),
			retryAttempts: this.parseIntegerConfig(env.RETRY_ATTEMPTS, 3, 1, 10),
			enableDetailedLogging: env.ENABLE_DETAILED_LOGGING === 'true',
			batchDelayMs: 100,
			maxProcessingTimeMs: 30 * 60 * 1000 // 30 minutes
		};

		this.validateConfiguration(config);
		return config;
	}

	/**
	 * Parses and validates integer configuration values
	 * @param value - Environment variable value
	 * @param defaultValue - Default value if parsing fails
	 * @param min - Minimum allowed value
	 * @param max - Maximum allowed value
	 * @returns number - Validated integer value
	 */
	private parseIntegerConfig(value: string | undefined, defaultValue: number, min: number, max: number): number {
		if (!value) return defaultValue;
		
		const parsed = parseInt(value, 10);
		if (isNaN(parsed)) return defaultValue;
		
		return Math.max(min, Math.min(max, parsed));
	}

	/**
	 * Validates the loaded configuration for consistency
	 * @param config - Configuration object to validate
	 */
	private validateConfiguration(config: ProcessingConfig): void {
		if (config.maxConcurrent * config.batchSize > 500) {
			throw new Error('Configuration would create excessive concurrent operations');
		}
	}

	/**
	 * Creates batches from the input array
	 * @param array - Array to batch
	 * @param chunkSize - Size of each batch
	 * @returns T[][] - Array of batches
	 */
	private createBatches<T>(array: T[], chunkSize: number): T[][] {
		const batches: T[][] = [];
		for (let i = 0; i < array.length; i += chunkSize) {
			batches.push(array.slice(i, i + chunkSize));
		}
		return batches;
	}

	/**
	 * Creates a delay for the specified duration
	 * @param milliseconds - Duration to delay in milliseconds
	 * @returns Promise<void> - Resolves after the delay
	 */
	private async delay(milliseconds: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, milliseconds));
	}

	/**
	 * Finalizes processing and returns comprehensive metrics
	 * @returns ProcessingMetrics - Complete processing statistics
	 */
	private finalizeProcessing(): ProcessingMetrics {
		const endTime = Date.now();
		const duration = endTime - this.metrics.startTime;
		
		return {
			...this.metrics,
			endTime,
			duration,
			processingRate: this.calculateProcessingRate(duration)
		};
	}

	/**
	 * Calculates the processing rate (items per second)
	 * @param duration - Total processing duration in milliseconds
	 * @returns number - Processing rate in items per second
	 */
	private calculateProcessingRate(duration: number): number {
		const totalItems = this.metrics.processed + this.metrics.failed + this.metrics.skipped;
		return totalItems > 0 ? totalItems / (duration / 1000) : 0;
	}

	/**
	 * Gets current processing status for monitoring
	 * @returns ProcessingMetrics - Current processing metrics
	 */
	    getProcessingStatus(): ProcessingMetrics {
        return { ...this.metrics };
    }

    

    /**
     * Validates that all required services are properly initialized
     * @returns Promise<boolean> - Whether all services are ready
     */
    async validateServices(): Promise<boolean> {
        try {
            const [aiValid, storageValid] = await Promise.all([
                this.ai.validateConfiguration(),
                this.storage.validateConnection()
            ]);
            
            return aiValid && storageValid;
        } catch (error) {
            return false;
        }
    }
}