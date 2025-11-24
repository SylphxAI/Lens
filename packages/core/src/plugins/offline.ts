/**
 * @lens/core - Offline Support Plugin
 *
 * Unified offline support plugin providing:
 * - Request queuing when offline
 * - Automatic sync when back online
 * - Persistent storage for pending mutations
 * - Conflict resolution strategies
 */

import { defineUnifiedPlugin } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Pending operation stored for offline sync */
export interface PendingOperation {
	id: string;
	entity: string;
	operation: string;
	input: unknown;
	timestamp: number;
	retryCount: number;
}

/** Conflict resolution strategy */
export type ConflictStrategy = "client-wins" | "server-wins" | "merge" | "manual";

/** Offline plugin configuration */
export interface OfflinePluginConfig {
	/** Storage key prefix (default: "lens_offline_") */
	storagePrefix?: string;
	/** Max retry attempts for failed syncs (default: 3) */
	maxRetries?: number;
	/** Conflict resolution strategy (default: "server-wins") */
	conflictStrategy?: ConflictStrategy;
	/** Custom storage adapter (default: localStorage) */
	storage?: StorageAdapter;
	/** Enable background sync (default: true) */
	backgroundSync?: boolean;
	/** Sync interval in ms when online (default: 5000) */
	syncInterval?: number;
}

/** Storage adapter interface */
export interface StorageAdapter {
	getItem: (key: string) => string | null | Promise<string | null>;
	setItem: (key: string, value: string) => void | Promise<void>;
	removeItem: (key: string) => void | Promise<void>;
}

/** Offline client API */
export interface OfflineClientAPI {
	/** Check if currently online */
	isOnline: () => boolean;
	/** Get pending operations count */
	getPendingCount: () => number;
	/** Get all pending operations */
	getPendingOperations: () => PendingOperation[];
	/** Force sync now */
	sync: () => Promise<{ success: number; failed: number }>;
	/** Clear all pending operations */
	clearPending: () => void;
	/** Add listener for online/offline changes */
	onStatusChange: (callback: (online: boolean) => void) => () => void;
}

/** Offline server API */
export interface OfflineServerAPI {
	/** Get conflict strategy */
	getConflictStrategy: () => ConflictStrategy;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Unified offline support plugin
 *
 * @example
 * ```typescript
 * // Client
 * import { offlinePlugin } from "@lens/core";
 *
 * const client = createClient({
 *   plugins: [{
 *     plugin: offlinePlugin,
 *     config: {
 *       conflictStrategy: "client-wins",
 *       maxRetries: 5,
 *     },
 *   }],
 * });
 *
 * // Check offline status
 * const offline = client.$plugins.get<OfflineClientAPI>("offline");
 * if (!offline?.isOnline()) {
 *   console.log(`${offline?.getPendingCount()} operations pending`);
 * }
 *
 * // Force sync when back online
 * offline?.sync();
 * ```
 */
export const offlinePlugin = defineUnifiedPlugin<OfflinePluginConfig>({
	name: "offline",
	version: "1.0.0",

	defaultConfig: {
		storagePrefix: "lens_offline_",
		maxRetries: 3,
		conflictStrategy: "server-wins",
		backgroundSync: true,
		syncInterval: 5000,
	},

	// Client-side implementation
	client: (config) => {
		const prefix = config?.storagePrefix ?? "lens_offline_";
		const maxRetries = config?.maxRetries ?? 3;
		const backgroundSync = config?.backgroundSync ?? true;
		const syncInterval = config?.syncInterval ?? 5000;

		// State
		let isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
		const pendingOps: PendingOperation[] = [];
		const statusListeners = new Set<(online: boolean) => void>();
		let syncTimer: ReturnType<typeof setInterval> | null = null;
		let executeRef: ((type: string, entity: string, op: string, input: unknown) => Promise<{ data?: unknown; error?: Error }>) | null = null;

		// Storage
		const storage: StorageAdapter = config?.storage ?? {
			getItem: (key) => (typeof localStorage !== "undefined" ? localStorage.getItem(key) : null),
			setItem: (key, value) => typeof localStorage !== "undefined" && localStorage.setItem(key, value),
			removeItem: (key) => typeof localStorage !== "undefined" && localStorage.removeItem(key),
		};

		const storageKey = `${prefix}pending`;

		// Load pending operations from storage
		const loadPending = async () => {
			try {
				const stored = await storage.getItem(storageKey);
				if (stored) {
					const ops = JSON.parse(stored) as PendingOperation[];
					pendingOps.push(...ops);
				}
			} catch {
				// Ignore storage errors
			}
		};

		// Save pending operations to storage
		const savePending = async () => {
			try {
				await storage.setItem(storageKey, JSON.stringify(pendingOps));
			} catch {
				// Ignore storage errors
			}
		};

		// Generate unique ID
		const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;

		// Sync pending operations
		const syncPending = async (): Promise<{ success: number; failed: number }> => {
			if (!isOnline || !executeRef || pendingOps.length === 0) {
				return { success: 0, failed: 0 };
			}

			let success = 0;
			let failed = 0;
			const toRemove: string[] = [];

			for (const op of pendingOps) {
				try {
					const result = await executeRef("mutation", op.entity, op.operation, op.input);

					if (result.error) {
						op.retryCount++;
						if (op.retryCount >= maxRetries) {
							toRemove.push(op.id);
							failed++;
						}
					} else {
						toRemove.push(op.id);
						success++;
					}
				} catch {
					op.retryCount++;
					if (op.retryCount >= maxRetries) {
						toRemove.push(op.id);
						failed++;
					}
				}
			}

			// Remove completed/failed operations
			for (const id of toRemove) {
				const idx = pendingOps.findIndex((op) => op.id === id);
				if (idx >= 0) pendingOps.splice(idx, 1);
			}

			await savePending();
			return { success, failed };
		};

		// Handle online/offline events
		const handleOnline = () => {
			isOnline = true;
			statusListeners.forEach((cb) => cb(true));
			if (backgroundSync) {
				syncPending();
			}
		};

		const handleOffline = () => {
			isOnline = false;
			statusListeners.forEach((cb) => cb(false));
		};

		const api: OfflineClientAPI = {
			isOnline: () => isOnline,

			getPendingCount: () => pendingOps.length,

			getPendingOperations: () => [...pendingOps],

			sync: syncPending,

			clearPending: () => {
				pendingOps.length = 0;
				savePending();
			},

			onStatusChange: (callback) => {
				statusListeners.add(callback);
				return () => statusListeners.delete(callback);
			},
		};

		return {
			name: "offline",
			api,

			onInit: async (ctx) => {
				executeRef = ctx.execute;

				// Load pending operations
				await loadPending();

				// Setup event listeners
				if (typeof window !== "undefined") {
					window.addEventListener("online", handleOnline);
					window.addEventListener("offline", handleOffline);
				}

				// Start background sync
				if (backgroundSync && typeof setInterval !== "undefined") {
					syncTimer = setInterval(() => {
						if (isOnline && pendingOps.length > 0) {
							syncPending();
						}
					}, syncInterval);
				}
			},

			onBeforeMutation: (ctx, entity, op, input) => {
				// If offline, queue the mutation
				if (!isOnline) {
					const pendingOp: PendingOperation = {
						id: generateId(),
						entity,
						operation: op,
						input,
						timestamp: Date.now(),
						retryCount: 0,
					};
					pendingOps.push(pendingOp);
					savePending();

					// Return undefined to skip actual execution
					// The mutation will return optimistic result if configured
				}
			},

			onConnect: () => {
				isOnline = true;
				statusListeners.forEach((cb) => cb(true));
			},

			onDisconnect: () => {
				isOnline = false;
				statusListeners.forEach((cb) => cb(false));
			},

			destroy: () => {
				if (typeof window !== "undefined") {
					window.removeEventListener("online", handleOnline);
					window.removeEventListener("offline", handleOffline);
				}
				if (syncTimer) {
					clearInterval(syncTimer);
				}
				statusListeners.clear();
			},
		};
	},

	// Server-side implementation
	server: (config) => {
		const conflictStrategy = config?.conflictStrategy ?? "server-wins";

		const api: OfflineServerAPI = {
			getConflictStrategy: () => conflictStrategy,
		};

		return {
			name: "offline",
			api,

			// Handle conflict resolution on mutations
			onBeforeResolve: (ctx, entity, op, input) => {
				// Check for offline sync marker
				const syncInput = input as { _offlineSync?: boolean; _clientTimestamp?: number };

				if (syncInput?._offlineSync) {
					// This is a sync from offline queue
					// Add conflict resolution logic here based on strategy
					ctx.request = {
						...ctx.request,
						offlineSync: true,
						clientTimestamp: syncInput._clientTimestamp,
					};

					// Remove internal markers from input
					const cleanInput = { ...syncInput };
					delete cleanInput._offlineSync;
					delete cleanInput._clientTimestamp;

					return { input: cleanInput, ctx };
				}

				return undefined;
			},
		};
	},

	getClientConfig: (config) => ({
		maxRetries: config?.maxRetries ?? 3,
		conflictStrategy: config?.conflictStrategy ?? "server-wins",
		backgroundSync: config?.backgroundSync ?? true,
		syncInterval: config?.syncInterval ?? 5000,
	}),
});
