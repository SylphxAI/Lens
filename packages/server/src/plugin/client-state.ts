/**
 * @sylphx/lens-server - Client State Plugin
 *
 * Server-side plugin that enables cursor-based state synchronization.
 * By default, the server operates in stateless mode.
 * Adding this plugin enables:
 * - Subscription management
 * - Version tracking per entity (cursor-based)
 * - Efficient patch-based updates (same patch sent to all subscribers)
 * - Reconnection support with state recovery via operation log
 *
 * Architecture (Cursor-Based):
 * - Server maintains: canonical state + version + operation log per entity
 * - NO per-client state tracking - memory is O(entities × history) not O(clients × entities)
 * - When state changes: compute patch once, send same patch to all subscribers
 * - Client tracks its own version and applies patches locally
 *
 * This plugin is ideal for:
 * - High client count scenarios (scalable memory)
 * - Long-running WebSocket connections
 * - Real-time collaborative features
 * - Offline-first patterns (clients can catch up via patches)
 *
 * For serverless/stateless deployments, skip this plugin.
 */

import type { PatchOperation } from "@sylphx/lens-core";
import { GraphStateManager, type GraphStateManagerConfig } from "../state/graph-state-manager.js";
import type {
	AfterSendContext,
	BeforeSendContext,
	BroadcastContext,
	ConnectContext,
	DisconnectContext,
	ReconnectContext,
	ReconnectHookResult,
	ServerPlugin,
	SubscribeContext,
	UnsubscribeContext,
	UpdateFieldsContext,
} from "./types.js";

/**
 * Client state plugin configuration.
 */
export interface ClientStateOptions extends GraphStateManagerConfig {
	/**
	 * Whether to enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

/**
 * Create a client state plugin.
 *
 * This plugin enables cursor-based state synchronization:
 * - Manages subscriptions and entity version tracking
 * - Sends same patch to all subscribers (not per-client diffs)
 * - Handles reconnection with operation log (patches or snapshot)
 *
 * Memory: O(entities × history) instead of O(clients × entities)
 *
 * Without this plugin, the server operates in stateless mode.
 *
 * @example
 * ```typescript
 * const server = createApp({
 *   router: appRouter,
 *   plugins: [
 *     clientState({
 *       // Optional: operation log settings for reconnection
 *       operationLog: { maxAge: 60000 },
 *     }),
 *   ],
 * });
 * ```
 */
export function clientState(options: ClientStateOptions = {}): ServerPlugin & {
	/** Get the underlying GraphStateManager instance */
	getStateManager(): GraphStateManager;
} {
	const stateManager = new GraphStateManager(options);
	const debug = options.debug ?? false;

	// Cursor-based: NO per-client state tracking
	// Memory is O(entities × history) instead of O(clients × entities)

	// Track client-entity subscriptions
	const clientSubscriptions = new Map<string, Set<string>>(); // clientId -> Set<entityKey>

	// Track client-entity fields: clientId → entityKey → fields (for field filtering only)
	const clientFields = new Map<string, Map<string, string[] | "*">>();

	// Store client send functions for actual message delivery
	const clientSendFns = new Map<string, (message: unknown) => void>();

	// Track entity subscribers: entityKey → Set<{ clientId, subscriptionId }>
	const entitySubscribers = new Map<string, Set<{ clientId: string; subscriptionId: string }>>();

	// Track subscription info: clientId → subscriptionId → { entity, entityId, fields }
	const subscriptionInfo = new Map<
		string,
		Map<string, { entity: string; entityId: string; fields: string[] | "*" }>
	>();

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[clientState]", ...args);
		}
	};

	const makeEntityKey = (entity: string, entityId: string) => `${entity}:${entityId}`;

	return {
		name: "clientState",

		/**
		 * Get the underlying GraphStateManager instance.
		 * Useful for advanced use cases like manual state management.
		 */
		getStateManager(): GraphStateManager {
			return stateManager;
		},

		/**
		 * When a client connects, initialize subscription tracking and store send function.
		 * Note: Cursor-based - no per-client state tracking needed.
		 */
		onConnect(ctx: ConnectContext): void {
			log("Client connected:", ctx.clientId);
			clientSubscriptions.set(ctx.clientId, new Set());
			clientFields.set(ctx.clientId, new Map());
			subscriptionInfo.set(ctx.clientId, new Map());

			// Store send function for message delivery
			if (ctx.send) {
				clientSendFns.set(ctx.clientId, ctx.send);
			}
		},

		/**
		 * When a client disconnects, clean up their subscription tracking.
		 * Note: Cursor-based - no per-client state to clean up.
		 */
		onDisconnect(ctx: DisconnectContext): void {
			log("Client disconnected:", ctx.clientId, "subscriptions:", ctx.subscriptionCount);

			// Clean up entity subscribers for all this client's subscriptions
			const subs = subscriptionInfo.get(ctx.clientId);
			if (subs) {
				for (const [subId, info] of subs) {
					const entityKey = makeEntityKey(info.entity, info.entityId);
					const subscribers = entitySubscribers.get(entityKey);
					if (subscribers) {
						for (const sub of subscribers) {
							if (sub.clientId === ctx.clientId && sub.subscriptionId === subId) {
								subscribers.delete(sub);
								break;
							}
						}
						if (subscribers.size === 0) {
							entitySubscribers.delete(entityKey);
						}
					}
				}
			}

			clientSubscriptions.delete(ctx.clientId);
			clientFields.delete(ctx.clientId);
			clientSendFns.delete(ctx.clientId);
			subscriptionInfo.delete(ctx.clientId);
		},

		/**
		 * When a client subscribes, track the subscription.
		 */
		onSubscribe(ctx: SubscribeContext): void {
			log("Subscribe:", ctx.clientId, ctx.operation, ctx.entity, ctx.entityId);

			const subs = clientSubscriptions.get(ctx.clientId);
			const fields = clientFields.get(ctx.clientId);
			const subInfo = subscriptionInfo.get(ctx.clientId);

			if (subs && ctx.entity && ctx.entityId) {
				const entityKey = makeEntityKey(ctx.entity, ctx.entityId);
				subs.add(entityKey);
				fields?.set(entityKey, ctx.fields);

				// Track subscription info for this client
				subInfo?.set(ctx.subscriptionId, {
					entity: ctx.entity,
					entityId: ctx.entityId,
					fields: ctx.fields,
				});

				// Track entity subscribers for broadcast
				let subscribers = entitySubscribers.get(entityKey);
				if (!subscribers) {
					subscribers = new Set();
					entitySubscribers.set(entityKey, subscribers);
				}
				subscribers.add({ clientId: ctx.clientId, subscriptionId: ctx.subscriptionId });
			}
		},

		/**
		 * When a client unsubscribes, remove from tracking.
		 * Note: Cursor-based - no per-client state to clean up.
		 */
		onUnsubscribe(ctx: UnsubscribeContext): void {
			log("Unsubscribe:", ctx.clientId, ctx.subscriptionId);

			const subs = clientSubscriptions.get(ctx.clientId);
			const fields = clientFields.get(ctx.clientId);
			const subInfo = subscriptionInfo.get(ctx.clientId);

			if (subs || fields) {
				for (const entityKey of ctx.entityKeys) {
					subs?.delete(entityKey);
					fields?.delete(entityKey);

					// Remove from entity subscribers
					const subscribers = entitySubscribers.get(entityKey);
					if (subscribers) {
						for (const sub of subscribers) {
							if (sub.clientId === ctx.clientId && sub.subscriptionId === ctx.subscriptionId) {
								subscribers.delete(sub);
								break;
							}
						}
						if (subscribers.size === 0) {
							entitySubscribers.delete(entityKey);
						}
					}
				}
			}

			// Remove subscription info
			subInfo?.delete(ctx.subscriptionId);
		},

		/**
		 * Before sending data for initial subscription.
		 * Cursor-based: sends full data + version (no per-client diff computation).
		 *
		 * Updates are handled via onBroadcast which sends same patch to all subscribers.
		 */
		beforeSend(ctx: BeforeSendContext): Record<string, unknown> | void {
			const { clientId, subscriptionId, entity, entityId, data, isInitial, fields } = ctx;
			const entityKey = makeEntityKey(entity, entityId);

			log("beforeSend:", clientId, entityKey, "initial:", isInitial);

			// Get send function for this client
			const sendFn = clientSendFns.get(clientId);
			if (!sendFn) {
				log("  No send function for client");
				return;
			}

			// Get current version from state manager
			const version = stateManager.getVersion(entity, entityId);

			// Filter data by subscribed fields if needed
			let filteredData = data;
			if (fields !== "*") {
				filteredData = {};
				for (const field of fields) {
					if (field in data) {
						filteredData[field] = data[field];
					}
				}
			}

			// Cursor-based: always send full data + version
			// Client tracks its own version and applies patches locally
			sendFn({
				type: "data",
				id: subscriptionId,
				entity,
				entityId,
				data: filteredData,
				version,
			});

			log("  Sent data with version:", version);
			return filteredData;
		},

		/**
		 * After sending data, log for debugging.
		 */
		afterSend(ctx: AfterSendContext): void {
			log("afterSend:", ctx.clientId, ctx.entity, ctx.entityId, "timestamp:", ctx.timestamp);
		},

		/**
		 * Handle client reconnection with subscription state.
		 * Uses GraphStateManager to determine sync strategy for each subscription.
		 * Cursor-based: client sends version, server returns patches or snapshot.
		 */
		onReconnect(ctx: ReconnectContext): ReconnectHookResult[] {
			log("Reconnect:", ctx.clientId, "subscriptions:", ctx.subscriptions.length);

			const results: ReconnectHookResult[] = [];

			// Initialize subscription tracking if not exists (cursor-based: no per-client state)
			if (!clientSubscriptions.has(ctx.clientId)) {
				clientSubscriptions.set(ctx.clientId, new Set());
				clientFields.set(ctx.clientId, new Map());
				subscriptionInfo.set(ctx.clientId, new Map());
			}

			// Process each subscription using GraphStateManager
			const reconnectSubs = ctx.subscriptions.map((sub) => {
				const mapped: {
					id: string;
					entity: string;
					entityId: string;
					version: number;
					fields: string[] | "*";
					dataHash?: string;
				} = {
					id: sub.id,
					entity: sub.entity,
					entityId: sub.entityId,
					version: sub.version,
					fields: sub.fields,
				};
				if (sub.dataHash !== undefined) {
					mapped.dataHash = sub.dataHash;
				}
				return mapped;
			});

			const stateResults = stateManager.handleReconnect(reconnectSubs);

			for (let i = 0; i < ctx.subscriptions.length; i++) {
				const sub = ctx.subscriptions[i];
				const stateResult = stateResults[i];
				const entityKey = makeEntityKey(sub.entity, sub.entityId);

				// Only restore subscription if not deleted/error
				if (stateResult.status !== "deleted" && stateResult.status !== "error") {
					// Track subscription and fields in plugin state
					const subs = clientSubscriptions.get(ctx.clientId);
					const fieldsMap = clientFields.get(ctx.clientId);
					const subInfo = subscriptionInfo.get(ctx.clientId);

					subs?.add(entityKey);
					fieldsMap?.set(entityKey, sub.fields);

					// Track subscription info
					subInfo?.set(sub.id, {
						entity: sub.entity,
						entityId: sub.entityId,
						fields: sub.fields,
					});

					// Track entity subscribers for broadcast
					let subscribers = entitySubscribers.get(entityKey);
					if (!subscribers) {
						subscribers = new Set();
						entitySubscribers.set(entityKey, subscribers);
					}
					subscribers.add({ clientId: ctx.clientId, subscriptionId: sub.id });

					// Cursor-based: no per-client state to update
					// Client will receive snapshot/patches and track its own version
				}

				// Convert to plugin result format
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
					entityKey,
					"status:",
					stateResult.status,
					"version:",
					stateResult.version,
				);
			}

			return results;
		},

		/**
		 * Handle client updating subscribed fields for an entity.
		 */
		onUpdateFields(ctx: UpdateFieldsContext): void {
			log(
				"UpdateFields:",
				ctx.clientId,
				ctx.entity,
				ctx.entityId,
				"from:",
				ctx.previousFields,
				"to:",
				ctx.fields,
			);

			const entityKey = makeEntityKey(ctx.entity, ctx.entityId);
			const fieldsMap = clientFields.get(ctx.clientId);
			const subInfo = subscriptionInfo.get(ctx.clientId);

			if (fieldsMap) {
				fieldsMap.set(entityKey, ctx.fields);
			}

			// Update subscription info
			if (subInfo) {
				const info = subInfo.get(ctx.subscriptionId);
				if (info) {
					info.fields = ctx.fields;
				}
			}
		},

		/**
		 * Handle broadcast - find all subscribers of an entity and send SAME patch to all.
		 * This is the core of cursor-based design:
		 * - Compute patch ONCE (not per-client)
		 * - Send same patch to ALL subscribers
		 * - Memory is O(entities × history) not O(clients × entities)
		 */
		onBroadcast(ctx: BroadcastContext): boolean {
			const { entity, entityId, data } = ctx;
			const entityKey = makeEntityKey(entity, entityId);

			log("onBroadcast:", entityKey);

			const subscribers = entitySubscribers.get(entityKey);
			if (!subscribers || subscribers.size === 0) {
				log("  No subscribers for entity");
				// Still update canonical state for future subscribers
				stateManager.emit(entity, entityId, data);
				return true;
			}

			// Update canonical state via GraphStateManager (computes patch once)
			stateManager.emit(entity, entityId, data);

			// Get the patch that was computed (same for all subscribers)
			const version = stateManager.getVersion(entity, entityId);
			const patch = stateManager.getLatestPatch(entity, entityId);

			log("  Version:", version, "Patch ops:", patch?.length ?? 0);

			// Send SAME message to ALL subscribers (cursor-based)
			for (const { clientId, subscriptionId } of subscribers) {
				const sendFn = clientSendFns.get(clientId);
				if (!sendFn) {
					log("  No send function for client:", clientId);
					continue;
				}

				// Get client's subscribed fields for this entity (for filtering)
				const fieldsMap = clientFields.get(clientId);
				const fields = fieldsMap?.get(entityKey) ?? "*";

				if (patch && patch.length > 0) {
					// Filter patch by subscribed fields if needed
					let filteredPatch: PatchOperation[] = patch;
					if (fields !== "*") {
						const fieldSet = new Set(fields);
						filteredPatch = patch.filter((op) => {
							// Extract field name from path (e.g., "/fieldName" or "/fieldName/nested")
							const pathParts = op.path.split("/");
							const fieldName = pathParts[1]; // First part after leading /
							return fieldSet.has(fieldName);
						});
					}

					if (filteredPatch.length > 0) {
						// Send patch update
						sendFn({
							type: "patch",
							id: subscriptionId,
							entity,
							entityId,
							patch: filteredPatch,
							version,
						});
						log("  Sent patch to:", clientId, "ops:", filteredPatch.length);
					} else {
						log("  No relevant fields for:", clientId);
					}
				} else {
					// No patch available (first emit or log evicted) - send full data
					let filteredData = data;
					if (fields !== "*") {
						filteredData = {};
						for (const field of fields) {
							if (field in data) {
								filteredData[field] = data[field];
							}
						}
					}

					sendFn({
						type: "data",
						id: subscriptionId,
						entity,
						entityId,
						data: filteredData,
						version,
					});
					log("  Sent full data to:", clientId);
				}
			}

			return true;
		},
	};
}

/**
 * Check if a plugin is a client state plugin.
 */
export function isClientStatePlugin(
	plugin: ServerPlugin,
): plugin is ServerPlugin & { getStateManager(): GraphStateManager } {
	return plugin.name === "clientState" && "getStateManager" in plugin;
}
