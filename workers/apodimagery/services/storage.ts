import { APODData, ClassificationResult, Env } from '../types';

export class StorageService {
	private env: Env;

	constructor(env: Env) {
		this.env = env;
	}

	async storeAPODData(
		apodData: APODData, 
		result: ClassificationResult, 
		imageBlob: Blob
	): Promise<void> {
		const r2Key = `${apodData.date}.jpg`;
		
		try {
			// Store image in R2
			await this.env.APOD_R2.put(r2Key, imageBlob);

			// Store metadata in D1
			await this.storeMetadata(apodData, result, r2Key);

			// Store vector embeddings
			await this.storeVector(apodData, result);
			
		} catch (error) {
			// Cleanup on failure
			await this.cleanup(apodData.date, r2Key);
			throw error;
		}
	}

	async isAlreadyProcessed(date: string): Promise<boolean> {
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

	private async storeMetadata(
		apodData: APODData, 
		result: ClassificationResult, 
		r2Key: string
	): Promise<void> {
		const insertResult = await this.env.APOD_D1.prepare(`
			INSERT OR REPLACE INTO apod_metadata 
			(date, title, explanation, image_url, r2_url, category, confidence, 
			 image_description, copyright, processed_at, is_relevant)
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
			1
		).run();

		if (!insertResult.success) {
			throw new Error(`D1 insert failed: ${insertResult.error || 'Unknown error'}`);
		}
	}

	private async storeVector(apodData: APODData, result: ClassificationResult): Promise<void> {
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
	}

	private async cleanup(date: string, r2Key: string): Promise<void> {
		await Promise.allSettled([
			this.env.APOD_R2.delete(r2Key),
			this.env.APOD_D1.prepare('DELETE FROM apod_metadata WHERE date = ?')
				.bind(date)
				.run()
		]);
	}
}