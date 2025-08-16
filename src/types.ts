/**
 * Cloudflare Workers Environment bindings and configuration
 */
export interface Env {
	/** Cloudflare AI binding for ML model access */
	AI: Ai;
	/** Vectorize index for embeddings storage and similarity search */
	VECTORIZE_INDEX: VectorizeIndex;
	/** R2 bucket for image file storage */
	APOD_R2: R2Bucket;
	/** D1 database for metadata storage */
	APOD_D1: D1Database;
	
	// Configuration environment variables
	/** Maximum number of concurrent processing operations */
	MAX_CONCURRENT_PROCESSING?: string;
	/** Number of items to process in each batch */
	BATCH_SIZE?: string;
	/** Number of retry attempts for failed operations */
	RETRY_ATTEMPTS?: string;
	/** Enable detailed logging output */
	ENABLE_DETAILED_LOGGING?: string;
	/** NASA API Key for accessing APOD data */
	NASA_API_KEY?: string;
}

/**
 * APOD (Astronomy Picture of the Day) data structure from NASA API
 */
export interface APODData {
	/** Date in YYYY-MM-DD format */
	date: string;
	/** Title of the astronomical image or content */
	title: string;
	/** Detailed explanation of the astronomical content */
	explanation: string;
	/** URL to the image or media content */
	url: string;
	/** Type of media content (image, video, etc.) */
	media_type?: string;
	/** High-definition URL if available */
	hdurl?: string;
	/** Copyright information for the image */
	copyright?: string;
	/** Service version from NASA API */
	service_version?: string;
}

/**
 * Comprehensive metrics for processing operations with timing and error tracking
 */
export interface ProcessingMetrics {
	/** Number of items successfully processed */
	processed: number;
	/** Number of items that failed processing */
	failed: number;
	/** Number of items skipped (already processed, non-image, etc.) */
	skipped: number;
	/** Number of items classified as astronomically relevant */
	relevant: number;
	/** Number of items classified as not astronomically relevant */
	irrelevant: number;
	/** Processing start timestamp in milliseconds */
	startTime: number;
	/** Processing end timestamp in milliseconds */
	endTime?: number;
	/** Total processing duration in milliseconds */
	duration?: number;
	/** Processing rate in items per second */
	processingRate?: number;
	/** Detailed error information for failed items */
	errors: ProcessingError[];
}

/**
 * Detailed error information for tracking processing failures
 */
export interface ProcessingError {
	/** Date of the APOD item that failed */
	date: string;
	/** Error message describing the failure */
	error: string;
	/** Processing step where the error occurred */
	step: string;
	/** Timestamp when the error occurred */
	timestamp?: string;
	/** Number of retry attempts made */
	attempts?: number;
}

/**
 * Result of AI classification including category, confidence, and embeddings
 */
export interface ClassificationResult {
	/** Classified category of the astronomical content */
	category: string;
	/** Confidence score of the classification (0-1) */
	confidence: number;
	/** AI-generated description of the image content */
	imageDescription: string;
	/** Vector embeddings for similarity search */
	embeddings: number[];
	/** Whether the content is astronomically relevant */
	isRelevant: boolean;
	/** Additional metadata from classification models */
	metadata?: ClassificationMetadata;
}

/**
 * Additional metadata from AI classification models
 */
export interface ClassificationMetadata {
	/** Alternative category suggestions with scores */
	alternativeCategories?: Array<{ label: string; score: number }>;
	/** Detected objects or features in the image */
	detectedFeatures?: string[];
	/** Processing model versions used */
	modelVersions?: {
		imageModel?: string;
		textModel?: string;
		embeddingModel?: string;
	};
}

/**
 * Configuration settings for processing operations with validation
 */
export interface ProcessingConfig {
	/** Maximum number of concurrent processing operations */
	maxConcurrent: number;
	/** Number of items to process in each batch */
	batchSize: number;
	/** Number of retry attempts for failed operations */
	retryAttempts: number;
	/** Enable detailed logging output */
	enableDetailedLogging: boolean;
	/** Delay between batches in milliseconds */
	batchDelayMs: number;
	/** Maximum total processing time in milliseconds */
	maxProcessingTimeMs: number;
}

/**
 * Metadata stored in D1 database for each processed APOD item
 */
export interface APODMetadata {
	/** Date in YYYY-MM-DD format (primary key) */
	date: string;
	/** Title of the astronomical content */
	title: string;
	/** Detailed explanation */
	explanation: string;
	/** Original image URL */
	image_url: string;
	/** R2 storage key for the image */
	r2_url: string;
	/** AI-classified category */
	category: string;
	/** Classification confidence score */
	confidence: number;
	/** AI-generated image description */
	image_description: string;
	/** Copyright information */
	copyright?: string;
	/** Processing timestamp */
	processed_at: string;
	/** Whether content is astronomically relevant */
	is_relevant: boolean;
	/** Transaction ID for operation tracking */
	transaction_id?: string;
}

/**
 * Vector record structure for Vectorize storage
 */
export interface VectorRecord {
	/** Unique identifier (APOD date) */
	id: string;
	/** Vector embeddings array */
	values: number[];
	/** Associated metadata */
	metadata: VectorMetadata;
}

/**
 * Metadata associated with vector embeddings
 */
export interface VectorMetadata {
	/** APOD date */
	date: string;
	/** Title of the content */
	title: string;
	/** Classified category */
	category: string;
	/** Classification confidence */
	confidence: number;
	/** Transaction ID */
	transactionId?: string;
	/** Processing timestamp */
	processedAt?: string;
}

/**
 * Storage statistics and health information
 */
export interface StorageStats {
	/** Total number of items stored */
	totalItems: number;
	/** Number of astronomically relevant items */
	relevantItems: number;
	/** Number of items classified as not relevant */
	irrelevantItems: number;
	/** Timestamp of last update */
	lastUpdated: string;
	/** Storage health indicators */
	health?: StorageHealthStatus;
}

/**
 * Storage service health status
 */
export interface StorageHealthStatus {
	/** D1 database connectivity */
	d1Connected: boolean;
	/** R2 bucket accessibility */
	r2Connected: boolean;
	/** Vectorize index availability */
	vectorizeConnected: boolean;
	/** Overall health status */
	healthy: boolean;
	/** Last health check timestamp */
	lastCheck: string;
}

/**
 * Vector similarity search result
 */
export interface SimilaritySearchResult {
	/** Matching vector record ID */
	id: string;
	/** Similarity score (0-1) */
	score: number;
	/** Associated metadata */
	metadata: VectorMetadata;
	/** Vector values (optional) */
	values?: number[];
}

/**
 * Batch processing status for monitoring
 */
export interface BatchStatus {
	/** Current batch number */
	currentBatch: number;
	/** Total number of batches */
	totalBatches: number;
	/** Items in current batch */
	batchSize: number;
	/** Overall progress percentage */
	progressPercentage: number;
	/** Estimated time remaining in milliseconds */
	estimatedTimeRemaining?: number;
}

/**
 * Service validation result
 */
export interface ServiceValidation {
	/** Whether AI service is accessible */
	aiServiceValid: boolean;
	/** Whether storage services are accessible */
	storageServiceValid: boolean;
	/** Overall service health */
	allServicesValid: boolean;
	/** Validation timestamp */
	validatedAt: string;
	/** Detailed validation messages */
	details?: string[];
}

/**
 * Processing operation result
 */
export interface ProcessingResult {
	/** Whether operation completed successfully */
	success: boolean;
	/** Processing metrics */
	metrics: ProcessingMetrics;
	/** Error message if operation failed */
	error?: string;
	/** Additional operation details */
	details?: string;
}

/**
 * Configuration validation result
 */
export interface ConfigValidation {
	/** Whether configuration is valid */
	isValid: boolean;
	/** Validation error messages */
	errors: string[];
	/** Validation warnings */
	warnings: string[];
	/** Validated configuration object */
	config?: ProcessingConfig;
}

export class EnhancedRateLimiter {
	private consecutiveFailures: number = 0;
	private lastRequestTime: number = 0;
	private readonly baseDelay: number;
	private readonly maxDelay: number;

	constructor(baseDelay: number = 1000, maxDelay: number = 300000) {
		this.baseDelay = baseDelay;
		this.maxDelay = maxDelay;
	}

	async waitBeforeRequest(): Promise<void> {
		const currentTime = Date.now();
		const timeSinceLastRequest = currentTime - this.lastRequestTime;
		
		let delay = this.baseDelay;
		
		// Apply exponential backoff if there have been consecutive failures
		if (this.consecutiveFailures > 0) {
			delay = Math.min(
				this.baseDelay * Math.pow(2, this.consecutiveFailures),
				this.maxDelay
			);
			// Add jitter to prevent thundering herd
			delay += Math.random() * (delay * 0.1);
		}

		// Ensure minimum time between requests
		if (timeSinceLastRequest < delay) {
			const sleepTime = delay - timeSinceLastRequest;
			await new Promise(resolve => setTimeout(resolve, sleepTime));
		}

		this.lastRequestTime = Date.now();
	}

	handleSuccess(): void {
		this.consecutiveFailures = 0;
	}

	handleFailure(): void {
		this.consecutiveFailures++;
	}

	async handleRateLimit(): Promise<void> {
		this.consecutiveFailures++;
		const delay = Math.min(
			this.baseDelay * Math.pow(2, this.consecutiveFailures),
			this.maxDelay
		);
		console.log(`Rate limit hit. Waiting ${delay}ms (attempt ${this.consecutiveFailures})`);
		await new Promise(resolve => setTimeout(resolve, delay));
	}
}