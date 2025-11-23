/**
 * WebSocket Transport for Lens
 *
 * Real-time transport for subscriptions, queries, and mutations.
 * Supports auto-reconnection and message correlation.
 */

import type { LensRequest, LensTransport } from "@sylphx/lens-core";

export interface WebSocketTransportConfig {
	/** WebSocket URL */
	url: string;
	/** Custom WebSocket implementation (defaults to global WebSocket) */
	WebSocket?: typeof WebSocket;
	/** Auto-reconnect on disconnect */
	autoReconnect?: boolean;
	/** Reconnect delay in milliseconds */
	reconnectDelay?: number;
	/** Maximum reconnect attempts (0 = infinite) */
	maxReconnectAttempts?: number;
	/** Custom headers (Node.js only) */
	headers?: Record<string, string>;
}

interface WebSocketMessage {
	id: string;
	type: "request" | "response" | "error" | "update" | "complete";
	payload: any;
}

interface PendingRequest {
	resolve: (value: any) => void;
	reject: (error: Error) => void;
	type: "query" | "mutation" | "subscription";
	observer?: {
		next: (value: any) => void;
		error?: (error: Error) => void;
		complete?: () => void;
	};
}

/**
 * WebSocket Transport with auto-reconnection
 *
 * @example
 * ```ts
 * const transport = new WebSocketTransport({
 *   url: 'ws://localhost:3000/lens',
 *   autoReconnect: true
 * });
 * ```
 */
export class WebSocketTransport implements LensTransport {
	private readonly config: Required<WebSocketTransportConfig>;
	private ws: WebSocket | null = null;
	private pending = new Map<string, PendingRequest>();
	private reconnectAttempts = 0;
	private reconnectTimer: Timer | null = null;
	private messageId = 0;

	constructor(config: WebSocketTransportConfig) {
		this.config = {
			url: config.url,
			WebSocket: config.WebSocket || globalThis.WebSocket,
			autoReconnect: config.autoReconnect ?? true,
			reconnectDelay: config.reconnectDelay || 1000,
			maxReconnectAttempts: config.maxReconnectAttempts || 0,
			headers: config.headers || {},
		};

		this.connect();
	}

	private connect() {
		if (this.ws?.readyState === WebSocket.OPEN) {
			return;
		}

		this.ws = new this.config.WebSocket(this.config.url);

		this.ws.onopen = () => {
			this.reconnectAttempts = 0;
			// Resubscribe to active subscriptions
			for (const [id, request] of this.pending) {
				if (request.type === "subscription") {
					// Resend subscription request
					const originalRequest = (this.ws as any).__requests?.get(id);
					if (originalRequest) {
						this.ws?.send(
							JSON.stringify({
								id,
								type: "request",
								payload: originalRequest,
							}),
						);
					}
				}
			}
		};

		this.ws.onmessage = (event) => {
			const message: WebSocketMessage = JSON.parse(event.data as string);
			const pending = this.pending.get(message.id);

			if (!pending) return;

			switch (message.type) {
				case "response":
					pending.resolve(message.payload);
					this.pending.delete(message.id);
					break;

				case "error":
					pending.reject(
						new Error(message.payload.message || "Request failed"),
					);
					this.pending.delete(message.id);
					break;

				case "update":
					if (pending.observer?.next) {
						pending.observer.next(message.payload);
					}
					break;

				case "complete":
					if (pending.observer?.complete) {
						pending.observer.complete();
					}
					this.pending.delete(message.id);
					break;
			}
		};

		this.ws.onclose = () => {
			if (this.config.autoReconnect) {
				this.scheduleReconnect();
			}
		};

		this.ws.onerror = (error) => {
			console.error("WebSocket error:", error);
		};
	}

	private scheduleReconnect() {
		if (
			this.config.maxReconnectAttempts > 0 &&
			this.reconnectAttempts >= this.config.maxReconnectAttempts
		) {
			console.error("Max reconnect attempts reached");
			return;
		}

		this.reconnectAttempts++;
		const delay = this.config.reconnectDelay * this.reconnectAttempts;

		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}

	query<T>(request: LensRequest): Promise<T> {
		return this.executeRequest(request, "query");
	}

	mutate<T>(request: LensRequest): Promise<T> {
		return this.executeRequest(request, "mutation");
	}

	subscribe<T>(request: LensRequest): any {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket not connected");
		}

		const id = String(++this.messageId);

		return {
			subscribe: (observer: {
				next: (value: any) => void;
				error?: (error: Error) => void;
				complete?: () => void;
			}) => {
				this.pending.set(id, {
					resolve: () => {},
					reject: () => {},
					type: "subscription",
					observer,
				});

				// Store original request for reconnection
				if (!this.ws) return;
				(this.ws as any).__requests = (this.ws as any).__requests || new Map();
				(this.ws as any).__requests.set(id, request);

				this.ws?.send(
					JSON.stringify({
						id,
						type: "request",
						payload: request,
					}),
				);

				return {
					unsubscribe: () => {
						this.pending.delete(id);
						this.ws?.send(
							JSON.stringify({
								id,
								type: "unsubscribe",
							}),
						);
					},
				};
			},
		};
	}

	private executeRequest<T>(
		request: LensRequest,
		type: "query" | "mutation",
	): Promise<T> {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error("WebSocket not connected"));
		}

		const id = String(++this.messageId);

		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, {
				resolve,
				reject,
				type,
			});

			this.ws?.send(
				JSON.stringify({
					id,
					type: "request",
					payload: request,
				}),
			);
		});
	}

	close() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}

		for (const [id, pending] of this.pending) {
			pending.reject(new Error("Connection closed"));
		}

		this.pending.clear();
		this.ws?.close();
		this.ws = null;
	}
}
