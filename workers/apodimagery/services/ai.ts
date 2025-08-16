import { Ai } from '@cloudflare/ai';
import { APODData, ClassificationResult } from '../types';

export class AIService {
	private ai: Ai;

	constructor(ai: Ai) {
		this.ai = ai;
	}

	async classifyAPOD(apodData: APODData, imageBlob: Blob): Promise<ClassificationResult> {
		const text = `${apodData.title}. ${apodData.explanation}`;
		
		const [imageToTextResult, textClassificationResult, textEmbeddings] = await Promise.all([
			this.runImageToText(imageBlob),
			this.runTextClassification(text),
			this.generateTextEmbeddings(text)
		]);

		const category = textClassificationResult[0]?.label || 'unknown';
		const isRelevant = this.isCelestialObject(category);

		return {
			category,
			confidence: textClassificationResult[0]?.score || 0,
			imageDescription: imageToTextResult.description || 'No description available',
			embeddings: textEmbeddings,
			isRelevant,
		};
	}

	private isCelestialObject(category: string): boolean {
		const celestialCategories = [
			"Galaxy", "Nebula", "Star Cluster", "Planet", 
			"Comet", "Asteroid", "Supernova", "Black Hole"
		];
		return celestialCategories.includes(category);
	}

	private async runImageToText(imageBlob: Blob): Promise<any> {
		const model = '@cf/llava-hf/llava-1.5-7b-hf';
		const inputs = {
			prompt: 'Describe this astronomical image in detail, including any celestial objects, phenomena, or structures visible.',
			image: [...new Uint8Array(await imageBlob.arrayBuffer())],
		};
		return await this.ai.run(model, inputs);
	}

	private async runTextClassification(text: string): Promise<any> {
		const model = '@cf/huggingface/distilbert-sst-2-int8';
		return await this.ai.run(model, { text });
	}

	private async generateTextEmbeddings(text: string): Promise<number[]> {
		const model = '@cf/baai/bge-base-en-v1.5';
		const { data: embeddings } = await this.ai.run(model, { text: [text] });
		return embeddings[0];
	}
}