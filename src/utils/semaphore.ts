export class Semaphore {
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