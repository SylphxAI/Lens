/**
 * @lens/client - SSE Transport
 *
 * Server-Sent Events transport for streaming updates.
 * Ideal for LLM responses and real-time data.
 */

import type {
	Transport,
	ConnectionState,
	SubscribeInput,
	QueryInput,
	MutateInput,
	ServerMessage,
} from "./types";

// =============================================================================
// Types
// =============================================================================

export interface SSETransportConfig {
	/** Base URL for HTTP endpoints */
	url: string;
	/** SSE endpoint URL (defaults to url + '/stream') */
	sseUrl?: string;
	/** Request headers */
	headers?: Record<string, string>;
	/** Reconnect on disconnect */
	autoReconnect?: boolean;
	/** Reconnect delay in ms */
	reconnectDelay?: number;
}

// =============================================================================
// SSE Transport Implementation
// =============================================================================

/**
 * Server-Sent Events transport
 *
 * Uses SSE for server-to-client streaming (subscriptions)
 * and HTTP POST for client-to-server messages (mutations, queries)
 *
 * @example
 * ```typescript
 * const transport = new SSETransport({
 *   url: 'http://localhost:3000',
 *   headers: { 'Authorization': 'Bearer token' },
 * });
 * ```
 */
export class SSETransport implements Transport {
	private config: Required<Omit<SSETransportConfig, "sseUrl">> & { sseUrl: string };
	private _state: ConnectionState = "disconnected";
	private stateListeners = new Set<(state: ConnectionState) => void>();
	private messageListeners = new Set<(message: ServerMessage) => void>();
	private eventSource: EventSource | null = null;
	private subscriptions = new Map<string, SubscribeInput>();
	private subscriptionCounter = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: SSETransportConfig) {
		this.config = {
			url: config.url,
			sseUrl: config.sseUrl ?? `${config.url}/stream`,
			headers: config.headers ?? {},
			autoReconnect: config.autoReconnect ?? true,
			reconnectDelay: config.reconnectDelay ?? 1000,
		};
	}

	// ===========================================================================
	// Transport Interface
	// ===========================================================================

	get state(): ConnectionState {
		return this._state;
	}

	async connect(): Promise<void> {
		if (this._state === "connected" || this._state === "connecting") {
			return;
		}

		this.setState("connecting");

		return new Promise((resolve, reject) => {
			try {
				// Create EventSource for SSE
				// Note: EventSource doesn't support custom headers natively
				// For auth, use query params or cookies
				this.eventSource = new EventSource(this.config.sseUrl);

				this.eventSource.onopen = () => {
					this.setState("connected");
					resolve();
				};

				this.eventSource.onerror = () => {
					if (this._state === "connecting") {
						this.setState("disconnected");
						reject(new Error("Failed to connect to SSE endpoint"));
					} else {
						this.handleDisconnect();
					}
				};

				this.eventSource.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data) as ServerMessage;
						this.notifyMessage(message);
					} catch {
						// Ignore parse errors
					}
				};

				// Listen for specific event types
				this.eventSource.addEventListener("data", (event) => {
					try {
						const message = JSON.parse((event as MessageEvent).data) as ServerMessage;
						this.notifyMessage(message);
					} catch {
						// Ignore parse errors
					}
				});

				this.eventSource.addEventListener("update", (event) => {
					try {
						const message = JSON.parse((event as MessageEvent).data) as ServerMessage;
						this.notifyMessage(message);
					} catch {
						// Ignore parse errors
					}
				});

				// Custom 'lens-error' event for server errors (not the built-in error event)
				this.eventSource.addEventListener("lens-error", (event) => {
					try {
						const message = JSON.parse((event as MessageEvent).data) as ServerMessage;
						this.notifyMessage(message);
					} catch {
						// Ignore parse errors
					}
				});
			} catch (error) {
				this.setState("disconnected");
				reject(error);
			}
		});
	}

	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.subscriptions.clear();
		this.setState("disconnected");
	}

	async subscribe(input: SubscribeInput): Promise<unknown> {
		const subscriptionId = `sub_${++this.subscriptionCounter}`;

		// Store subscription
		this.subscriptions.set(subscriptionId, input);

		// Register subscription with server via HTTP
		const response = await fetch(`${this.config.url}/subscribe`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify({
				subscriptionId,
				entity: input.entity,
				id: input.id,
				select: input.select,
			}),
		});

		if (!response.ok) {
			this.subscriptions.delete(subscriptionId);
			const error = (await response.json().catch(() => ({ message: "Subscription failed" }))) as { message?: string };
			throw new Error(error.message || `HTTP ${response.status}`);
		}

		const result = (await response.json()) as { data: unknown };
		return result.data;
	}

	unsubscribe(subscriptionId: string): void {
		this.subscriptions.delete(subscriptionId);

		// Notify server
		fetch(`${this.config.url}/unsubscribe`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify({ subscriptionId }),
		}).catch(() => {
			// Ignore unsubscribe errors
		});
	}

	async query(input: QueryInput): Promise<unknown> {
		const response = await fetch(this.config.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify({
				entity: input.entity,
				operation: input.type,
				input: {
					where: input.where,
					orderBy: input.orderBy,
					take: input.take,
					skip: input.skip,
					select: input.select,
				},
			}),
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
			throw new Error(error.message || `HTTP ${response.status}`);
		}

		const result = (await response.json()) as { data: unknown };
		return result.data;
	}

	async mutate(input: MutateInput): Promise<unknown> {
		const response = await fetch(this.config.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify({
				entity: input.entity,
				operation: input.operation,
				input: input.input,
			}),
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
			throw new Error(error.message || `HTTP ${response.status}`);
		}

		const result = (await response.json()) as { data: unknown };
		return result.data;
	}

	onStateChange(callback: (state: ConnectionState) => void): () => void {
		this.stateListeners.add(callback);
		return () => this.stateListeners.delete(callback);
	}

	onMessage(callback: (message: ServerMessage) => void): () => void {
		this.messageListeners.add(callback);
		return () => this.messageListeners.delete(callback);
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	private setState(state: ConnectionState): void {
		this._state = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}

	private notifyMessage(message: ServerMessage): void {
		for (const listener of this.messageListeners) {
			listener(message);
		}
	}

	private handleDisconnect(): void {
		this.setState("disconnected");

		if (this.config.autoReconnect) {
			this.setState("reconnecting");
			this.reconnectTimer = setTimeout(() => {
				this.connect()
					.then(() => {
						// Re-subscribe to all active subscriptions
						for (const [id, input] of this.subscriptions) {
							this.resubscribe(id, input);
						}
					})
					.catch(() => {
						// Will retry on next disconnect
					});
			}, this.config.reconnectDelay);
		}
	}

	private async resubscribe(subscriptionId: string, input: SubscribeInput): Promise<void> {
		try {
			await fetch(`${this.config.url}/subscribe`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...this.config.headers,
				},
				body: JSON.stringify({
					subscriptionId,
					entity: input.entity,
					id: input.id,
					select: input.select,
				}),
			});
		} catch {
			// Ignore resubscribe errors
		}
	}
}
