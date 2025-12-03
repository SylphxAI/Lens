/**
 * @sylphx/lens-server - State Sync Plugin
 *
 * Server-side plugin for cursor-based state synchronization.
 * Provides:
 * - Canonical state per entity (server truth)
 * - Version tracking (cursor-based)
 * - Operation log for efficient reconnection
 * - Patch computation
 *
 * This plugin ONLY handles state management.
 * Subscription routing is handled by the handler layer.
 *
 * Memory: O(entities × history) - does not scale with client count
 *
 * @example
 * ```typescript
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [stateSync()],
 * });
 * ```
 */

import type { PatchOperation } from "@sylphx/lens-core";
import { GraphStateManager, type GraphStateManagerConfig } from "../state/graph-state-manager.js";
import type {
	BroadcastContext,
	ReconnectContext,
	ReconnectHookResult,
	ServerPlugin,
} from "./types.js";

/**
 * State sync plugin configuration.
 */
export interface StateSyncOptions extends GraphStateManagerConfig {
	/**
	 * Whether to enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

/** @deprecated Use StateSyncOptions */
export type ClientStateOptions = StateSyncOptions;

/**
 * Broadcast result returned by the plugin.
 * Handler uses this to send updates to subscribers.
 */
export interface BroadcastResult {
	/** Current version after update */
	version: number;
	/** Patch operations (null if first emit or log evicted) */
	patch: PatchOperation[] | null;
	/** Full data (for initial sends or when patch unavailable) */
	data: Record<string, unknown>;
}

/**
 * Create a state sync plugin.
 *
 * This plugin provides cursor-based state synchronization:
 * - Canonical state per entity (server truth)
 * - Version tracking for cursor-based sync
 * - Operation log for efficient reconnection (patches or snapshot)
 *
 * This plugin does NOT handle subscription routing - that's the handler's job.
 * Memory: O(entities × history) - does not scale with client count.
 *
 * @example
 * ```typescript
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [stateSync()],
 * });
 * ```
 */
export function stateSync(options: StateSyncOptions = {}): ServerPlugin & {
	/** Get the underlying GraphStateManager instance */
	getStateManager(): GraphStateManager;
	/** Get version for an entity */
	getVersion(entity: string, entityId: string): number;
	/** Get current canonical state for an entity */
	getState(entity: string, entityId: string): Record<string, unknown> | undefined;
	/** Get latest patch for an entity */
	getLatestPatch(entity: string, entityId: string): PatchOperation[] | null;
} {
	const stateManager = new GraphStateManager(options);
	const debug = options.debug ?? false;

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[stateSync]", ...args);
		}
	};

	return {
		name: "stateSync",

		/**
		 * Get the underlying GraphStateManager instance.
		 */
		getStateManager(): GraphStateManager {
			return stateManager;
		},

		/**
		 * Get version for an entity.
		 */
		getVersion(entity: string, entityId: string): number {
			return stateManager.getVersion(entity, entityId);
		},

		/**
		 * Get current canonical state for an entity.
		 */
		getState(entity: string, entityId: string): Record<string, unknown> | undefined {
			return stateManager.getState(entity, entityId);
		},

		/**
		 * Get latest patch for an entity.
		 */
		getLatestPatch(entity: string, entityId: string): PatchOperation[] | null {
			return stateManager.getLatestPatch(entity, entityId);
		},

		/**
		 * Handle broadcast - update canonical state and return patch info.
		 * Handler is responsible for routing to subscribers.
		 */
		onBroadcast(ctx: BroadcastContext): BroadcastResult {
			const { entity, entityId, data } = ctx;

			log("onBroadcast:", entity, entityId);

			// Update canonical state (computes and logs patch)
			stateManager.emit(entity, entityId, data);

			// Return patch info for handler to use
			const version = stateManager.getVersion(entity, entityId);
			const patch = stateManager.getLatestPatch(entity, entityId);

			log("  Version:", version, "Patch ops:", patch?.length ?? 0);

			return { version, patch, data };
		},

		/**
		 * Handle reconnection - return patches or snapshot based on client's version.
		 */
		onReconnect(ctx: ReconnectContext): ReconnectHookResult[] {
			log("Reconnect:", ctx.clientId, "subscriptions:", ctx.subscriptions.length);

			const results: ReconnectHookResult[] = [];

			// Process each subscription using GraphStateManager
			const reconnectSubs = ctx.subscriptions.map((sub) => ({
				id: sub.id,
				entity: sub.entity,
				entityId: sub.entityId,
				version: sub.version,
				fields: sub.fields,
				...(sub.dataHash !== undefined && { dataHash: sub.dataHash }),
			}));

			const stateResults = stateManager.handleReconnect(reconnectSubs);

			for (let i = 0; i < ctx.subscriptions.length; i++) {
				const sub = ctx.subscriptions[i];
				const stateResult = stateResults[i];

				const result: ReconnectHookResult = {
					id: stateResult.id,
					entity: stateResult.entity,
					entityId: stateResult.entityId,
					status: stateResult.status,
					version: stateResult.version,
				};

				if (stateResult.patches) {
					result.patches = stateResult.patches;
				}
				if (stateResult.data) {
					result.data = stateResult.data;
				}

				results.push(result);

				log(
					"  Subscription",
					sub.id,
					`${sub.entity}:${sub.entityId}`,
					"status:",
					stateResult.status,
					"version:",
					stateResult.version,
				);
			}

			return results;
		},
	};
}

/** @deprecated Use stateSync */
export const clientState = stateSync;

/**
 * Check if a plugin is a state sync plugin.
 */
export function isStateSyncPlugin(
	plugin: ServerPlugin,
): plugin is ReturnType<typeof stateSync> {
	return plugin.name === "stateSync" && "getStateManager" in plugin;
}

/** @deprecated Use isStateSyncPlugin */
export const isClientStatePlugin = isStateSyncPlugin;
