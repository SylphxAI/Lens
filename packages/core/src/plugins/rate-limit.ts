/**
 * @lens/core - Rate Limiting Plugin
 *
 * Unified rate limiting plugin providing:
 * - Request rate limiting
 * - Sliding window algorithm
 * - Per-entity/operation limits
 * - Client-side request throttling
 * - Server-side enforcement
 */

import { defineUnifiedPlugin } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Rate limit rule */
export interface RateLimitRule {
	/** Entity name (or "*" for all) */
	entity?: string;
	/** Operation name (or "*" for all) */
	operation?: string;
	/** Max requests in window */
	limit: number;
	/** Window size in milliseconds */
	window: number;
}

/** Rate limit plugin configuration */
export interface RateLimitPluginConfig {
	/** Global rate limit (requests per window) */
	globalLimit?: number;
	/** Global window in ms (default: 60000 = 1 minute) */
	globalWindow?: number;
	/** Per-entity/operation rules */
	rules?: RateLimitRule[];
	/** Enable client-side throttling (default: true) */
	clientThrottle?: boolean;
	/** Retry after rate limit (default: true) */
	retryOnLimit?: boolean;
	/** Max retry delay in ms (default: 30000) */
	maxRetryDelay?: number;
}

/** Rate limit client API */
export interface RateLimitClientAPI {
	/** Get remaining requests for entity/operation */
	getRemaining: (entity?: string, operation?: string) => number;
	/** Check if rate limited */
	isLimited: (entity?: string, operation?: string) => boolean;
	/** Get time until reset in ms */
	getResetTime: (entity?: string, operation?: string) => number;
	/** Get current usage stats */
	getStats: () => { total: number; limited: number; retried: number };
}

/** Rate limit server API */
export interface RateLimitServerAPI {
	/** Check if request should be rate limited */
	checkLimit: (key: string, limit: number, window: number) => { allowed: boolean; remaining: number; resetAt: number };
	/** Get limit for entity/operation */
	getLimit: (entity: string, operation: string) => { limit: number; window: number } | null;
}

// =============================================================================
// Sliding Window Implementation
// =============================================================================

class SlidingWindowCounter {
	private windows = new Map<string, { count: number; timestamps: number[] }>();

	check(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
		const now = Date.now();
		const windowStart = now - windowMs;

		let entry = this.windows.get(key);
		if (!entry) {
			entry = { count: 0, timestamps: [] };
			this.windows.set(key, entry);
		}

		// Remove expired timestamps
		entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
		entry.count = entry.timestamps.length;

		const remaining = Math.max(0, limit - entry.count);
		const allowed = entry.count < limit;

		// Calculate reset time (when oldest request expires)
		const resetAt = entry.timestamps.length > 0
			? entry.timestamps[0] + windowMs
			: now + windowMs;

		if (allowed) {
			entry.timestamps.push(now);
			entry.count++;
		}

		return { allowed, remaining: Math.max(0, remaining - (allowed ? 1 : 0)), resetAt };
	}

	getRemaining(key: string, limit: number, windowMs: number): number {
		const now = Date.now();
		const windowStart = now - windowMs;
		const entry = this.windows.get(key);

		if (!entry) return limit;

		const validCount = entry.timestamps.filter((t) => t > windowStart).length;
		return Math.max(0, limit - validCount);
	}

	clear() {
		this.windows.clear();
	}
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Unified rate limiting plugin
 *
 * @example
 * ```typescript
 * // Client
 * import { rateLimitPlugin } from "@lens/core";
 *
 * const client = createClient({
 *   plugins: [{
 *     plugin: rateLimitPlugin,
 *     config: {
 *       globalLimit: 100,
 *       globalWindow: 60000,
 *       rules: [
 *         { entity: "User", operation: "create", limit: 5, window: 60000 },
 *       ],
 *     },
 *   }],
 * });
 *
 * // Check limits
 * const rateLimit = client.$plugins.get<RateLimitClientAPI>("rate-limit");
 * console.log(rateLimit?.getRemaining("User", "create")); // 5
 *
 * // Server
 * const server = createServer({
 *   plugins: [{
 *     plugin: rateLimitPlugin,
 *     config: {
 *       globalLimit: 1000,
 *       rules: [
 *         { entity: "User", operation: "create", limit: 10, window: 60000 },
 *       ],
 *     },
 *   }],
 * });
 * ```
 */
export const rateLimitPlugin = defineUnifiedPlugin<RateLimitPluginConfig>({
	name: "rate-limit",
	version: "1.0.0",

	defaultConfig: {
		globalLimit: 100,
		globalWindow: 60000,
		rules: [],
		clientThrottle: true,
		retryOnLimit: true,
		maxRetryDelay: 30000,
	},

	// Client-side implementation
	client: (config) => {
		const globalLimit = config?.globalLimit ?? 100;
		const globalWindow = config?.globalWindow ?? 60000;
		const rules = config?.rules ?? [];
		const clientThrottle = config?.clientThrottle ?? true;
		const retryOnLimit = config?.retryOnLimit ?? true;
		const maxRetryDelay = config?.maxRetryDelay ?? 30000;

		const counter = new SlidingWindowCounter();
		const stats = { total: 0, limited: 0, retried: 0 };

		const getRule = (entity: string, operation: string): { limit: number; window: number } => {
			// Find most specific rule
			const specific = rules.find((r) => r.entity === entity && r.operation === operation);
			if (specific) return { limit: specific.limit, window: specific.window };

			const entityRule = rules.find((r) => r.entity === entity && (!r.operation || r.operation === "*"));
			if (entityRule) return { limit: entityRule.limit, window: entityRule.window };

			const opRule = rules.find((r) => (!r.entity || r.entity === "*") && r.operation === operation);
			if (opRule) return { limit: opRule.limit, window: opRule.window };

			return { limit: globalLimit, window: globalWindow };
		};

		const makeKey = (entity?: string, operation?: string) => {
			if (!entity && !operation) return "global";
			return `${entity ?? "*"}:${operation ?? "*"}`;
		};

		const api: RateLimitClientAPI = {
			getRemaining: (entity, operation) => {
				const rule = entity ? getRule(entity, operation ?? "*") : { limit: globalLimit, window: globalWindow };
				const key = makeKey(entity, operation);
				return counter.getRemaining(key, rule.limit, rule.window);
			},

			isLimited: (entity, operation) => {
				return api.getRemaining(entity, operation) <= 0;
			},

			getResetTime: (entity, operation) => {
				const rule = entity ? getRule(entity, operation ?? "*") : { limit: globalLimit, window: globalWindow };
				const key = makeKey(entity, operation);
				const result = counter.check(key, rule.limit, rule.window);
				return result.resetAt - Date.now();
			},

			getStats: () => ({ ...stats }),
		};

		return {
			name: "rate-limit",
			api,

			onBeforeMutation: async (ctx, entity, op, input) => {
				if (!clientThrottle) return;

				stats.total++;
				const rule = getRule(entity, op);
				const key = makeKey(entity, op);
				const globalKey = "global";

				// Check global limit
				const globalResult = counter.check(globalKey, globalLimit, globalWindow);
				if (!globalResult.allowed) {
					stats.limited++;

					if (retryOnLimit) {
						const delay = Math.min(globalResult.resetAt - Date.now(), maxRetryDelay);
						if (delay > 0) {
							stats.retried++;
							await new Promise((resolve) => setTimeout(resolve, delay));
							return; // Retry
						}
					}

					throw new Error(`Rate limit exceeded. Reset in ${Math.ceil((globalResult.resetAt - Date.now()) / 1000)}s`);
				}

				// Check specific limit
				const result = counter.check(key, rule.limit, rule.window);
				if (!result.allowed) {
					stats.limited++;

					if (retryOnLimit) {
						const delay = Math.min(result.resetAt - Date.now(), maxRetryDelay);
						if (delay > 0) {
							stats.retried++;
							await new Promise((resolve) => setTimeout(resolve, delay));
							return;
						}
					}

					throw new Error(`Rate limit exceeded for ${entity}.${op}. Reset in ${Math.ceil((result.resetAt - Date.now()) / 1000)}s`);
				}
			},

			destroy: () => {
				counter.clear();
			},
		};
	},

	// Server-side implementation
	server: (config) => {
		const globalLimit = config?.globalLimit ?? 1000;
		const globalWindow = config?.globalWindow ?? 60000;
		const rules = config?.rules ?? [];

		// Per-IP rate limiting
		const counters = new Map<string, SlidingWindowCounter>();

		const getCounter = (ip: string): SlidingWindowCounter => {
			let counter = counters.get(ip);
			if (!counter) {
				counter = new SlidingWindowCounter();
				counters.set(ip, counter);
			}
			return counter;
		};

		const getRule = (entity: string, operation: string): { limit: number; window: number } | null => {
			const specific = rules.find((r) => r.entity === entity && r.operation === operation);
			if (specific) return { limit: specific.limit, window: specific.window };

			const entityRule = rules.find((r) => r.entity === entity && (!r.operation || r.operation === "*"));
			if (entityRule) return { limit: entityRule.limit, window: entityRule.window };

			return null;
		};

		const api: RateLimitServerAPI = {
			checkLimit: (key, limit, window) => {
				const counter = getCounter("default");
				return counter.check(key, limit, window);
			},

			getLimit: (entity, operation) => {
				return getRule(entity, operation);
			},
		};

		return {
			name: "rate-limit",
			api,

			onBeforeResolve: (ctx, entity, op) => {
				const ip = ctx.request?.ip ?? "unknown";
				const counter = getCounter(ip);

				// Check global limit
				const globalKey = `${ip}:global`;
				const globalResult = counter.check(globalKey, globalLimit, globalWindow);

				if (!globalResult.allowed) {
					const error = new Error("Rate limit exceeded") as Error & { statusCode: number; retryAfter: number };
					error.statusCode = 429;
					error.retryAfter = Math.ceil((globalResult.resetAt - Date.now()) / 1000);
					throw error;
				}

				// Check specific limit
				const rule = getRule(entity, op);
				if (rule) {
					const key = `${ip}:${entity}:${op}`;
					const result = counter.check(key, rule.limit, rule.window);

					if (!result.allowed) {
						const error = new Error(`Rate limit exceeded for ${entity}.${op}`) as Error & { statusCode: number; retryAfter: number };
						error.statusCode = 429;
						error.retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
						throw error;
					}
				}

				return undefined;
			},

			onShutdown: () => {
				counters.clear();
			},
		};
	},

	getClientConfig: (config) => ({
		globalLimit: config?.globalLimit ?? 100,
		globalWindow: config?.globalWindow ?? 60000,
		rules: config?.rules ?? [],
	}),
});
