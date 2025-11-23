/**
 * @lens/server - SSE Handler
 *
 * Server-Sent Events handler for streaming updates.
 * Supports progress streaming for long-running operations like embeddings.
 */

// =============================================================================
// Types
// =============================================================================

/** SSE client connection */
export interface SSEClient {
	id: string;
	send: (event: string, data: unknown) => void;
	close: () => void;
}

/** SSE subscription */
export interface SSESubscription {
	subscriptionId: string;
	entity: string;
	entityId: string;
	select?: Record<string, unknown>;
}

/** Progress event for streaming operations */
export interface ProgressEvent {
	/** Operation ID */
	operationId: string;
	/** Progress percentage (0-100) */
	progress: number;
	/** Current stage/step */
	stage?: string;
	/** Items processed */
	processed?: number;
	/** Total items */
	total?: number;
	/** Partial result (if available) */
	partial?: unknown;
	/** Is operation complete */
	done: boolean;
	/** Error if failed */
	error?: string;
}

/** SSE handler configuration */
export interface SSEHandlerConfig {
	/** Heartbeat interval in ms (default: 30000) */
	heartbeatInterval?: number;
	/** Client timeout in ms (default: 60000) */
	clientTimeout?: number;
}

// =============================================================================
// SSE Handler
// =============================================================================

/**
 * SSE handler for streaming server events
 *
 * @example
 * ```typescript
 * const sseHandler = new SSEHandler();
 *
 * // Handle SSE connection
 * app.get('/stream', (req, res) => {
 *   sseHandler.handleConnection(req, res);
 * });
 *
 * // Stream progress updates
 * sseHandler.sendProgress('op-123', {
 *   progress: 50,
 *   stage: 'Generating embeddings',
 *   processed: 500,
 *   total: 1000,
 *   done: false,
 * });
 * ```
 */
export class SSEHandler {
	private clients = new Map<string, SSEClient>();
	private subscriptions = new Map<string, SSESubscription[]>();
	private operationListeners = new Map<string, Set<string>>(); // operationId -> clientIds
	private heartbeatIntervals = new Map<string, ReturnType<typeof setInterval>>();
	private config: Required<SSEHandlerConfig>;
	private clientCounter = 0;

	constructor(config: SSEHandlerConfig = {}) {
		this.config = {
			heartbeatInterval: config.heartbeatInterval ?? 30000,
			clientTimeout: config.clientTimeout ?? 60000,
		};
	}

	// ===========================================================================
	// Connection Management
	// ===========================================================================

	/**
	 * Handle new SSE connection (Bun/Node compatible)
	 */
	handleConnection(req: Request): Response {
		const clientId = `sse_${++this.clientCounter}_${Date.now()}`;

		// Create SSE response stream
		const stream = new ReadableStream({
			start: (controller) => {
				const encoder = new TextEncoder();

				const client: SSEClient = {
					id: clientId,
					send: (event: string, data: unknown) => {
						const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
						controller.enqueue(encoder.encode(message));
					},
					close: () => {
						controller.close();
						this.removeClient(clientId);
					},
				};

				this.clients.set(clientId, client);

				// Send connected event
				client.send("connected", { clientId });

				// Start heartbeat
				const heartbeat = setInterval(() => {
					try {
						client.send("heartbeat", { timestamp: Date.now() });
					} catch {
						this.removeClient(clientId);
					}
				}, this.config.heartbeatInterval);

				this.heartbeatIntervals.set(clientId, heartbeat);
			},
			cancel: () => {
				this.removeClient(clientId);
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"Access-Control-Allow-Origin": "*",
			},
		});
	}

	/**
	 * Remove client and cleanup
	 */
	private removeClient(clientId: string): void {
		const heartbeat = this.heartbeatIntervals.get(clientId);
		if (heartbeat) {
			clearInterval(heartbeat);
			this.heartbeatIntervals.delete(clientId);
		}

		this.clients.delete(clientId);

		// Remove from operation listeners
		for (const [opId, listeners] of this.operationListeners) {
			listeners.delete(clientId);
			if (listeners.size === 0) {
				this.operationListeners.delete(opId);
			}
		}

		// Remove subscriptions
		this.subscriptions.delete(clientId);
	}

	// ===========================================================================
	// Subscriptions
	// ===========================================================================

	/**
	 * Add subscription for a client
	 */
	addSubscription(clientId: string, subscription: SSESubscription): void {
		const subs = this.subscriptions.get(clientId) ?? [];
		subs.push(subscription);
		this.subscriptions.set(clientId, subs);
	}

	/**
	 * Remove subscription
	 */
	removeSubscription(clientId: string, subscriptionId: string): void {
		const subs = this.subscriptions.get(clientId);
		if (subs) {
			const filtered = subs.filter((s) => s.subscriptionId !== subscriptionId);
			this.subscriptions.set(clientId, filtered);
		}
	}

	/**
	 * Broadcast data to all subscribers of an entity
	 */
	broadcastToEntity(entity: string, entityId: string, data: unknown): void {
		for (const [clientId, subs] of this.subscriptions) {
			const client = this.clients.get(clientId);
			if (!client) continue;

			for (const sub of subs) {
				if (sub.entity === entity && sub.entityId === entityId) {
					client.send("data", {
						type: "data",
						subscriptionId: sub.subscriptionId,
						data,
					});
				}
			}
		}
	}

	/**
	 * Send update to all subscribers of an entity
	 */
	broadcastUpdate(entity: string, entityId: string, update: unknown): void {
		for (const [clientId, subs] of this.subscriptions) {
			const client = this.clients.get(clientId);
			if (!client) continue;

			for (const sub of subs) {
				if (sub.entity === entity && sub.entityId === entityId) {
					client.send("update", {
						type: "update",
						subscriptionId: sub.subscriptionId,
						data: update,
					});
				}
			}
		}
	}

	// ===========================================================================
	// Progress Streaming (for embeddings, LLM, etc.)
	// ===========================================================================

	/**
	 * Subscribe client to operation progress
	 */
	subscribeToOperation(clientId: string, operationId: string): void {
		const listeners = this.operationListeners.get(operationId) ?? new Set();
		listeners.add(clientId);
		this.operationListeners.set(operationId, listeners);
	}

	/**
	 * Unsubscribe client from operation progress
	 */
	unsubscribeFromOperation(clientId: string, operationId: string): void {
		const listeners = this.operationListeners.get(operationId);
		if (listeners) {
			listeners.delete(clientId);
			if (listeners.size === 0) {
				this.operationListeners.delete(operationId);
			}
		}
	}

	/**
	 * Send progress update for an operation
	 *
	 * @example
	 * ```typescript
	 * // During embedding generation
	 * for (let i = 0; i < documents.length; i++) {
	 *   const embedding = await generateEmbedding(documents[i]);
	 *
	 *   sseHandler.sendProgress(operationId, {
	 *     progress: ((i + 1) / documents.length) * 100,
	 *     stage: 'Generating embeddings',
	 *     processed: i + 1,
	 *     total: documents.length,
	 *     done: false,
	 *   });
	 * }
	 *
	 * // When complete
	 * sseHandler.sendProgress(operationId, {
	 *   progress: 100,
	 *   done: true,
	 *   partial: { embeddingCount: documents.length },
	 * });
	 * ```
	 */
	sendProgress(operationId: string, event: Omit<ProgressEvent, "operationId">): void {
		const listeners = this.operationListeners.get(operationId);
		if (!listeners) return;

		const progressEvent: ProgressEvent = {
			operationId,
			...event,
		};

		for (const clientId of listeners) {
			const client = this.clients.get(clientId);
			if (client) {
				client.send("progress", progressEvent);
			}
		}

		// Cleanup if operation is done
		if (event.done) {
			this.operationListeners.delete(operationId);
		}
	}

	/**
	 * Send error for an operation
	 */
	sendOperationError(operationId: string, error: string): void {
		this.sendProgress(operationId, {
			progress: 0,
			done: true,
			error,
		});
	}

	// ===========================================================================
	// Direct Messaging
	// ===========================================================================

	/**
	 * Send message to specific client
	 */
	sendToClient(clientId: string, event: string, data: unknown): void {
		const client = this.clients.get(clientId);
		if (client) {
			client.send(event, data);
		}
	}

	/**
	 * Broadcast message to all clients
	 */
	broadcast(event: string, data: unknown): void {
		for (const client of this.clients.values()) {
			client.send(event, data);
		}
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	/**
	 * Get connected client count
	 */
	getClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Get active operation count
	 */
	getActiveOperationCount(): number {
		return this.operationListeners.size;
	}

	/**
	 * Check if client is connected
	 */
	isClientConnected(clientId: string): boolean {
		return this.clients.has(clientId);
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
		this.operationListeners.clear();

		for (const heartbeat of this.heartbeatIntervals.values()) {
			clearInterval(heartbeat);
		}
		this.heartbeatIntervals.clear();
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create SSE handler
 */
export function createSSEHandler(config?: SSEHandlerConfig): SSEHandler {
	return new SSEHandler(config);
}
