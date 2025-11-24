/**
 * @lens/core - Cache Control Plugin
 *
 * Unified cache invalidation plugin providing:
 * - Tag-based invalidation
 * - Pattern-based invalidation
 * - Cascade invalidation rules
 * - Stale-while-revalidate pattern
 * - Auto-invalidation on mutations
 */

import { defineUnifiedPlugin } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Cascade invalidation rule */
export interface CascadeRule {
	/** Source entity type that triggers invalidation */
	source: string;
	/** Operation types that trigger cascade (default: all) */
	operations?: ("create" | "update" | "delete")[];
	/** Target entities to invalidate */
	targets: string[];
}

/** Cache plugin configuration */
export interface CachePluginConfig {
	/** Cache TTL in milliseconds (default: 5 minutes) */
	ttl?: number;
	/** Cascade invalidation rules */
	cascadeRules?: CascadeRule[];
	/** Auto-invalidate on mutations (default: true) */
	autoInvalidate?: boolean;
	/** Stale-while-revalidate enabled (default: true) */
	staleWhileRevalidate?: boolean;
}

/** Cache API exposed to client */
export interface CacheClientAPI {
	/** Invalidate a single entity */
	invalidate: (entity: string, id: string) => void;
	/** Invalidate all entities of a type */
	invalidateEntity: (entity: string) => void;
	/** Invalidate by tags */
	invalidateByTags: (tags: string[]) => number;
	/** Invalidate by pattern (glob-like) */
	invalidateByPattern: (pattern: string) => number;
	/** Tag an entity */
	tagEntity: (entity: string, id: string, tags: string[]) => void;
	/** Check if entity is stale */
	isStale: (entity: string, id: string) => boolean;
	/** Clear entire cache */
	clear: () => void;
}

/** Cache API exposed to server */
export interface CacheServerAPI {
	/** Get cascade rules */
	getCascadeRules: () => CascadeRule[];
	/** Check if entity should cascade invalidation */
	shouldCascade: (entity: string, operation: string) => string[];
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Unified cache control plugin
 *
 * @example
 * ```typescript
 * // Client
 * import { cachePlugin } from "@lens/core";
 *
 * const client = createClient({
 *   plugins: [{
 *     plugin: cachePlugin,
 *     config: {
 *       ttl: 10 * 60 * 1000, // 10 minutes
 *       cascadeRules: [
 *         { source: "User", targets: ["Post", "Comment"] },
 *       ],
 *     },
 *   }],
 * });
 *
 * // Use cache API
 * const cache = client.$plugins.get<CacheClientAPI>("cache");
 * cache?.invalidateByTags(["featured"]);
 * cache?.invalidateByPattern("User:*");
 *
 * // Server
 * const server = createServer({
 *   plugins: [{
 *     plugin: cachePlugin,
 *     config: {
 *       cascadeRules: [
 *         { source: "User", targets: ["Post"] },
 *       ],
 *     },
 *   }],
 * });
 * ```
 */
export const cachePlugin = defineUnifiedPlugin<CachePluginConfig>({
	name: "cache",
	version: "1.0.0",

	defaultConfig: {
		ttl: 5 * 60 * 1000, // 5 minutes
		cascadeRules: [],
		autoInvalidate: true,
		staleWhileRevalidate: true,
	},

	// Client-side implementation
	client: (config) => {
		const ttl = config?.ttl ?? 5 * 60 * 1000;
		const cascadeRules = config?.cascadeRules ?? [];
		const autoInvalidate = config?.autoInvalidate ?? true;

		// Internal state
		const tagIndex = new Map<string, Set<string>>();
		const entityTags = new Map<string, string[]>();
		const staleEntities = new Set<string>();
		const cachedAt = new Map<string, number>();

		// Store reference (will be set by client)
		let storeRef: {
			invalidate?: (entity: string, id: string) => void;
			invalidateEntity?: (entity: string) => void;
		} | null = null;

		const makeKey = (entity: string, id: string) => `${entity}:${id}`;

		const markStale = (key: string) => {
			staleEntities.add(key);
		};

		const cascadeInvalidate = (entity: string, operation: string) => {
			for (const rule of cascadeRules) {
				if (rule.source !== entity) continue;
				if (rule.operations && !rule.operations.includes(operation as "create" | "update" | "delete")) continue;

				for (const target of rule.targets) {
					api.invalidateEntity(target);
				}
			}
		};

		const patternToRegex = (pattern: string): RegExp => {
			const escaped = pattern
				.replace(/[.+^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, ".*")
				.replace(/\?/g, ".");
			return new RegExp(`^${escaped}$`);
		};

		const api: CacheClientAPI = {
			invalidate: (entity, id) => {
				const key = makeKey(entity, id);
				markStale(key);
				storeRef?.invalidate?.(entity, id);
				cascadeInvalidate(entity, "update");
			},

			invalidateEntity: (entity) => {
				// Mark all keys starting with entity: as stale
				for (const key of cachedAt.keys()) {
					if (key.startsWith(`${entity}:`)) {
						markStale(key);
					}
				}
				storeRef?.invalidateEntity?.(entity);
			},

			invalidateByTags: (tags) => {
				let count = 0;
				for (const tag of tags) {
					const keys = tagIndex.get(tag);
					if (keys) {
						for (const key of keys) {
							markStale(key);
							count++;
						}
					}
				}
				return count;
			},

			invalidateByPattern: (pattern) => {
				const regex = patternToRegex(pattern);
				let count = 0;
				for (const key of cachedAt.keys()) {
					if (regex.test(key)) {
						markStale(key);
						count++;
					}
				}
				return count;
			},

			tagEntity: (entity, id, tags) => {
				const key = makeKey(entity, id);
				const existing = entityTags.get(key) ?? [];
				const merged = [...new Set([...existing, ...tags])];
				entityTags.set(key, merged);

				for (const tag of tags) {
					if (!tagIndex.has(tag)) {
						tagIndex.set(tag, new Set());
					}
					tagIndex.get(tag)!.add(key);
				}
			},

			isStale: (entity, id) => {
				const key = makeKey(entity, id);
				if (staleEntities.has(key)) return true;

				const cached = cachedAt.get(key);
				if (!cached) return true;

				return Date.now() - cached > ttl;
			},

			clear: () => {
				tagIndex.clear();
				entityTags.clear();
				staleEntities.clear();
				cachedAt.clear();
			},
		};

		return {
			name: "cache",
			api,

			// Hook: track cached entities
			onQuerySuccess: (entity: string, id: string) => {
				const key = makeKey(entity, id);
				cachedAt.set(key, Date.now());
				staleEntities.delete(key);
			},

			// Hook: auto-invalidate on mutations
			onMutationSuccess: (entity: string, operation: string, result: { id?: string }) => {
				if (!autoInvalidate) return;

				if (operation === "create") {
					// New entity - invalidate list caches
					api.invalidateEntity(entity);
				} else if (operation === "update" && result?.id) {
					api.invalidate(entity, result.id);
				} else if (operation === "delete" && result?.id) {
					api.invalidate(entity, result.id);
					api.invalidateEntity(entity);
				}

				cascadeInvalidate(entity, operation);
			},

			// Allow setting store reference
			setStore: (store: typeof storeRef) => {
				storeRef = store;
			},

			destroy: () => {
				api.clear();
			},
		};
	},

	// Server-side implementation
	server: (config) => {
		const cascadeRules = config?.cascadeRules ?? [];

		const api: CacheServerAPI = {
			getCascadeRules: () => cascadeRules,

			shouldCascade: (entity, operation) => {
				const targets: string[] = [];
				for (const rule of cascadeRules) {
					if (rule.source !== entity) continue;
					if (rule.operations && !rule.operations.includes(operation as "create" | "update" | "delete")) continue;
					targets.push(...rule.targets);
				}
				return [...new Set(targets)];
			},
		};

		return {
			name: "cache",
			api,

			// Hook: notify clients about invalidation
			onAfterResolve: (ctx, entity, operation, result) => {
				if (operation === "create" || operation === "update" || operation === "delete") {
					// Server can broadcast invalidation to connected clients
					const targets = api.shouldCascade(entity, operation);
					if (targets.length > 0) {
						// This would be picked up by subscription system
						return {
							invalidate: [entity, ...targets],
						};
					}
				}
				return undefined;
			},
		};
	},

	// Sanitize config for client handshake
	getClientConfig: (config) => ({
		ttl: config?.ttl ?? 5 * 60 * 1000,
		cascadeRules: config?.cascadeRules ?? [],
		autoInvalidate: config?.autoInvalidate ?? true,
		staleWhileRevalidate: config?.staleWhileRevalidate ?? true,
	}),
});
