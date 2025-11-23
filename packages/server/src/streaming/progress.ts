/**
 * @lens/server - Streaming Progress Utilities
 *
 * Helpers for streaming progress during long-running operations
 * like embedding generation, document processing, etc.
 */

// =============================================================================
// Types
// =============================================================================

/** Progress callback */
export type ProgressCallback = (progress: Progress) => void;

/** Progress update */
export interface Progress {
	/** Progress percentage (0-100) */
	percent: number;
	/** Current stage/phase */
	stage?: string;
	/** Items processed */
	processed?: number;
	/** Total items to process */
	total?: number;
	/** Current item being processed */
	current?: string;
	/** Estimated time remaining in ms */
	eta?: number;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

/** Streaming operation options */
export interface StreamingOptions<T> {
	/** Progress callback */
	onProgress?: ProgressCallback;
	/** Batch size for processing */
	batchSize?: number;
	/** Delay between batches in ms */
	batchDelay?: number;
	/** Transform each item before processing */
	transform?: (item: T) => T | Promise<T>;
}

// =============================================================================
// Progress Tracker
// =============================================================================

/**
 * Track progress of long-running operations
 *
 * @example
 * ```typescript
 * const tracker = createProgressTracker({
 *   total: documents.length,
 *   onProgress: (p) => sseHandler.sendProgress(opId, {
 *     progress: p.percent,
 *     stage: p.stage,
 *     processed: p.processed,
 *     total: p.total,
 *     done: false,
 *   }),
 * });
 *
 * tracker.setStage('Loading documents');
 * for (const doc of documents) {
 *   await processDocument(doc);
 *   tracker.increment();
 * }
 *
 * tracker.complete();
 * ```
 */
export class ProgressTracker {
	private processed = 0;
	private total: number;
	private stage?: string;
	private startTime: number;
	private onProgress?: ProgressCallback;

	constructor(options: { total: number; onProgress?: ProgressCallback; stage?: string }) {
		this.total = options.total;
		this.onProgress = options.onProgress;
		this.stage = options.stage;
		this.startTime = Date.now();
	}

	/**
	 * Set current stage
	 */
	setStage(stage: string): void {
		this.stage = stage;
		this.notify();
	}

	/**
	 * Increment processed count
	 */
	increment(count = 1, current?: string): void {
		this.processed = Math.min(this.processed + count, this.total);
		this.notify(current);
	}

	/**
	 * Set absolute progress
	 */
	setProgress(processed: number, current?: string): void {
		this.processed = Math.min(processed, this.total);
		this.notify(current);
	}

	/**
	 * Mark as complete
	 */
	complete(metadata?: Record<string, unknown>): void {
		this.processed = this.total;
		this.notify(undefined, metadata);
	}

	/**
	 * Get current progress
	 */
	getProgress(): Progress {
		const percent = this.total > 0 ? (this.processed / this.total) * 100 : 0;
		const elapsed = Date.now() - this.startTime;
		const eta = percent > 0 ? (elapsed / percent) * (100 - percent) : undefined;

		return {
			percent,
			stage: this.stage,
			processed: this.processed,
			total: this.total,
			eta,
		};
	}

	private notify(current?: string, metadata?: Record<string, unknown>): void {
		if (this.onProgress) {
			this.onProgress({
				...this.getProgress(),
				current,
				metadata,
			});
		}
	}
}

/**
 * Create a progress tracker
 */
export function createProgressTracker(options: {
	total: number;
	onProgress?: ProgressCallback;
	stage?: string;
}): ProgressTracker {
	return new ProgressTracker(options);
}

// =============================================================================
// Streaming Batch Processor
// =============================================================================

/**
 * Process items in batches with progress streaming
 *
 * @example
 * ```typescript
 * // Generate embeddings with progress
 * const embeddings = await streamingBatchProcess(
 *   documents,
 *   async (batch) => {
 *     return await embeddingModel.embed(batch.map(d => d.content));
 *   },
 *   {
 *     batchSize: 100,
 *     onProgress: (p) => {
 *       sseHandler.sendProgress(opId, {
 *         progress: p.percent,
 *         processed: p.processed,
 *         total: p.total,
 *         done: false,
 *       });
 *     },
 *   },
 * );
 * ```
 */
export async function streamingBatchProcess<T, R>(
	items: T[],
	processor: (batch: T[], batchIndex: number) => Promise<R[]>,
	options: StreamingOptions<T> = {},
): Promise<R[]> {
	const { onProgress, batchSize = 100, batchDelay = 0, transform } = options;

	const results: R[] = [];
	const total = items.length;
	let processed = 0;

	// Transform items if needed
	let processedItems = items;
	if (transform) {
		processedItems = await Promise.all(items.map(transform));
	}

	// Process in batches
	for (let i = 0; i < processedItems.length; i += batchSize) {
		const batch = processedItems.slice(i, i + batchSize);
		const batchIndex = Math.floor(i / batchSize);

		// Process batch
		const batchResults = await processor(batch, batchIndex);
		results.push(...batchResults);

		// Update progress
		processed += batch.length;
		if (onProgress) {
			onProgress({
				percent: (processed / total) * 100,
				processed,
				total,
			});
		}

		// Delay between batches
		if (batchDelay > 0 && i + batchSize < processedItems.length) {
			await new Promise((resolve) => setTimeout(resolve, batchDelay));
		}
	}

	return results;
}

// =============================================================================
// Async Generator for Streaming
// =============================================================================

/**
 * Create an async generator that yields progress updates
 *
 * @example
 * ```typescript
 * // In resolver
 * async function* generateEmbeddings(documents) {
 *   for await (const update of streamingGenerator(documents, async (doc) => {
 *     return await embeddingModel.embed(doc.content);
 *   })) {
 *     yield update;
 *   }
 * }
 * ```
 */
export async function* streamingGenerator<T, R>(
	items: T[],
	processor: (item: T, index: number) => Promise<R>,
	options: { transform?: (item: T) => T | Promise<T> } = {},
): AsyncGenerator<{ progress: Progress; result?: R; done: boolean }> {
	const total = items.length;

	for (let i = 0; i < items.length; i++) {
		let item = items[i];

		// Transform if needed
		if (options.transform) {
			item = await options.transform(item);
		}

		// Process item
		const result = await processor(item, i);

		// Yield progress
		yield {
			progress: {
				percent: ((i + 1) / total) * 100,
				processed: i + 1,
				total,
			},
			result,
			done: i === items.length - 1,
		};
	}
}

// =============================================================================
// Embedding-Specific Helpers
// =============================================================================

/** Embedding result */
export interface EmbeddingResult {
	id: string;
	embedding: number[];
	metadata?: Record<string, unknown>;
}

/** Embedding input */
export interface EmbeddingInput {
	id: string;
	content: string;
	metadata?: Record<string, unknown>;
}

/**
 * Stream embedding generation with progress
 *
 * @example
 * ```typescript
 * const results = await streamEmbeddings(
 *   documents,
 *   async (batch) => {
 *     const embeddings = await openai.embeddings.create({
 *       input: batch.map(d => d.content),
 *       model: 'text-embedding-3-small',
 *     });
 *     return batch.map((d, i) => ({
 *       id: d.id,
 *       embedding: embeddings.data[i].embedding,
 *       metadata: d.metadata,
 *     }));
 *   },
 *   {
 *     batchSize: 100,
 *     onProgress: (p) => sseHandler.sendProgress(opId, { ...p, done: false }),
 *   },
 * );
 * ```
 */
export async function streamEmbeddings(
	inputs: EmbeddingInput[],
	embedder: (batch: EmbeddingInput[]) => Promise<EmbeddingResult[]>,
	options: StreamingOptions<EmbeddingInput> & { batchSize?: number } = {},
): Promise<EmbeddingResult[]> {
	return streamingBatchProcess(inputs, embedder, {
		batchSize: options.batchSize ?? 100,
		onProgress: options.onProgress,
		batchDelay: options.batchDelay,
	});
}
