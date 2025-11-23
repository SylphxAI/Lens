/**
 * WebSocket handler for Lens server
 *
 * Handles WebSocket connections for subscriptions and streaming
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

export interface WebSocketMessage {
	id: string; // Request ID for correlation
	type: "request" | "response" | "error" | "update" | "complete";
	payload?: any;
}

/**
 * Create WebSocket handler
 */
export function createWebSocketHandler<T extends LensObject<any>>(
	api: T,
	config?: LensServerConfig
) {
	return (ws: any): void => {
		// Track active subscriptions for this connection
		const subscriptions = new Map<string, any>();

		// Get update strategy
		const updateStrategy = getUpdateStrategy(config?.updateMode);

		// Handle incoming messages
		ws.on("message", async (data: any) => {
			let message: WebSocketMessage;

			try {
				message = JSON.parse(data.toString());
			} catch (error) {
				sendError(ws, "", "Invalid JSON");
				return;
			}

			const { id, type, payload } = message;

			try {
				if (type === "request") {
					const request = payload as LensRequest;

					// Handle subscription
					if (request.type === "subscription") {
						await handleSubscription(
							ws,
							id,
							api,
							request,
							config,
							subscriptions,
							updateStrategy
						);
					}
					// Handle query/mutation
					else {
						const result = await executeRequest(api, request, config);
						sendResponse(ws, id, result);
					}
				} else if (type === "unsubscribe") {
					// Unsubscribe
					const sub = subscriptions.get(id);
					if (sub) {
						sub.unsubscribe();
						subscriptions.delete(id);
					}
				}
			} catch (error: any) {
				sendError(ws, id, error.message || "Internal error", error.code);
			}
		});

		// Cleanup on close
		ws.on("close", () => {
			for (const [_, sub] of subscriptions) {
				sub.unsubscribe();
			}
			subscriptions.clear();
		});
	};
}

/**
 * Handle subscription request
 */
async function handleSubscription(
	ws: any,
	requestId: string,
	api: any,
	request: LensRequest,
	config: LensServerConfig | undefined,
	subscriptions: Map<string, any>,
	updateStrategy: UpdateStrategy
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

	// Subscribe and track
	let previousValue: any = undefined;

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
			send(ws, {
				id: requestId,
				type: "update",
				payload,
			});
		},
		error: (error: any) => {
			sendError(ws, requestId, error.message || "Subscription error");
			subscriptions.delete(requestId);
		},
		complete: () => {
			send(ws, {
				id: requestId,
				type: "complete",
			});
			subscriptions.delete(requestId);
		},
	});

	subscriptions.set(requestId, subscription);
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

/**
 * Send message to client
 */
function send(ws: any, message: WebSocketMessage): void {
	ws.send(JSON.stringify(message));
}

/**
 * Send response to client
 */
function sendResponse(ws: any, id: string, payload: any): void {
	send(ws, {
		id,
		type: "response",
		payload,
	});
}

/**
 * Send error to client
 */
function sendError(ws: any, id: string, message: string, code?: string): void {
	send(ws, {
		id,
		type: "error",
		payload: {
			message,
			code: code || "INTERNAL_ERROR",
		},
	});
}
