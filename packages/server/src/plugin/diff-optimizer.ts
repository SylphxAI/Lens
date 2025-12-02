/**
 * @sylphx/lens-server - Diff Optimizer Plugin
 *
 * Server-side plugin that enables efficient diff computation and state tracking.
 * By default, the server operates in stateless mode (sends full data).
 * Adding this plugin enables:
 * - Per-client state tracking
 * - Minimal diff computation
 * - Optimal transfer strategy selection (value/delta/patch)
 * - Reconnection support with version tracking
 *
 * This plugin is ideal for:
 * - Long-running WebSocket connections
 * - Bandwidth-sensitive applications
 * - Real-time collaborative features
 *
 * For serverless/stateless deployments, skip this plugin and let
 * the server send full data on each update.
 */

import { GraphStateManager, type GraphStateManagerConfig } from "../state/graph-state-manager.js";
import type {
	AfterSendContext,
	BeforeSendContext,
	ConnectContext,
	DisconnectContext,
	ServerPlugin,
	SubscribeContext,
	UnsubscribeContext,
} from "./types.js";

/**
 * Diff optimizer plugin configuration.
 */
export interface DiffOptimizerOptions extends GraphStateManagerConfig {
	/**
	 * Whether to enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

/**
 * Create a diff optimizer plugin.
 *
 * This plugin tracks state per-client and computes minimal diffs
 * when sending updates. Without this plugin, the server sends
 * full data on each update (stateless mode).
 *
 * @example
 * ```typescript
 * const server = createServer({
 *   router: appRouter,
 *   plugins: [
 *     diffOptimizer({
 *       // Optional: operation log settings for reconnection
 *       operationLog: { maxAge: 60000 },
 *     }),
 *   ],
 * });
 * ```
 */
export function diffOptimizer(options: DiffOptimizerOptions = {}): ServerPlugin & {
	/** Get the underlying GraphStateManager instance */
	getStateManager(): GraphStateManager;
} {
	const stateManager = new GraphStateManager(options);
	const debug = options.debug ?? false;

	// Track client-entity subscriptions for diff computation
	const clientSubscriptions = new Map<string, Set<string>>(); // clientId -> Set<entityKey>

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[diffOptimizer]", ...args);
		}
	};

	return {
		name: "diffOptimizer",

		/**
		 * Get the underlying GraphStateManager instance.
		 * Useful for advanced use cases like manual state management.
		 */
		getStateManager(): GraphStateManager {
			return stateManager;
		},

		/**
		 * When a client connects, register them with the state manager.
		 */
		onConnect(ctx: ConnectContext): void {
			log("Client connected:", ctx.clientId);

			// Note: We don't register with stateManager here because
			// we don't have the send function. The server handles that.
			clientSubscriptions.set(ctx.clientId, new Set());
		},

		/**
		 * When a client disconnects, clean up their state.
		 */
		onDisconnect(ctx: DisconnectContext): void {
			log("Client disconnected:", ctx.clientId, "subscriptions:", ctx.subscriptionCount);

			// Clean up client subscriptions tracking
			clientSubscriptions.delete(ctx.clientId);
		},

		/**
		 * When a client subscribes, track the subscription for diff computation.
		 */
		onSubscribe(ctx: SubscribeContext): void {
			log("Subscribe:", ctx.clientId, ctx.operation, ctx.entity, ctx.entityId);

			// Track subscription
			const subs = clientSubscriptions.get(ctx.clientId);
			if (subs && ctx.entity && ctx.entityId) {
				const entityKey = `${ctx.entity}:${ctx.entityId}`;
				subs.add(entityKey);
			}
		},

		/**
		 * When a client unsubscribes, remove from tracking.
		 */
		onUnsubscribe(ctx: UnsubscribeContext): void {
			log("Unsubscribe:", ctx.clientId, ctx.subscriptionId);

			// Remove tracked entities
			const subs = clientSubscriptions.get(ctx.clientId);
			if (subs) {
				for (const entityKey of ctx.entityKeys) {
					subs.delete(entityKey);
				}
			}
		},

		/**
		 * Before sending data, compute optimal diff if we have previous state.
		 */
		beforeSend(ctx: BeforeSendContext): Record<string, unknown> | void {
			log("beforeSend:", ctx.clientId, ctx.entity, ctx.entityId, "initial:", ctx.isInitial);

			// If this is initial data, just pass through
			if (ctx.isInitial) {
				return ctx.data;
			}

			// For subsequent updates, the server already uses GraphStateManager
			// which computes diffs. This hook is for additional processing.
			return ctx.data;
		},

		/**
		 * After sending data, update tracking.
		 */
		afterSend(ctx: AfterSendContext): void {
			log("afterSend:", ctx.clientId, ctx.entity, ctx.entityId, "timestamp:", ctx.timestamp);
		},
	};
}

/**
 * Check if a plugin is a diff optimizer plugin.
 */
export function isDiffOptimizerPlugin(
	plugin: ServerPlugin,
): plugin is ServerPlugin & { getStateManager(): GraphStateManager } {
	return plugin.name === "diffOptimizer" && "getStateManager" in plugin;
}
