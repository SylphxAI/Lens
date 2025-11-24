/**
 * @lens/server - Subscription Handler
 *
 * Handles field-level subscriptions and pushes updates to clients.
 * Works with SSE or WebSocket transports.
 */

import type { Update } from "@lens/core";

// =============================================================================
// Types
// =============================================================================

/** Client connection */
export interface SubscriptionClient {
	id: string;
	send: (message: ServerUpdateMessage) => void;
	close: () => void;
}

/** Subscribe message from client */
export interface ClientSubscribeMessage {
	type: "subscribe";
	entity: string;
	id: string;
	fields: string[] | "*";
}

/** Unsubscribe message from client */
export interface ClientUnsubscribeMessage {
	type: "unsubscribe";
	entity: string;
	id: string;
	fields: string[] | "*";
}

/** Client message types */
export type ClientMessage = ClientSubscribeMessage | ClientUnsubscribeMessage;

/** Update message to client */
export interface ServerUpdateMessage {
	type: "update";
	entity: string;
	id: string;
	field: string;
	update: Update;
}

/** Entity key format */
export type EntityKey = `${string}:${string}`;

/** Field subscription state */
export interface FieldSubscriptionState {
	/** Client IDs subscribed to this field */
	clients: Set<string>;
}

/** Entity subscription state */
export interface EntitySubscriptionState {
	/** Field-level subscriptions */
	fields: Map<string, FieldSubscriptionState>;
	/** Clients subscribed to all fields (*) */
	fullEntityClients: Set<string>;
}

/** Handler configuration */
export interface SubscriptionHandlerConfig {
	/** Callback when subscription changes (for integration with data layer) */
	onSubscriptionChange?: (entity: string, id: string, subscribedFields: string[]) => void;
}

// =============================================================================
// SubscriptionHandler
// =============================================================================

/**
 * Manages field-level subscriptions for real-time updates.
 *
 * Protocol:
 * - Client -> Server: subscribe/unsubscribe with field list
 * - Server -> Client: field-level updates with strategy (value/delta/patch)
 *
 * @example
 * ```typescript
 * const handler = new SubscriptionHandler();
 *
 * // Handle client connection
 * handler.addClient({
 *   id: "client-1",
 *   send: (msg) => ws.send(JSON.stringify(msg)),
 *   close: () => ws.close(),
 * });
 *
 * // Process client message
 * handler.handleMessage("client-1", {
 *   type: "subscribe",
 *   entity: "User",
 *   id: "123",
 *   fields: ["name", "bio"],
 * });
 *
 * // Push update when data changes
 * handler.pushUpdate("User", "123", "name", {
 *   strategy: "value",
 *   data: "New Name",
 * });
 * ```
 */
export class SubscriptionHandler {
	/** Connected clients */
	private clients = new Map<string, SubscriptionClient>();

	/** Entity subscriptions */
	private subscriptions = new Map<EntityKey, EntitySubscriptionState>();

	/** Client -> subscribed entities mapping (for cleanup) */
	private clientSubscriptions = new Map<string, Set<EntityKey>>();

	/** Configuration */
	private config: SubscriptionHandlerConfig;

	constructor(config: SubscriptionHandlerConfig = {}) {
		this.config = config;
	}

	// ===========================================================================
	// Client Management
	// ===========================================================================

	/**
	 * Add a client connection
	 */
	addClient(client: SubscriptionClient): void {
		this.clients.set(client.id, client);
		this.clientSubscriptions.set(client.id, new Set());
	}

	/**
	 * Remove a client connection and cleanup subscriptions
	 */
	removeClient(clientId: string): void {
		const client = this.clients.get(clientId);
		if (!client) return;

		// Cleanup all subscriptions for this client
		const entityKeys = this.clientSubscriptions.get(clientId);
		if (entityKeys) {
			for (const key of entityKeys) {
				const sub = this.subscriptions.get(key);
				if (sub) {
					// Remove from full entity subscriptions
					sub.fullEntityClients.delete(clientId);

					// Remove from field subscriptions
					for (const fieldState of sub.fields.values()) {
						fieldState.clients.delete(clientId);
					}

					// Cleanup empty subscriptions
					this.cleanupEmptySubscription(key);
				}
			}
		}

		this.clients.delete(clientId);
		this.clientSubscriptions.delete(clientId);
	}

	// ===========================================================================
	// Message Handling
	// ===========================================================================

	/**
	 * Handle incoming client message
	 */
	handleMessage(clientId: string, message: ClientMessage): void {
		switch (message.type) {
			case "subscribe":
				this.handleSubscribe(clientId, message);
				break;
			case "unsubscribe":
				this.handleUnsubscribe(clientId, message);
				break;
		}
	}

	/**
	 * Handle subscribe message
	 */
	private handleSubscribe(clientId: string, message: ClientSubscribeMessage): void {
		const key = this.makeKey(message.entity, message.id);

		// Get or create subscription state
		let sub = this.subscriptions.get(key);
		if (!sub) {
			sub = {
				fields: new Map(),
				fullEntityClients: new Set(),
			};
			this.subscriptions.set(key, sub);
		}

		// Track client -> entity mapping
		const clientSubs = this.clientSubscriptions.get(clientId);
		if (clientSubs) {
			clientSubs.add(key);
		}

		if (message.fields === "*") {
			// Subscribe to all fields
			sub.fullEntityClients.add(clientId);
		} else {
			// Subscribe to specific fields
			for (const field of message.fields) {
				let fieldState = sub.fields.get(field);
				if (!fieldState) {
					fieldState = { clients: new Set() };
					sub.fields.set(field, fieldState);
				}
				fieldState.clients.add(clientId);
			}
		}

		// Notify subscription change
		this.notifySubscriptionChange(message.entity, message.id);
	}

	/**
	 * Handle unsubscribe message
	 */
	private handleUnsubscribe(clientId: string, message: ClientUnsubscribeMessage): void {
		const key = this.makeKey(message.entity, message.id);
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		if (message.fields === "*") {
			// Unsubscribe from all fields
			sub.fullEntityClients.delete(clientId);
			for (const fieldState of sub.fields.values()) {
				fieldState.clients.delete(clientId);
			}
		} else {
			// Unsubscribe from specific fields
			for (const field of message.fields) {
				const fieldState = sub.fields.get(field);
				if (fieldState) {
					fieldState.clients.delete(clientId);
				}
			}
		}

		// Cleanup
		this.cleanupEmptySubscription(key);

		// Notify subscription change
		this.notifySubscriptionChange(message.entity, message.id);
	}

	// ===========================================================================
	// Update Pushing
	// ===========================================================================

	/**
	 * Push a field update to all subscribed clients
	 */
	pushUpdate(entity: string, id: string, field: string, update: Update): void {
		const key = this.makeKey(entity, id);
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		const message: ServerUpdateMessage = {
			type: "update",
			entity,
			id,
			field,
			update,
		};

		// Get all clients to notify
		const clientsToNotify = new Set<string>();

		// Add clients subscribed to all fields
		for (const clientId of sub.fullEntityClients) {
			clientsToNotify.add(clientId);
		}

		// Add clients subscribed to this specific field
		const fieldState = sub.fields.get(field);
		if (fieldState) {
			for (const clientId of fieldState.clients) {
				clientsToNotify.add(clientId);
			}
		}

		// Send update to all relevant clients
		for (const clientId of clientsToNotify) {
			const client = this.clients.get(clientId);
			if (client) {
				client.send(message);
			}
		}
	}

	/**
	 * Push multiple field updates at once
	 */
	pushEntityUpdate(entity: string, id: string, updates: Record<string, Update>): void {
		for (const [field, update] of Object.entries(updates)) {
			this.pushUpdate(entity, id, field, update);
		}
	}

	/**
	 * Push full entity update (value strategy for all fields)
	 */
	pushFullUpdate(entity: string, id: string, data: Record<string, unknown>): void {
		for (const [field, value] of Object.entries(data)) {
			this.pushUpdate(entity, id, field, { strategy: "value", data: value });
		}
	}

	// ===========================================================================
	// Query Methods
	// ===========================================================================

	/**
	 * Get all subscribed fields for an entity
	 */
	getSubscribedFields(entity: string, id: string): string[] {
		const key = this.makeKey(entity, id);
		const sub = this.subscriptions.get(key);
		if (!sub) return [];

		const fields = new Set<string>();

		// If any client is subscribed to all fields, we need all fields
		if (sub.fullEntityClients.size > 0) {
			return ["*"];
		}

		// Collect individually subscribed fields
		for (const [field, state] of sub.fields) {
			if (state.clients.size > 0) {
				fields.add(field);
			}
		}

		return Array.from(fields);
	}

	/**
	 * Check if entity has any subscribers
	 */
	hasSubscribers(entity: string, id: string): boolean {
		const key = this.makeKey(entity, id);
		const sub = this.subscriptions.get(key);
		if (!sub) return false;

		if (sub.fullEntityClients.size > 0) return true;

		for (const state of sub.fields.values()) {
			if (state.clients.size > 0) return true;
		}

		return false;
	}

	/**
	 * Get subscriber count for an entity
	 */
	getSubscriberCount(entity: string, id: string): number {
		const key = this.makeKey(entity, id);
		const sub = this.subscriptions.get(key);
		if (!sub) return 0;

		const uniqueClients = new Set<string>();

		for (const clientId of sub.fullEntityClients) {
			uniqueClients.add(clientId);
		}

		for (const state of sub.fields.values()) {
			for (const clientId of state.clients) {
				uniqueClients.add(clientId);
			}
		}

		return uniqueClients.size;
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	private makeKey(entity: string, id: string): EntityKey {
		return `${entity}:${id}`;
	}

	private cleanupEmptySubscription(key: EntityKey): void {
		const sub = this.subscriptions.get(key);
		if (!sub) return;

		// Check if any subscriptions remain
		if (sub.fullEntityClients.size > 0) return;

		for (const state of sub.fields.values()) {
			if (state.clients.size > 0) return;
		}

		// No subscribers left, remove
		this.subscriptions.delete(key);
	}

	private notifySubscriptionChange(entity: string, id: string): void {
		if (this.config.onSubscriptionChange) {
			const fields = this.getSubscribedFields(entity, id);
			this.config.onSubscriptionChange(entity, id, fields);
		}
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		clients: number;
		subscriptions: number;
		totalFieldSubscriptions: number;
	} {
		let totalFieldSubscriptions = 0;

		for (const sub of this.subscriptions.values()) {
			totalFieldSubscriptions += sub.fullEntityClients.size;
			for (const state of sub.fields.values()) {
				totalFieldSubscriptions += state.clients.size;
			}
		}

		return {
			clients: this.clients.size,
			subscriptions: this.subscriptions.size,
			totalFieldSubscriptions,
		};
	}

	/**
	 * Close all connections
	 */
	closeAll(): void {
		for (const client of this.clients.values()) {
			client.close();
		}
		this.clients.clear();
		this.subscriptions.clear();
		this.clientSubscriptions.clear();
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create subscription handler
 */
export function createSubscriptionHandler(config?: SubscriptionHandlerConfig): SubscriptionHandler {
	return new SubscriptionHandler(config);
}
