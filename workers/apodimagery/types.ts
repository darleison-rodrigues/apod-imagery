export interface Env {
	AI: any;
	VECTORIZE_INDEX: VectorizeIndex;
	APOD_R2: R2Bucket;
	APOD_D1: D1Database;
	MAX_CONCURRENT_PROCESSING?: string;
	BATCH_SIZE?: string;
	RETRY_ATTEMPTS?: string;
	ENABLE_DETAILED_LOGGING?: string;
}

export interface APODData {
	date: string;
	title: string;
	explanation: string;
	url: string;
	media_type?: string;
	hdurl?: string;
	copyright?: string;
}

export interface ProcessingMetrics {
	processed: number;
	failed: number;
	skipped: number;
	relevant: number;
	irrelevant: number;
	startTime: number;
	errors: Array<{ date: string; error: string; step: string }>;
}

export interface ClassificationResult {
	category: string;
	confidence: number;
	imageDescription: string;
	embeddings: number[];
	isRelevant: boolean;
}

export interface ProcessingConfig {
	maxConcurrent: number;
	batchSize: number;
	retryAttempts: number;
	enableDetailedLogging: boolean;
}