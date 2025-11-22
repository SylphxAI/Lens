/**
 * HTTP Transport for Lens
 *
 * Fetch-based transport for queries and mutations.
 * Use WebSocket transport for subscriptions.
 */

import type {
	LensRequest,
	LensTransport,
} from "@sylphx/lens-core";

export interface HTTPTransportConfig {
	/** Base URL for the API endpoint */
	url: string;
	/** Custom headers to include in requests */
	headers?: Record<string, string>;
	/** Custom fetch implementation (defaults to global fetch) */
	fetch?: typeof fetch;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * HTTP Transport using fetch API
 *
 * @example
 * ```ts
 * const transport = new HTTPTransport({
 *   url: 'http://localhost:3000/lens',
 *   headers: {
 *     'Authorization': 'Bearer token'
 *   }
 * });
 * ```
 */
export class HTTPTransport implements LensTransport {
	private readonly config: Required<HTTPTransportConfig>;

	constructor(config: HTTPTransportConfig) {
		this.config = {
			url: config.url,
			headers: config.headers || {},
			fetch: config.fetch || globalThis.fetch,
			timeout: config.timeout || 30000,
		};
	}

	async query<T>(request: LensRequest): Promise<T> {
		return this.executeRequest(request);
	}

	async mutate<T>(request: LensRequest): Promise<T> {
		return this.executeRequest(request);
	}

	subscribe<T>(_request: LensRequest): never {
		throw new Error(
			"HTTP transport does not support subscriptions. Use WebSocket transport.",
		);
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
		// HTTP is stateless, nothing to close
	}
}
