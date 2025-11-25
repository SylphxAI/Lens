/**
 * @sylphx/lens-client - Route Transport
 *
 * Route transport for conditional routing to multiple transports.
 * Supports multi-server architectures with automatic metadata merging.
 */

import type { Observable } from "../links/types";
import type { Metadata, Operation, Result, RouteCondition, RouteEntry, Transport } from "./types";

// =============================================================================
// Route Transport
// =============================================================================

/**
 * Create route transport for conditional routing.
 *
 * Route transport connects to multiple servers and merges metadata.
 * Requests are routed based on condition functions.
 *
 * @example
 * ```typescript
 * const client = await createClient<Api>({
 *   transport: route([
 *     [op => op.path.startsWith('auth.'), http({ url: '/auth-api' })],
 *     [op => op.path.startsWith('analytics.'), http({ url: '/analytics-api' })],
 *     http({ url: '/api' }),  // fallback (last entry without condition)
 *   ]),
 * })
 * ```
 */
export function route(routes: RouteEntry[]): Transport {
	if (routes.length === 0) {
		throw new Error("route() requires at least one transport");
	}

	return {
		/**
		 * Connect to all child transports and merge metadata.
		 */
		async connect(): Promise<Metadata> {
			// Connect all transports in parallel
			const results = await Promise.all(
				routes.map(async (entry) => {
					const transport = getTransport(entry);
					try {
						return await transport.connect();
					} catch (error) {
						// Log but don't fail - allow partial connectivity
						console.warn(`Failed to connect to transport: ${(error as Error).message}`);
						return { version: "unknown", operations: {} } as Metadata;
					}
				}),
			);

			// Merge all metadata
			const mergedOperations: Record<string, Metadata["operations"][string]> = {};

			for (const metadata of results) {
				Object.assign(mergedOperations, metadata.operations);
			}

			return {
				version: results[0]?.version ?? "1.0.0",
				operations: mergedOperations,
			};
		},

		/**
		 * Execute operation by routing to matching transport.
		 */
		execute(op: Operation): Promise<Result> | Observable<Result> {
			const transport = findMatchingTransport(routes, op);
			return transport.execute(op);
		},
	};
}

// =============================================================================
// Route By Type Shorthand
// =============================================================================

/**
 * Route by type configuration.
 */
export interface RouteByTypeConfig {
	/** Transport for queries (optional, falls back to default) */
	query?: Transport;
	/** Transport for mutations (optional, falls back to default) */
	mutation?: Transport;
	/** Transport for subscriptions (optional, falls back to default) */
	subscription?: Transport;
	/** Default transport (required) */
	default: Transport;
}

/**
 * Create route transport that routes by operation type.
 *
 * Common pattern for splitting subscriptions to WebSocket while
 * using HTTP for queries and mutations.
 *
 * @example
 * ```typescript
 * const client = await createClient<Api>({
 *   transport: routeByType({
 *     default: http({ url: '/api' }),
 *     subscription: ws({ url: 'ws://localhost:3000' }),
 *   }),
 * })
 * ```
 */
export function routeByType(config: RouteByTypeConfig): Transport {
	const routes: RouteEntry[] = [];

	if (config.query) {
		routes.push([(op) => op.type === "query", config.query]);
	}

	if (config.mutation) {
		routes.push([(op) => op.type === "mutation", config.mutation]);
	}

	if (config.subscription) {
		routes.push([(op) => op.type === "subscription", config.subscription]);
	}

	// Default fallback
	routes.push(config.default);

	return route(routes);
}

// =============================================================================
// Route By Path Shorthand
// =============================================================================

/**
 * Route by path configuration.
 */
export interface RouteByPathConfig {
	/** Path prefix to transport mapping */
	paths: Record<string, Transport>;
	/** Default transport for unmatched paths */
	default: Transport;
}

/**
 * Create route transport that routes by operation path prefix.
 *
 * @example
 * ```typescript
 * const client = await createClient<Api>({
 *   transport: routeByPath({
 *     paths: {
 *       'auth.': http({ url: '/auth-api' }),
 *       'analytics.': http({ url: '/analytics-api' }),
 *     },
 *     default: http({ url: '/api' }),
 *   }),
 * })
 * ```
 */
export function routeByPath(config: RouteByPathConfig): Transport {
	const routes: RouteEntry[] = [];

	for (const [prefix, transport] of Object.entries(config.paths)) {
		routes.push([(op) => op.path.startsWith(prefix), transport]);
	}

	// Default fallback
	routes.push(config.default);

	return route(routes);
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Extract transport from route entry.
 */
function getTransport(entry: RouteEntry): Transport {
	if (Array.isArray(entry)) {
		return entry[1];
	}
	return entry;
}

/**
 * Get condition from route entry, if any.
 */
function getCondition(entry: RouteEntry): RouteCondition | null {
	if (Array.isArray(entry)) {
		return entry[0];
	}
	return null;
}

/**
 * Find transport matching operation.
 */
function findMatchingTransport(routes: RouteEntry[], op: Operation): Transport {
	for (const entry of routes) {
		const condition = getCondition(entry);

		// No condition = fallback (matches everything)
		if (!condition) {
			return getTransport(entry);
		}

		// Check condition
		if (condition(op)) {
			return getTransport(entry);
		}
	}

	// Should never happen if routes are configured correctly
	throw new Error(`No transport matched for operation: ${op.path}`);
}
