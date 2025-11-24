/**
 * @lens/client - HTTP Link V2
 *
 * HTTP transport for operations-based API (V2 protocol).
 * Supports query/mutation via POST requests.
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [httpLinkV2({ url: 'http://localhost:3000/api' })],
 * });
 * ```
 */

import type { Link, LinkFn, OperationContext, OperationResult } from "./types";

// =============================================================================
// Types
// =============================================================================

/** HTTP link V2 options */
export interface HttpLinkV2Options {
	/** API URL */
	url: string;
	/** Custom headers */
	headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
	/** Request timeout in ms (default: 30000) */
	timeout?: number;
	/** Custom fetch implementation */
	fetch?: typeof fetch;
}

// =============================================================================
// HTTP Link V2
// =============================================================================

/**
 * Create HTTP link for V2 operations protocol
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [
 *     loggerLink(),
 *     httpLinkV2({ url: 'http://localhost:3000/api' }),
 *   ],
 * });
 * ```
 */
export function httpLinkV2(options: HttpLinkV2Options): Link {
	const { url, headers, timeout = 30000, fetch: customFetch = fetch } = options;

	return (): LinkFn => {
		return async (op: OperationContext): Promise<OperationResult> => {
			try {
				// Build headers
				let requestHeaders: Record<string, string> = {
					"Content-Type": "application/json",
				};

				if (headers) {
					const customHeaders = typeof headers === "function" ? await headers() : headers;
					requestHeaders = { ...requestHeaders, ...customHeaders };
				}

				// Build request body
				const body = JSON.stringify({
					type: op.type,
					name: op.op,
					input: op.input,
				});

				// Create abort controller for timeout
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeout);

				try {
					const response = await customFetch(url, {
						method: "POST",
						headers: requestHeaders,
						body,
						signal: controller.signal,
					});

					clearTimeout(timeoutId);

					if (!response.ok) {
						const errorBody = await response.text();
						try {
							const errorJson = JSON.parse(errorBody);
							return {
								error: new Error(errorJson.error?.message ?? `HTTP ${response.status}`),
							};
						} catch {
							return {
								error: new Error(`HTTP ${response.status}: ${errorBody}`),
							};
						}
					}

					const result = await response.json();

					if (result.error) {
						return {
							error: new Error(result.error.message ?? "Unknown error"),
						};
					}

					return { data: result.data };
				} catch (err) {
					clearTimeout(timeoutId);

					if (err instanceof Error && err.name === "AbortError") {
						return { error: new Error("Request timeout") };
					}

					throw err;
				}
			} catch (err) {
				return {
					error: err instanceof Error ? err : new Error(String(err)),
				};
			}
		};
	};
}
