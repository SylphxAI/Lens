/**
 * @lens/client - WebSocket Transport
 *
 * WebSocket-based transport for real-time communication.
 */

import type {
	Transport,
	TransportConfig,
	ConnectionState,
	ServerMessage,
	SubscribeInput,
	QueryInput,
	MutateInput,
	ClientMessage,
} from "./types";

// =============================================================================
// WebSocket Transport
// =============================================================================

/**
 * WebSocket transport implementation
 */
export class WebSocketTransport implements Transport {
	private ws: WebSocket | null = null;
	private _state: ConnectionState = "disconnected";
	private messageId = 0;
	private pendingRequests = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
		}
	>();
	private subscriptions = new Map<string, string>(); // subscriptionId -> entity:id
	private stateListeners = new Set<(state: ConnectionState) => void>();
	private messageListeners = new Set<(message: ServerMessage) => void>();
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	private config: Required<TransportConfig>;

	constructor(config: TransportConfig) {
		this.config = {
			url: config.url,
			httpUrl: config.httpUrl ?? config.url.replace(/^ws/, "http"),
			autoReconnect: config.autoReconnect ?? true,
			maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
			reconnectDelay: config.reconnectDelay ?? 1000,
		};
	}

	get state(): ConnectionState {
		return this._state;
	}

	private setState(state: ConnectionState): void {
		this._state = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}

	async connect(): Promise<void> {
		if (this._state === "connected") return;
		if (this._state === "connecting") {
			// Wait for existing connection
			return new Promise((resolve, reject) => {
				const checkState = () => {
					if (this._state === "connected") {
						resolve();
					} else if (this._state === "disconnected") {
						reject(new Error("Connection failed"));
					} else {
						setTimeout(checkState, 100);
					}
				};
				checkState();
			});
		}

		this.setState("connecting");

		return new Promise((resolve, reject) => {
			try {
				this.ws = new WebSocket(this.config.url);

				this.ws.onopen = () => {
					this.setState("connected");
					this.reconnectAttempts = 0;
					resolve();
				};

				this.ws.onclose = () => {
					this.handleDisconnect();
				};

				this.ws.onerror = (event) => {
					if (this._state === "connecting") {
						reject(new Error("WebSocket connection failed"));
					}
				};

				this.ws.onmessage = (event) => {
					this.handleMessage(event.data);
				};
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

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.setState("disconnected");
		this.subscriptions.clear();

		// Reject all pending requests
		for (const [, { reject }] of this.pendingRequests) {
			reject(new Error("Connection closed"));
		}
		this.pendingRequests.clear();
	}

	private handleDisconnect(): void {
		this.ws = null;

		if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
			this.setState("reconnecting");
			this.reconnectAttempts++;

			const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
			this.reconnectTimer = setTimeout(() => {
				this.connect().catch(() => {
					// Reconnect failed, will retry
				});
			}, delay);
		} else {
			this.setState("disconnected");

			// Reject all pending requests
			for (const [, { reject }] of this.pendingRequests) {
				reject(new Error("Connection lost"));
			}
			this.pendingRequests.clear();
		}
	}

	private handleMessage(data: string): void {
		try {
			const message = JSON.parse(data) as ServerMessage;

			// Notify listeners
			for (const listener of this.messageListeners) {
				listener(message);
			}

			// Handle by type
			switch (message.type) {
				case "data":
				case "update": {
					const request = this.pendingRequests.get(message.subscriptionId);
					if (request && message.type === "data") {
						request.resolve(message.data);
						this.pendingRequests.delete(message.subscriptionId);
					}
					break;
				}

				case "result": {
					const request = this.pendingRequests.get(message.mutationId);
					if (request) {
						request.resolve(message.data);
						this.pendingRequests.delete(message.mutationId);
					}
					break;
				}

				case "error": {
					const request = this.pendingRequests.get(message.id);
					if (request) {
						request.reject(new Error(message.error.message));
						this.pendingRequests.delete(message.id);
					}
					break;
				}
			}
		} catch (error) {
			console.error("Failed to parse message:", error);
		}
	}

	private send(message: ClientMessage): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket not connected");
		}
		this.ws.send(JSON.stringify(message));
	}

	private nextId(): string {
		return `msg_${++this.messageId}`;
	}

	async subscribe(input: SubscribeInput): Promise<unknown> {
		await this.ensureConnected();

		const id = this.nextId();
		const subscriptionKey = `${input.entity}:${input.id}`;

		// Check if already subscribed
		for (const [subId, key] of this.subscriptions) {
			if (key === subscriptionKey) {
				// Already subscribed, return cached or wait
				return new Promise((resolve, reject) => {
					this.pendingRequests.set(subId, { resolve, reject });
				});
			}
		}

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.subscriptions.set(id, subscriptionKey);

			this.send({
				type: "subscribe",
				id,
				entity: input.entity,
				entityId: input.id,
				select: input.select,
			});
		});
	}

	unsubscribe(subscriptionId: string): void {
		if (this.subscriptions.has(subscriptionId)) {
			this.subscriptions.delete(subscriptionId);

			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				this.send({
					type: "unsubscribe",
					id: subscriptionId,
				});
			}
		}
	}

	async query(input: QueryInput): Promise<unknown> {
		await this.ensureConnected();

		const id = this.nextId();

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });

			this.send({
				type: "query",
				id,
				entity: input.entity,
				queryType: input.type,
				input: {
					where: input.where,
					orderBy: input.orderBy,
					take: input.take,
					skip: input.skip,
					select: input.select,
				},
			});
		});
	}

	async mutate(input: MutateInput): Promise<unknown> {
		await this.ensureConnected();

		const id = this.nextId();

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });

			this.send({
				type: "mutate",
				id,
				entity: input.entity,
				operation: input.operation,
				input: input.input,
			});
		});
	}

	private async ensureConnected(): Promise<void> {
		if (this._state === "connected") return;
		if (this._state === "connecting" || this._state === "reconnecting") {
			// Wait for connection
			return new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error("Connection timeout"));
				}, 10000);

				const checkState = () => {
					if (this._state === "connected") {
						clearTimeout(timeout);
						resolve();
					} else if (this._state === "disconnected") {
						clearTimeout(timeout);
						reject(new Error("Connection failed"));
					} else {
						setTimeout(checkState, 100);
					}
				};
				checkState();
			});
		}

		await this.connect();
	}

	onStateChange(callback: (state: ConnectionState) => void): () => void {
		this.stateListeners.add(callback);
		return () => {
			this.stateListeners.delete(callback);
		};
	}

	onMessage(callback: (message: ServerMessage) => void): () => void {
		this.messageListeners.add(callback);
		return () => {
			this.messageListeners.delete(callback);
		};
	}
}
