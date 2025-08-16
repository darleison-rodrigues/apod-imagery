import { APODData, ClassificationResult } from '../types';
import { CelestialImageValidator, ValidationResult } from '../utils/guardrails';

export class AIService {
	private ai: Ai;
    private validator: CelestialImageValidator;

	constructor(ai: Ai) {
		this.ai = ai;
        this.validator = new CelestialImageValidator();
	}

	/**
	 * Classifies APOD data using multiple AI models for comprehensive analysis
	 * @param apodData - The APOD metadata containing title and explanation
	 * @param imageBlob - The image blob for visual analysis
	 * @returns Promise<ClassificationResult> - Complete classification results
	 */
	async classifyAPOD(apodData: APODData, imageBlob: Blob): Promise<ClassificationResult> {
		console.log(`Classifying APOD for date: ${apodData.date}`);
		const combinedText = `${apodData.title}. ${apodData.explanation}`;
		
		try {
			const [imageAnalysis, textClassification, textEmbeddings] = await Promise.all([
				this.analyzeImage(imageBlob),
				this.classifyText(combinedText),
				this.generateEmbeddings(combinedText)
			]);

			const primaryCategory = textClassification[0]?.label || 'unknown';

			const validationResult = this.validator.validateCelestialImage(apodData.title, apodData.explanation);

			const result: ClassificationResult = {
				category: primaryCategory,
				confidence: textClassification[0]?.score || 0,
				imageDescription: imageAnalysis.description || 'Unable to generate description',
				embeddings: textEmbeddings,
				isRelevant: validationResult.isValid,
			};
			console.log(`Classification successful for date: ${apodData.date}. Is Relevant: ${result.isRelevant}`);
			return result;
		} catch (error) {
			console.error(`Classification failed for date: ${apodData.date}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw new Error(`APOD classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	

	/**
	 * Analyzes astronomical images using vision-language model
	 * @param imageBlob - The image to analyze
	 * @returns Promise containing image description and analysis
	 */
	private async analyzeImage(imageBlob: Blob): Promise<any> {
		const model = '@cf/llava-hf/llava-1.5-7b-hf';
		try {
			const imageArray = new Uint8Array(await imageBlob.arrayBuffer());
			
			const analysisPrompt = [
				'Analyze this astronomical image in detail.',
				'Identify celestial objects, cosmic phenomena, and structural features.',
				'Describe colors, brightness patterns, and spatial relationships.',
				'Note any telescopic or observational characteristics visible.'
			].join(' ');

			const inputs = {
				prompt: analysisPrompt,
				image: [...imageArray],
			};

			const result = await this.ai.run(model, inputs);
			return result;
		} catch (error) {
			console.error(`Image analysis with ${model} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	/**
	 * Classifies text content using natural language processing
	 * @param text - The text content to classify
	 * @returns Promise containing classification results with labels and scores
	 */
	private async classifyText(text: string): Promise<any> {
		const model = '@cf/huggingface/distilbert-sst-2-int8';
		try {
			// Preprocess text for better classification accuracy
			const processedText = this.preprocessTextForClassification(text);
			
			const result = await this.ai.run(model, { text: processedText });
			return result;
		} catch (error) {
			console.error(`Text classification with ${model} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	/**
	 * Generates vector embeddings for semantic search and similarity matching
	 * @param text - The text to embed
	 * @returns Promise<number[]> - Vector embeddings array
	 */	public async generateEmbeddings(text: string): Promise<number[]> {
		const model = '@cf/baai/bge-base-en-v1.5';
		try {
			// Clean and optimize text for embedding generation
			const optimizedText = this.optimizeTextForEmbedding(text);
			
			const result = await this.ai.run(model, { text: [optimizedText] });
			return result.data[0];
		} catch (error) {
			console.error(`Embedding generation with ${model} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	/**
	 * Preprocesses text content to improve classification accuracy
	 * @param text - Raw text content
	 * @returns Processed text optimized for classification
	 */	private preprocessTextForClassification(text: string): string {
		return text
			.replace(/\s+/g, ' ') // Normalize whitespace
			.replace(/[^\w\s.,!?-]/g, '') // Remove special characters except basic punctuation
			.trim()
			.substring(0, 512); // Limit length for model constraints
	}

	/**
	 * Optimizes text content for embedding generation
	 * @param text - Raw text content
	 * @returns Processed text optimized for embeddings
	 */	private optimizeTextForEmbedding(text: string): string {
		return text
			.replace(/\s+/g, ' ') // Normalize whitespace
			.replace(/\n+/g, ' ') // Replace line breaks with spaces
			.trim()
			.substring(0, 1024); // Allow longer text for embeddings
	}

	/**
	 * Validates model availability and configuration
	 * @returns Promise<boolean> - Whether AI services are properly configured
	 */	async validateConfiguration(): Promise<boolean> {
		try {
			// Test with minimal inputs to verify model availability
			const testText = "test";
			await this.ai.run('@cf/baai/bge-base-en-v1.5', { text: [testText] });
			return true;
		} catch (error) {
			console.error('AI service configuration validation failed:', error);
			return false;
		}
	}
}