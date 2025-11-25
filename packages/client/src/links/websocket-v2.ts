/**
 * @lens/client - WebSocket Link V2
 *
 * WebSocket transport for operations-based API (V2 protocol).
 * Supports:
 * - query (single result)
 * - subscribe (streaming)
 * - mutation
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [websocketLinkV2({ url: 'ws://localhost:3000' })],
 * });
 *
 * // Single result
 * const user = await client.query.getUser({ id: "1" });
 *
 * // Streaming subscription
 * client.subscribe.watchUser({ id: "1" }, (user) => {
 *   console.log("User updated:", user);
 * });
 * ```
 */

import type { Link, LinkFn, OperationContext, OperationResult } from "./types";
import { type Update, applyUpdate } from "@lens/core";

// =============================================================================
// Types
// =============================================================================

/** WebSocket link V2 options */
export interface WebSocketLinkV2Options {
	/** WebSocket URL */
	url: string;
	/** Reconnection delay in ms (default: 1000) */
	reconnectDelay?: number;
	/** Max reconnection attempts (default: 10) */
	maxReconnectAttempts?: number;
	/** Connection timeout in ms (default: 5000) */
	connectionTimeout?: number;
	/** Request timeout in ms (default: 30000) */
	requestTimeout?: number;
	/** Called when connected */
	onConnect?: () => void;
	/** Called when disconnected */
	onDisconnect?: () => void;
	/** Called when reconnected */
	onReconnect?: () => void;
}

/** WebSocket connection state */
export type WebSocketV2State = "connecting" | "connected" | "disconnected" | "reconnecting";

/** Subscription callback */
export type SubscriptionCallback<T = unknown> = (data: T, updates?: Record<string, Update>) => void;

/** Subscription handle */
export interface Subscription {
	/** Unsubscribe and cleanup */
	unsubscribe(): void;
}

/** Pending request */
interface PendingRequest {
	resolve: (result: OperationResult) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

/** Active subscription */
interface ActiveSubscription {
	callback: SubscriptionCallback;
	onComplete?: () => void;
	onError?: (error: Error) => void;
	/** Query name for resubscription after reconnect */
	name: string;
	/** Query input for resubscription after reconnect */
	input: unknown;
	/** Last received data for applying incremental updates */
	lastData: unknown;
}

// =============================================================================
// Message Types (V2 Protocol)
// =============================================================================

/** Client query message (single result) */
interface QueryMessage {
	type: "query";
	id: string;
	name: string;
	input?: unknown;
}

/** Client subscribe message (streaming) */
interface SubscribeMessage {
	type: "subscribe";
	id: string;
	name: string;
	input?: unknown;
}

/** Client unsubscribe message */
interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
}

/** Client mutation message */
interface MutationMessage {
	type: "mutation";
	id: string;
	name: string;
	input: unknown;
}

/** Client handshake message */
interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

/** Server data response (single result for query) */
interface DataResponse {
	type: "data";
	id: string;
	data: unknown;
}

/** Server update response (streaming for subscribe) */
interface UpdateResponse {
	type: "update";
	id: string;
	data: unknown;
	updates?: Record<string, Update>;
}

/** Server complete response (subscription ended) */
interface CompleteResponse {
	type: "complete";
	id: string;
}

/** Server result response (for mutations) */
interface ResultResponse {
	type: "result";
	id: string;
	data: unknown;
}

/** Server error response */
interface ErrorResponse {
	type: "error";
	id?: string;
	error: {
		code: string;
		message: string;
	};
}

/** Server handshake response */
interface HandshakeResponse {
	type: "handshake";
	id: string;
	version: string;
	queries: string[];
	mutations: string[];
}

type ServerMessage = DataResponse | UpdateResponse | CompleteResponse | ResultResponse | ErrorResponse | HandshakeResponse;

// =============================================================================
// WebSocket Transport V2
// =============================================================================

/**
 * WebSocket transport for V2 operations protocol with full streaming support.
 */
export class WebSocketTransportV2 {
	private ws: WebSocket | null = null;
	private state: WebSocketV2State = "disconnected";
	private pendingRequests = new Map<string, PendingRequest>();
	private activeSubscriptions = new Map<string, ActiveSubscription>();
	private messageId = 0;
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private serverInfo: HandshakeResponse | null = null;

	constructor(private options: WebSocketLinkV2Options) {}

	/** Get current state */
	getState(): WebSocketV2State {
		return this.state;
	}

	/** Get server info from handshake */
	getServerInfo(): HandshakeResponse | null {
		return this.serverInfo;
	}

	/** Connect to WebSocket server */
	async connect(): Promise<void> {
		if (this.state === "connected" || this.state === "connecting") {
			return;
		}

		this.state = "connecting";

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Connection timeout"));
				this.ws?.close();
			}, this.options.connectionTimeout ?? 5000);

			try {
				this.ws = new WebSocket(this.options.url);

				this.ws.onopen = () => {
					clearTimeout(timeout);
					this.state = "connected";
					this.reconnectAttempts = 0;
					this.options.onConnect?.();
					this.resubscribeAll();
					resolve();
				};

				this.ws.onclose = () => {
					this.handleDisconnect();
				};

				this.ws.onerror = () => {
					clearTimeout(timeout);
					if (this.state === "connecting") {
						reject(new Error("WebSocket connection failed"));
					}
				};

				this.ws.onmessage = (event) => {
					this.handleMessage(event.data as string);
				};
			} catch (err) {
				clearTimeout(timeout);
				reject(err);
			}
		});
	}

	/** Disconnect from WebSocket server */
	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.onclose = null; // Prevent reconnect
			this.ws.close();
			this.ws = null;
		}

		this.state = "disconnected";

		// Reject all pending requests
		for (const [id, request] of this.pendingRequests) {
			clearTimeout(request.timeout);
			request.reject(new Error("Connection closed"));
		}
		this.pendingRequests.clear();

		// Complete all subscriptions with error
		for (const [id, sub] of this.activeSubscriptions) {
			sub.onError?.(new Error("Connection closed"));
		}
		// Don't clear subscriptions - we'll resubscribe on reconnect
	}

	/** Execute a query (single result) */
	async query(name: string, input?: unknown): Promise<unknown> {
		await this.ensureConnected();

		const id = this.nextId();
		const message: QueryMessage = {
			type: "query",
			id,
			name,
			input,
		};

		return this.sendRequest(id, message);
	}

	/** Execute a mutation */
	async mutate(name: string, input: unknown): Promise<unknown> {
		await this.ensureConnected();

		const id = this.nextId();
		const message: MutationMessage = {
			type: "mutation",
			id,
			name,
			input,
		};

		return this.sendRequest(id, message);
	}

	/**
	 * Subscribe to a query (streaming).
	 * Returns a handle to unsubscribe.
	 */
	subscribe<T = unknown>(
		name: string,
		input: unknown,
		callback: SubscriptionCallback<T>,
		options?: {
			onComplete?: () => void;
			onError?: (error: Error) => void;
		},
	): Subscription {
		const id = this.nextId();

		// Store subscription with metadata for resubscription after reconnect
		this.activeSubscriptions.set(id, {
			callback: callback as SubscriptionCallback,
			onComplete: options?.onComplete,
			onError: options?.onError,
			name,
			input,
			lastData: null,
		});

		// Send subscribe message
		const message: SubscribeMessage = {
			type: "subscribe",
			id,
			name,
			input,
		};

		// Connect if needed and send
		this.ensureConnected().then(() => {
			this.ws?.send(JSON.stringify(message));
		}).catch((error) => {
			options?.onError?.(error);
			this.activeSubscriptions.delete(id);
		});

		// Return unsubscribe handle
		return {
			unsubscribe: () => {
				this.unsubscribe(id);
			},
		};
	}

	/** Unsubscribe from a subscription */
	private unsubscribe(id: string): void {
		const sub = this.activeSubscriptions.get(id);
		if (!sub) return;

		this.activeSubscriptions.delete(id);

		// Send unsubscribe message
		if (this.state === "connected" && this.ws) {
			const message: UnsubscribeMessage = {
				type: "unsubscribe",
				id,
			};
			this.ws.send(JSON.stringify(message));
		}
	}

	/** Perform handshake */
	async handshake(clientVersion?: string): Promise<HandshakeResponse> {
		await this.ensureConnected();

		const id = this.nextId();
		const message: HandshakeMessage = {
			type: "handshake",
			id,
			clientVersion,
		};

		const response = await this.sendRequest(id, message) as HandshakeResponse;
		this.serverInfo = response;
		return response;
	}

	private async ensureConnected(): Promise<void> {
		if (this.state !== "connected") {
			await this.connect();
		}
	}

	private nextId(): string {
		return `${Date.now()}-${++this.messageId}`;
	}

	private sendRequest(id: string, message: object): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error("Request timeout"));
			}, this.options.requestTimeout ?? 30000);

			this.pendingRequests.set(id, { resolve, reject, timeout });

			this.ws?.send(JSON.stringify(message));
		});
	}

	private handleMessage(data: string): void {
		try {
			const message = JSON.parse(data) as ServerMessage;

			switch (message.type) {
				case "error":
					this.handleError(message);
					break;

				case "data":
				case "result":
					this.handleDataOrResult(message);
					break;

				case "update":
					this.handleUpdate(message);
					break;

				case "complete":
					this.handleComplete(message);
					break;

				case "handshake":
					this.handleHandshake(message);
					break;
			}
		} catch (err) {
			console.error("Failed to parse WebSocket message:", err);
		}
	}

	private handleError(message: ErrorResponse): void {
		if (message.id) {
			// Check if it's for a pending request
			const request = this.pendingRequests.get(message.id);
			if (request) {
				clearTimeout(request.timeout);
				this.pendingRequests.delete(message.id);
				request.reject(new Error(message.error.message));
				return;
			}

			// Check if it's for a subscription
			const sub = this.activeSubscriptions.get(message.id);
			if (sub) {
				sub.onError?.(new Error(message.error.message));
				this.activeSubscriptions.delete(message.id);
				return;
			}
		}

		// General error
		console.error("WebSocket error:", message.error);
	}

	private handleDataOrResult(message: DataResponse | ResultResponse): void {
		const request = this.pendingRequests.get(message.id);
		if (request) {
			clearTimeout(request.timeout);
			this.pendingRequests.delete(message.id);
			request.resolve({ data: message.data });
		}
	}

	private handleUpdate(message: UpdateResponse): void {
		const sub = this.activeSubscriptions.get(message.id);
		if (!sub) return;

		let data: unknown;

		if (message.data !== undefined) {
			// Full data update (first message or reconnect)
			data = message.data;
			sub.lastData = data;
		} else if (message.updates && sub.lastData !== null) {
			// Incremental update - apply diff to reconstruct full data
			data = this.applyUpdates(sub.lastData, message.updates);
			sub.lastData = data;
		} else {
			// No data and no updates - shouldn't happen
			return;
		}

		sub.callback(data, message.updates);
	}

	/** Apply field-level updates to reconstruct full data */
	private applyUpdates(
		current: unknown,
		updates: Record<string, Update>,
	): unknown {
		if (typeof current !== "object" || current === null) {
			return current;
		}

		const result = { ...(current as Record<string, unknown>) };

		for (const [field, update] of Object.entries(updates)) {
			result[field] = applyUpdate(result[field], update);
		}

		return result;
	}

	private handleComplete(message: CompleteResponse): void {
		const sub = this.activeSubscriptions.get(message.id);
		if (sub) {
			sub.onComplete?.();
			this.activeSubscriptions.delete(message.id);
		}
	}

	private handleHandshake(message: HandshakeResponse): void {
		const request = this.pendingRequests.get(message.id);
		if (request) {
			clearTimeout(request.timeout);
			this.pendingRequests.delete(message.id);
			request.resolve({ data: message });
		}
		this.serverInfo = message;
	}

	private handleDisconnect(): void {
		const wasConnected = this.state === "connected";
		this.state = "disconnected";

		if (wasConnected) {
			this.options.onDisconnect?.();
		}

		// Reject pending requests
		for (const [id, request] of this.pendingRequests) {
			clearTimeout(request.timeout);
			request.reject(new Error("Connection lost"));
		}
		this.pendingRequests.clear();

		// Attempt reconnect
		this.attemptReconnect();
	}

	private attemptReconnect(): void {
		const maxAttempts = this.options.maxReconnectAttempts ?? 10;

		if (this.reconnectAttempts >= maxAttempts) {
			// Fail all subscriptions
			for (const [id, sub] of this.activeSubscriptions) {
				sub.onError?.(new Error("Max reconnection attempts reached"));
			}
			this.activeSubscriptions.clear();
			return;
		}

		this.state = "reconnecting";
		this.reconnectAttempts++;

		const delay = (this.options.reconnectDelay ?? 1000) * Math.min(this.reconnectAttempts, 5);

		this.reconnectTimer = setTimeout(async () => {
			try {
				await this.connect();
				this.options.onReconnect?.();
			} catch {
				this.attemptReconnect();
			}
		}, delay);
	}

	/** Resubscribe all active subscriptions after reconnect */
	private resubscribeAll(): void {
		if (!this.ws || this.state !== "connected") return;

		// Resend subscribe messages for all active subscriptions
		for (const [id, sub] of this.activeSubscriptions) {
			const message: SubscribeMessage = {
				type: "subscribe",
				id,
				name: sub.name,
				input: sub.input,
			};
			this.ws.send(JSON.stringify(message));
		}
	}

	/** Get subscription count */
	getSubscriptionCount(): number {
		return this.activeSubscriptions.size;
	}
}

// =============================================================================
// Link Factory
// =============================================================================

/**
 * Create WebSocket link for V2 operations protocol with full streaming support.
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [
 *     loggerLink(),
 *     websocketLinkV2({ url: 'ws://localhost:3000' }),
 *   ],
 * });
 * ```
 */
export function websocketLinkV2(options: WebSocketLinkV2Options): Link {
	let transport: WebSocketTransportV2 | null = null;

	return (): LinkFn => {
		// Lazy init transport
		if (!transport) {
			transport = new WebSocketTransportV2(options);
		}

		return async (op: OperationContext): Promise<OperationResult> => {
			try {
				if (op.type === "query") {
					const result = await transport!.query(op.op, op.input);
					return result as OperationResult;
				}

				if (op.type === "mutation") {
					const result = await transport!.mutate(op.op, op.input);
					return result as OperationResult;
				}

				return { error: new Error(`Unknown operation type: ${op.type}`) };
			} catch (err) {
				return { error: err instanceof Error ? err : new Error(String(err)) };
			}
		};
	};
}

/**
 * Create WebSocket transport V2 (for direct use with subscriptions)
 */
export function createWebSocketTransportV2(
	options: WebSocketLinkV2Options,
): WebSocketTransportV2 {
	return new WebSocketTransportV2(options);
}
