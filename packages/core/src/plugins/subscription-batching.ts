/**
 * @lens/core - Subscription Batching Plugin
 *
 * Unified subscription optimization plugin providing:
 * - Subscription batching/debouncing
 * - Update coalescing
 * - Bandwidth optimization
 * - Priority-based delivery
 */

import { defineUnifiedPlugin } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Batched update entry */
export interface BatchedUpdate {
	entity: string;
	id: string;
	update: unknown;
	timestamp: number;
	priority: number;
}

/** Subscription batching configuration */
export interface SubscriptionBatchingConfig {
	/** Batch window in ms (default: 50) */
	batchWindow?: number;
	/** Max batch size (default: 100) */
	maxBatchSize?: number;
	/** Enable update coalescing (default: true) */
	coalesce?: boolean;
	/** Priority threshold for immediate delivery (default: 10) */
	priorityThreshold?: number;
	/** Enable compression for large batches (default: true) */
	compress?: boolean;
}

/** Batching client API */
export interface BatchingClientAPI {
	/** Get current batch size */
	getBatchSize: () => number;
	/** Get pending updates */
	getPendingUpdates: () => BatchedUpdate[];
	/** Flush pending updates immediately */
	flush: () => void;
	/** Set priority for entity */
	setPriority: (entity: string, id: string, priority: number) => void;
	/** Get batching stats */
	getStats: () => {
		totalUpdates: number;
		batchedUpdates: number;
		coalescedUpdates: number;
		averageBatchSize: number;
	};
}

/** Batching server API */
export interface BatchingServerAPI {
	/** Queue update for batching */
	queueUpdate: (clientId: string, entity: string, id: string, update: unknown, priority?: number) => void;
	/** Flush updates for client */
	flushClient: (clientId: string) => BatchedUpdate[];
	/** Get pending count for client */
	getPendingCount: (clientId: string) => number;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Unified subscription batching plugin
 *
 * @example
 * ```typescript
 * // Client
 * import { subscriptionBatchingPlugin } from "@lens/core";
 *
 * const client = createClient({
 *   plugins: [{
 *     plugin: subscriptionBatchingPlugin,
 *     config: {
 *       batchWindow: 100,
 *       maxBatchSize: 50,
 *       coalesce: true,
 *     },
 *   }],
 * });
 *
 * // Check batching stats
 * const batching = client.$plugins.get<BatchingClientAPI>("subscription-batching");
 * console.log(batching?.getStats());
 *
 * // Server
 * const server = createServer({
 *   plugins: [{
 *     plugin: subscriptionBatchingPlugin,
 *     config: {
 *       batchWindow: 50,
 *       maxBatchSize: 100,
 *     },
 *   }],
 * });
 * ```
 */
export const subscriptionBatchingPlugin = defineUnifiedPlugin<SubscriptionBatchingConfig>({
	name: "subscription-batching",
	version: "1.0.0",

	defaultConfig: {
		batchWindow: 50,
		maxBatchSize: 100,
		coalesce: true,
		priorityThreshold: 10,
		compress: true,
	},

	// Client-side implementation
	client: (config) => {
		const batchWindow = config?.batchWindow ?? 50;
		const maxBatchSize = config?.maxBatchSize ?? 100;
		const coalesce = config?.coalesce ?? true;
		const priorityThreshold = config?.priorityThreshold ?? 10;

		// State
		const pendingUpdates: BatchedUpdate[] = [];
		const priorities = new Map<string, number>();
		let batchTimer: ReturnType<typeof setTimeout> | null = null;
		let updateHandler: ((updates: BatchedUpdate[]) => void) | null = null;

		// Stats
		const stats = {
			totalUpdates: 0,
			batchedUpdates: 0,
			coalescedUpdates: 0,
			batchCount: 0,
		};

		const makeKey = (entity: string, id: string) => `${entity}:${id}`;

		const processBatch = () => {
			if (pendingUpdates.length === 0) return;

			const updates = [...pendingUpdates];
			pendingUpdates.length = 0;

			stats.batchedUpdates += updates.length;
			stats.batchCount++;

			if (updateHandler) {
				updateHandler(updates);
			}
		};

		const scheduleBatch = () => {
			if (batchTimer) return;

			batchTimer = setTimeout(() => {
				batchTimer = null;
				processBatch();
			}, batchWindow);
		};

		const queueUpdate = (entity: string, id: string, update: unknown, priority?: number) => {
			stats.totalUpdates++;

			const key = makeKey(entity, id);
			const effectivePriority = priority ?? priorities.get(key) ?? 0;

			// High priority = immediate delivery
			if (effectivePriority >= priorityThreshold) {
				if (updateHandler) {
					updateHandler([{
						entity,
						id,
						update,
						timestamp: Date.now(),
						priority: effectivePriority,
					}]);
				}
				return;
			}

			// Coalesce: replace existing update for same entity/id
			if (coalesce) {
				const existingIdx = pendingUpdates.findIndex(
					(u) => u.entity === entity && u.id === id
				);
				if (existingIdx >= 0) {
					pendingUpdates[existingIdx] = {
						entity,
						id,
						update,
						timestamp: Date.now(),
						priority: effectivePriority,
					};
					stats.coalescedUpdates++;
					return;
				}
			}

			pendingUpdates.push({
				entity,
				id,
				update,
				timestamp: Date.now(),
				priority: effectivePriority,
			});

			// Flush if batch is full
			if (pendingUpdates.length >= maxBatchSize) {
				if (batchTimer) {
					clearTimeout(batchTimer);
					batchTimer = null;
				}
				processBatch();
			} else {
				scheduleBatch();
			}
		};

		const api: BatchingClientAPI = {
			getBatchSize: () => pendingUpdates.length,

			getPendingUpdates: () => [...pendingUpdates],

			flush: () => {
				if (batchTimer) {
					clearTimeout(batchTimer);
					batchTimer = null;
				}
				processBatch();
			},

			setPriority: (entity, id, priority) => {
				const key = makeKey(entity, id);
				priorities.set(key, priority);
			},

			getStats: () => ({
				totalUpdates: stats.totalUpdates,
				batchedUpdates: stats.batchedUpdates,
				coalescedUpdates: stats.coalescedUpdates,
				averageBatchSize: stats.batchCount > 0
					? stats.batchedUpdates / stats.batchCount
					: 0,
			}),
		};

		return {
			name: "subscription-batching",
			api,

			// Allow setting update handler
			setUpdateHandler: (handler: (updates: BatchedUpdate[]) => void) => {
				updateHandler = handler;
			},

			// Process incoming subscription update
			onSubscriptionUpdate: (entity: string, id: string, update: unknown) => {
				queueUpdate(entity, id, update);
			},

			destroy: () => {
				if (batchTimer) {
					clearTimeout(batchTimer);
				}
				pendingUpdates.length = 0;
				priorities.clear();
			},
		};
	},

	// Server-side implementation
	server: (config) => {
		const batchWindow = config?.batchWindow ?? 50;
		const maxBatchSize = config?.maxBatchSize ?? 100;
		const coalesce = config?.coalesce ?? true;

		// Per-client batching
		const clientBatches = new Map<string, {
			updates: BatchedUpdate[];
			timer: ReturnType<typeof setTimeout> | null;
		}>();

		const flushHandlers = new Map<string, (updates: BatchedUpdate[]) => void>();

		const getClientBatch = (clientId: string) => {
			let batch = clientBatches.get(clientId);
			if (!batch) {
				batch = { updates: [], timer: null };
				clientBatches.set(clientId, batch);
			}
			return batch;
		};

		const flushClient = (clientId: string): BatchedUpdate[] => {
			const batch = clientBatches.get(clientId);
			if (!batch || batch.updates.length === 0) return [];

			const updates = [...batch.updates];
			batch.updates.length = 0;

			if (batch.timer) {
				clearTimeout(batch.timer);
				batch.timer = null;
			}

			// Call flush handler if registered
			const handler = flushHandlers.get(clientId);
			if (handler) {
				handler(updates);
			}

			return updates;
		};

		const api: BatchingServerAPI = {
			queueUpdate: (clientId, entity, id, update, priority = 0) => {
				const batch = getClientBatch(clientId);
				const key = `${entity}:${id}`;

				// Coalesce
				if (coalesce) {
					const existingIdx = batch.updates.findIndex(
						(u) => u.entity === entity && u.id === id
					);
					if (existingIdx >= 0) {
						batch.updates[existingIdx] = {
							entity,
							id,
							update,
							timestamp: Date.now(),
							priority,
						};
						return;
					}
				}

				batch.updates.push({
					entity,
					id,
					update,
					timestamp: Date.now(),
					priority,
				});

				// Flush if full
				if (batch.updates.length >= maxBatchSize) {
					flushClient(clientId);
				} else if (!batch.timer) {
					batch.timer = setTimeout(() => {
						batch.timer = null;
						flushClient(clientId);
					}, batchWindow);
				}
			},

			flushClient,

			getPendingCount: (clientId) => {
				const batch = clientBatches.get(clientId);
				return batch?.updates.length ?? 0;
			},
		};

		return {
			name: "subscription-batching",
			api,

			// Allow registering flush handler per client
			registerFlushHandler: (clientId: string, handler: (updates: BatchedUpdate[]) => void) => {
				flushHandlers.set(clientId, handler);
			},

			unregisterFlushHandler: (clientId: string) => {
				flushHandlers.delete(clientId);
			},

			onWSDisconnect: (ctx) => {
				const clientId = ctx.request?.clientId as string;
				if (clientId) {
					const batch = clientBatches.get(clientId);
					if (batch?.timer) {
						clearTimeout(batch.timer);
					}
					clientBatches.delete(clientId);
					flushHandlers.delete(clientId);
				}
			},

			onShutdown: () => {
				for (const batch of clientBatches.values()) {
					if (batch.timer) {
						clearTimeout(batch.timer);
					}
				}
				clientBatches.clear();
				flushHandlers.clear();
			},
		};
	},

	getClientConfig: (config) => ({
		batchWindow: config?.batchWindow ?? 50,
		maxBatchSize: config?.maxBatchSize ?? 100,
		coalesce: config?.coalesce ?? true,
		priorityThreshold: config?.priorityThreshold ?? 10,
	}),
});
