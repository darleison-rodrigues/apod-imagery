import { APODData, ClassificationResult, Env } from '../types';

export class StorageService {
	private env: Env;

	constructor(env: Env) {
		this.env = env;
	}

	/**
	 * Stores complete APOD data including image, metadata, and vector embeddings
	 * @param apodData - APOD data to store
	 * @param result - Classification results with embeddings
	 * @param imageBlob - Image blob data to store in R2
	 * @returns Promise<void>
	 */
	async storeAPODData(
		apodData: APODData, 
		result: ClassificationResult, 
		imageBlob: Blob
	): Promise<void> {
		this.validateStoreInputs(apodData, result, imageBlob);
		
		const r2Key = this.generateR2Key(apodData.date, imageBlob.type);
		const transactionId = this.generateTransactionId();
		
		try {
			await this.executeStorageTransaction(apodData, result, imageBlob, r2Key, transactionId);
		} catch (error) {
			await this.rollbackTransaction(apodData.date, r2Key, transactionId);
			throw new Error(`Storage operation failed: ${this.extractErrorMessage(error)}`);
		}
	}

	/**
	 * Checks if an APOD item has already been processed and stored
	 * @param date - APOD date in YYYY-MM-DD format
	 * @returns Promise<boolean> - Whether the item exists in storage
	 */
	async isAlreadyProcessed(date: string): Promise<boolean> {
		this.validateDateFormat(date);
		
		try {
			const result = await this.env.APOD_D1.prepare(
				'SELECT date FROM apod_metadata WHERE date = ? LIMIT 1'
			).bind(date).first();
			
			return !!result;
		} catch (error) {
			// Return false on error to allow reprocessing rather than blocking
			return false;
		}
	}

	/**
	 * Retrieves APOD metadata by date
	 * @param date - APOD date in YYYY-MM-DD format
	 * @returns Promise<APODMetadata | null> - Stored metadata or null if not found
	 */
	async getAPODMetadata(date: string): Promise<any | null> {
		this.validateDateFormat(date);
		
		try {
			const result = await this.env.APOD_D1.prepare(`
				SELECT * FROM apod_metadata WHERE date = ?
			`).bind(date).first();
			
			return result || null;
		} catch (error) {
			throw new Error(`Failed to retrieve metadata for ${date}: ${this.extractErrorMessage(error)}`);
		}
	}

	/**
	 * Searches for similar APOD items using vector similarity
	 * @param queryEmbeddings - Vector embeddings to search against
	 * @param topK - Number of similar items to return
	 * @returns Promise<Array> - Similar APOD items with similarity scores
	 */
	async findSimilarAPODs(queryEmbeddings: number[], topK: number = 10): Promise<any[]> {
		this.validateEmbeddings(queryEmbeddings);
		this.validateTopK(topK);
		
		try {
			const searchResults = await this.env.VECTORIZE_INDEX.query(queryEmbeddings, {
				topK,
				returnValues: false,
				returnMetadata: true
			});
			
			return searchResults.matches || [];
		} catch (error) {
			throw new Error(`Vector search failed: ${this.extractErrorMessage(error)}`);
		}
	}

	/**
	 * Deletes all data associated with a specific APOD date
	 * @param date - APOD date to delete
	 * @returns Promise<boolean> - Whether deletion was successful
	 */
	async deleteAPODData(date: string): Promise<boolean> {
		this.validateDateFormat(date);
		
		try {
			// Get metadata to find R2 key before deletion
			const metadata = await this.getAPODMetadata(date);
			const r2Key = metadata?.r2_url;
			
			await Promise.allSettled([
				r2Key ? this.env.APOD_R2.delete(r2Key) : Promise.resolve(),
				this.env.APOD_D1.prepare('DELETE FROM apod_metadata WHERE date = ?').bind(date).run(),
				this.env.VECTORIZE_INDEX.deleteByIds([date])
			]);
			
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Validates database connection and table schema
	 * @returns Promise<boolean> - Whether storage services are accessible
	 */
	async validateConnection(): Promise<boolean> {
		try {
			// Test D1 connection
			await this.env.APOD_D1.prepare('SELECT 1 as test').first();
			
			// Test R2 connection
			await this.env.APOD_R2.head('__connection_test__');
			
			// Test Vectorize connection (basic query)
			await this.env.VECTORIZE_INDEX.query([0.1, 0.1, 0.1], { topK: 1 });
			
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Gets storage statistics and health information
	 * @returns Promise<StorageStats> - Current storage statistics
	 */
	async getStorageStats(): Promise<any> {
		try {
			const [metadataCount, relevantCount] = await Promise.all([
				this.env.APOD_D1.prepare('SELECT COUNT(*) as total FROM apod_metadata').first(),
				this.env.APOD_D1.prepare('SELECT COUNT(*) as relevant FROM apod_metadata WHERE is_relevant = 1').first()
			]);
			
			return {
				totalItems: Number(metadataCount?.total || 0),
				relevantItems: Number(relevantCount?.relevant || 0),
				irrelevantItems: Number(metadataCount?.total || 0) - Number(relevantCount?.relevant || 0),
				lastUpdated: new Date().toISOString()
			};
		} catch (error) {
			throw new Error(`Failed to retrieve storage stats: ${this.extractErrorMessage(error)}`);
		}
	}

	/**
	 * Executes the complete storage transaction atomically
	 * @private
	 */
	private async executeStorageTransaction(
		apodData: APODData,
		result: ClassificationResult,
		imageBlob: Blob,
		r2Key: string,
		transactionId: string
	): Promise<void> {
		// Store image in R2 first (largest operation)
		await this.storeImageInR2(r2Key, imageBlob, transactionId);
		
		// Store metadata in D1
		await this.storeMetadataInD1(apodData, result, r2Key, transactionId);
		
		// Store vector embeddings
		await this.storeVectorEmbeddings(apodData, result, transactionId);
	}

	/**
	 * Stores image data in R2 bucket with metadata
	 * @private
	 */
	private async storeImageInR2(r2Key: string, imageBlob: Blob, transactionId: string): Promise<void> {
		const customMetadata = {
			'transaction-id': transactionId,
			'content-type': imageBlob.type,
			'upload-timestamp': new Date().toISOString()
		};

		await this.env.APOD_R2.put(r2Key, imageBlob, {
			customMetadata,
			httpMetadata: {
				contentType: imageBlob.type
			}
		});
	}

	/**
	 * Stores metadata in D1 database
	 * @private
	 */
	private async storeMetadataInD1(
		apodData: APODData,
		result: ClassificationResult,
		r2Key: string,
		transactionId: string
	): Promise<void> {
		const insertResult = await this.env.APOD_D1.prepare(`
			INSERT OR REPLACE INTO apod_metadata 
			(date, title, explanation, image_url, r2_url, category, confidence, 
			 image_description, copyright, processed_at, is_relevant, transaction_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
			result.isRelevant ? 1 : 0,
			transactionId
		).run();

		if (!insertResult.success) {
			throw new Error(`Database insert failed: ${insertResult.error || 'Unknown database error'}`);
		}
	}

	/**
	 * Stores vector embeddings in Vectorize index
	 * @private
	 */
	private async storeVectorEmbeddings(
		apodData: APODData,
		result: ClassificationResult,
		transactionId: string
	): Promise<void> {
		const vectorRecord = {
			id: apodData.date,
			values: result.embeddings,
			metadata: {
				date: apodData.date,
				title: apodData.title,
				category: result.category,
				confidence: result.confidence,
				transactionId,
				processedAt: new Date().toISOString()
			}
		};

		await this.env.VECTORIZE_INDEX.upsert([vectorRecord]);
	}

	/**
	 * Rolls back failed transaction by cleaning up partial data
	 * @private
	 */
	private async rollbackTransaction(date: string, r2Key: string, transactionId: string): Promise<void> {
		const cleanupPromises = [
			this.env.APOD_R2.delete(r2Key),
			this.env.APOD_D1.prepare('DELETE FROM apod_metadata WHERE date = ? AND transaction_id = ?')
				.bind(date, transactionId).run(),
			this.env.VECTORIZE_INDEX.deleteByIds([date])
		];

		await Promise.allSettled(cleanupPromises);
	}

	/**
	 * Validates inputs for the storage operation
	 * @private
	 */
	private validateStoreInputs(apodData: APODData, result: ClassificationResult, imageBlob: Blob): void {
		if (!apodData?.date || !apodData?.title) {
			throw new Error('Invalid APOD data: missing required fields');
		}

		if (!result?.embeddings || !Array.isArray(result.embeddings)) {
			throw new Error('Invalid classification result: missing or invalid embeddings');
		}

		if (!imageBlob || imageBlob.size === 0) {
			throw new Error('Invalid image blob: empty or null');
		}
	}

	/**
	 * Validates date format (YYYY-MM-DD)
	 * @private
	 */
	private validateDateFormat(date: string): void {
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!date || !dateRegex.test(date)) {
			throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD format`);
		}
	}

	/**
	 * Validates vector embeddings array
	 * @private
	 */
	private validateEmbeddings(embeddings: number[]): void {
		if (!Array.isArray(embeddings) || embeddings.length === 0) {
			throw new Error('Invalid embeddings: must be non-empty number array');
		}

		if (!embeddings.every(val => typeof val === 'number' && !isNaN(val))) {
			throw new Error('Invalid embeddings: all values must be valid numbers');
		}
	}

	/**
	 * Validates topK parameter for vector search
	 * @private
	 */
	private validateTopK(topK: number): void {
		if (!Number.isInteger(topK) || topK < 1 || topK > 1000) {
			throw new Error('Invalid topK: must be integer between 1 and 1000');
		}
	}

	/**
	 * Generates a unique R2 key for image storage
	 * @private
	 */
	private generateR2Key(date: string, contentType: string): string {
		const extension = this.getFileExtensionFromContentType(contentType);
		return `apod-images/${date}${extension}`;
	}

	/**
	 * Maps content type to file extension
	 * @private
	 */
	private getFileExtensionFromContentType(contentType: string): string {
		const extensionMap: Record<string, string> = {
			'image/jpeg': '.jpg',
			'image/jpg': '.jpg',
			'image/png': '.png',
			'image/gif': '.gif',
			'image/webp': '.webp'
		};
		
		return extensionMap[contentType?.toLowerCase()] || '.jpg';
	}

	/**
	 * Generates a unique transaction ID for tracking operations
	 * @private
	 */
	private generateTransactionId(): string {
		const timestamp = Date.now().toString(36);
		const randomSuffix = Math.random().toString(36).substring(2, 8);
		return `tx_${timestamp}_${randomSuffix}`;
	}

	/**
	 * Extracts meaningful error message from various error types
	 * @private
	 */
	private extractErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		return 'Unknown storage error occurred';
	}
}