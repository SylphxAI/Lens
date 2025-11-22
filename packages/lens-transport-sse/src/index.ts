/**
 * SSE (Server-Sent Events) Transport for Lens
 *
 * Server → Client streaming for subscriptions.
 * Falls back to HTTP for queries/mutations.
 */

import type { LensRequest, LensTransport } from "@sylphx/lens-core";

export interface SSETransportConfig {
	/** Base URL for HTTP requests (queries/mutations) */
	url: string;
	/** SSE endpoint URL (subscriptions) */
	sseUrl?: string;
	/** Custom headers to include in requests */
	headers?: Record<string, string>;
	/** Custom fetch implementation (defaults to global fetch) */
	fetch?: typeof fetch;
	/** Request timeout in milliseconds */
	timeout?: number;
	/** Custom EventSource implementation (defaults to global EventSource) */
	EventSource?: new (url: string) => EventSource;
}

/**
 * SSE Transport
 *
 * - Queries/Mutations: HTTP POST to `url`
 * - Subscriptions: EventSource connection to `sseUrl`
 *
 * @example
 * ```ts
 * const transport = new SSETransport({
 *   url: 'http://localhost:3000/lens',
 *   sseUrl: 'http://localhost:3000/lens/subscribe'
 * });
 * ```
 */
export class SSETransport implements LensTransport {
	private readonly config: Required<SSETransportConfig>;
	private activeSubscriptions = new Map<
		string,
		{ source: EventSource; subscriptionId: string }
	>();

	constructor(config: SSETransportConfig) {
		this.config = {
			url: config.url,
			sseUrl: config.sseUrl || `${config.url}/subscribe`,
			headers: config.headers || {},
			fetch: config.fetch || globalThis.fetch,
			timeout: config.timeout || 30000,
			EventSource: config.EventSource || globalThis.EventSource,
		};
	}

	async query<T>(request: LensRequest): Promise<T> {
		return this.executeRequest(request);
	}

	async mutate<T>(request: LensRequest): Promise<T> {
		return this.executeRequest(request);
	}

	subscribe<T>(request: LensRequest): any {
		const subscriptionId = Math.random().toString(36).substring(2);

		return {
			subscribe: (observer: {
				next: (value: T) => void;
				error?: (error: Error) => void;
				complete?: () => void;
			}) => {
				// Encode request as query params for SSE
				const params = new URLSearchParams({
					data: JSON.stringify(request),
					id: subscriptionId,
				});

				const eventSource = new this.config.EventSource(
					`${this.config.sseUrl}?${params}`
				);

				this.activeSubscriptions.set(subscriptionId, {
					source: eventSource,
					subscriptionId,
				});

				eventSource.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);

						if (data.type === "update") {
							observer.next(data.payload as T);
						} else if (data.type === "complete") {
							observer.complete?.();
							eventSource.close();
							this.activeSubscriptions.delete(subscriptionId);
						} else if (data.type === "error") {
							observer.error?.(new Error(data.payload.message || "SSE error"));
							eventSource.close();
							this.activeSubscriptions.delete(subscriptionId);
						}
					} catch (err) {
						observer.error?.(
							err instanceof Error ? err : new Error(String(err)),
						);
					}
				};

				eventSource.onerror = () => {
					observer.error?.(new Error("SSE connection error"));
					eventSource.close();
					this.activeSubscriptions.delete(subscriptionId);
				};

				return {
					unsubscribe: () => {
						eventSource.close();
						this.activeSubscriptions.delete(subscriptionId);
					},
				};
			},
		};
	}

	private async executeRequest<T>(request: LensRequest): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

		try {
			const response = await this.config.fetch(this.config.url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...this.config.headers,
				},
				body: JSON.stringify(request),
				signal: controller.signal,
			});

			if (!response.ok) {
				const error: any = await response.json().catch(() => ({
					error: { message: response.statusText },
				}));
				throw new Error(error.error?.message || "Request failed");
			}

			return (await response.json()) as T;
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error(`Request timeout after ${this.config.timeout}ms`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	close() {
		// Close all active SSE connections
		for (const { source } of this.activeSubscriptions.values()) {
			source.close();
		}
		this.activeSubscriptions.clear();
	}
}
