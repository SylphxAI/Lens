/**
 * Server-Sent Events (SSE) handler for Lens server
 *
 * Handles SSE connections for subscriptions and streaming
 *
 * SSE is ideal for:
 * - One-way server-to-client streaming
 * - Real-time updates with automatic reconnection
 * - Simpler than WebSocket (text-based, HTTP-based)
 */

import type { LensObject, LensRequest } from "@sylphx/lens-core";
import type { LensServerConfig } from "../server.js";
import { executeRequest } from "./execute.js";
import { createAutoSubscription } from "../subscription/auto-subscribe.js";
import {
	ValueStrategy,
	DeltaStrategy,
	PatchStrategy,
	AutoStrategy,
} from "@sylphx/lens-core";
import type { UpdateStrategy } from "@sylphx/lens-core";

export interface SSEMessage {
	id?: string; // Event ID for client reconnection
	event?: string; // Event type
	data: any; // Event data
}

/**
 * Create SSE handler for Express/Node.js
 *
 * @example
 * ```ts
 * app.get('/sse', createSSEHandler(api, config));
 *
 * // Client usage:
 * const eventSource = new EventSource('/sse?request=' + encodeURIComponent(JSON.stringify({
 *   type: 'subscription',
 *   path: ['user', 'get'],
 *   input: { id: '123' },
 *   select: { id: true, name: true }
 * })));
 *
 * eventSource.addEventListener('update', (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log('Update:', data);
 * });
 * ```
 */
export function createSSEHandler<T extends LensObject<any>>(
	api: T,
	config?: LensServerConfig
) {
	return async (req: any, res: any): Promise<void> => {
		try {
			// 1. Parse request from query string
			const request = parseSSERequest(req);

			// 2. Validate subscription type
			if (request.type !== "subscription") {
				throw Object.assign(
					new Error("SSE only supports subscriptions, use HTTP for query/mutation"),
					{
						statusCode: 400,
						code: "INVALID_REQUEST_TYPE",
					}
				);
			}

			// 3. Setup SSE connection
			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				"Connection": "keep-alive",
				// CORS headers (optional, configure as needed)
				"Access-Control-Allow-Origin": "*",
			});

			// 4. Send initial connection confirmation
			sendSSE(res, {
				event: "connected",
				data: { status: "connected" },
			});

			// 5. Handle subscription
			await handleSSESubscription(res, api, request, config);
		} catch (error: any) {
			const errorResponse = {
				error: {
					message: error.message || "Internal server error",
					code: error.code || "INTERNAL_ERROR",
				},
			};

			// Check if SSE connection was already established
			const isSSEMode = res.headersSent;

			if (isSSEMode) {
				// Already in SSE mode, send error as event
				sendSSE(res, {
					event: "error",
					data: errorResponse,
				});
				res.end();
			} else {
				// Not yet in SSE mode, send as JSON
				res.writeHead(error.statusCode || 500, {
					"Content-Type": "application/json",
				});
				res.end(JSON.stringify(errorResponse));
			}
		}
	};
}

/**
 * Handle SSE subscription
 */
async function handleSSESubscription(
	res: any,
	api: any,
	request: LensRequest,
	config: LensServerConfig | undefined
): Promise<void> {
	// Resolve endpoint
	const endpoint = resolvePath(api, request.path);

	if (!endpoint || endpoint.type !== "query") {
		throw Object.assign(new Error("Subscription endpoint must be a query"), {
			code: "INVALID_SUBSCRIPTION",
		});
	}

	// Validate input
	const input = endpoint.input.parse(request.input);

	// Create subscription
	let subscribe: (input: any) => any;

	if (endpoint.subscribe) {
		// Use explicit subscribe function
		subscribe = endpoint.subscribe;
	} else if (config?.autoSubscribe) {
		// Use auto-subscription
		subscribe = createAutoSubscription(endpoint, config.autoSubscribe);
	} else {
		throw Object.assign(new Error("Subscriptions not enabled"), {
			code: "SUBSCRIPTIONS_DISABLED",
		});
	}

	// Get update strategy
	const updateStrategy = getUpdateStrategy(config?.updateMode);

	// Subscribe and stream updates
	let previousValue: any = undefined;
	let eventId = 0;

	const subscription = subscribe(input).subscribe({
		next: (value: any) => {
			// Apply field selection
			const selected = applyFieldSelection(value, request.select);

			// Encode with update strategy
			const payload =
				previousValue !== undefined
					? updateStrategy.encode(previousValue, selected)
					: { mode: "value", data: selected };

			previousValue = selected;

			// Send update
			sendSSE(res, {
				id: String(++eventId),
				event: "update",
				data: payload,
			});
		},
		error: (error: any) => {
			sendSSE(res, {
				id: String(++eventId),
				event: "error",
				data: {
					message: error.message || "Subscription error",
					code: error.code || "SUBSCRIPTION_ERROR",
				},
			});
			res.end();
		},
		complete: () => {
			sendSSE(res, {
				id: String(++eventId),
				event: "complete",
				data: { status: "complete" },
			});
			res.end();
		},
	});

	// Cleanup on client disconnect
	req.on("close", () => {
		subscription.unsubscribe();
	});
}

/**
 * Parse SSE request from query string
 */
function parseSSERequest(req: any): LensRequest {
	const url = new URL(req.url, `http://${req.headers.host}`);
	const requestParam = url.searchParams.get("request");

	if (!requestParam) {
		throw Object.assign(
			new Error("Missing 'request' query parameter"),
			{
				statusCode: 400,
				code: "MISSING_REQUEST_PARAM",
			}
		);
	}

	try {
		const request = JSON.parse(requestParam);
		const { type, path, input, select } = request;

		if (!type || !path) {
			throw new Error("Missing required fields: type, path");
		}

		return {
			type,
			path,
			input,
			select,
		};
	} catch (error: any) {
		throw Object.assign(
			new Error(`Invalid request parameter: ${error.message}`),
			{
				statusCode: 400,
				code: "INVALID_REQUEST_PARAM",
			}
		);
	}
}

/**
 * Send SSE message
 *
 * Format:
 * ```
 * id: 1
 * event: update
 * data: {"type":"update","payload":{...}}
 *
 * ```
 */
function sendSSE(res: any, message: SSEMessage): void {
	let event = "";

	if (message.id) {
		event += `id: ${message.id}\n`;
	}

	if (message.event) {
		event += `event: ${message.event}\n`;
	}

	event += `data: ${JSON.stringify(message.data)}\n\n`;

	res.write(event);
}

/**
 * Get update strategy from mode
 */
function getUpdateStrategy(mode?: string): UpdateStrategy {
	switch (mode) {
		case "value":
			return new ValueStrategy();
		case "delta":
			return new DeltaStrategy();
		case "patch":
			return new PatchStrategy();
		case "auto":
		default:
			return new AutoStrategy();
	}
}

/**
 * Resolve endpoint from path
 */
function resolvePath(api: any, path: string[]): any {
	let current = api;

	for (const segment of path) {
		if (!current || typeof current !== "object") {
			return null;
		}
		current = current[segment];
	}

	if (
		current &&
		typeof current === "object" &&
		(current.type === "query" || current.type === "mutation")
	) {
		return current;
	}

	return null;
}

/**
 * Apply field selection
 */
function applyFieldSelection(data: any, select?: any): any {
	if (!select) return data;

	if (Array.isArray(select)) {
		// Array syntax: ['id', 'name']
		const result: any = {};
		for (const key of select) {
			if (key in data) {
				result[key] = data[key];
			}
		}
		return result;
	}

	if (typeof select === "object") {
		// Object syntax: { id: true, user: { name: true } }
		const result: any = {};
		for (const key in select) {
			if (!(key in data)) continue;

			const value = select[key];
			if (value === true) {
				result[key] = data[key];
			} else if (typeof value === "object") {
				// Nested selection
				result[key] = applyFieldSelection(data[key], value);
			}
		}
		return result;
	}

	return data;
}
