import { APODProcessor } from './services/processor';
import { Env, APODData } from './types';

const apodDataList: APODData[] = [];

export default {
	async scheduled(
		controller: ScheduledController, 
		env: Env, 
		ctx: ExecutionContext
	): Promise<void> {
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