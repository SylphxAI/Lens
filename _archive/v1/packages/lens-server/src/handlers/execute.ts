/**
 * Request execution logic
 *
 * Shared between HTTP and WebSocket handlers
 */

import type { LensObject, LensRequest } from "@sylphx/lens-core";
import type { LensServerConfig } from "../server.js";
import { applyFieldSelection } from "../utils/field-selection.js";
import { autoPublishMutation } from "../subscription/auto-subscribe.js";

/**
 * Execute a Lens request
 *
 * 1. Resolve query/mutation from path
 * 2. Validate input
 * 3. Execute resolver
 * 4. Validate output
 * 5. Apply field selection
 * 6. Auto-publish if mutation
 */
export async function executeRequest<T>(
	api: LensObject<any>,
	request: LensRequest,
	config?: LensServerConfig
): Promise<T> {
	// 1. Resolve endpoint from path
	const endpoint = resolvePath(api, request.path);

	if (!endpoint) {
		throw Object.assign(
			new Error(`Endpoint not found: ${request.path.join(".")}`),
			{
				statusCode: 404,
				code: "NOT_FOUND",
			}
		);
	}

	if (endpoint.type !== request.type) {
		throw Object.assign(
			new Error(
				`Type mismatch: expected ${endpoint.type}, got ${request.type}`
			),
			{
				statusCode: 400,
				code: "TYPE_MISMATCH",
			}
		);
	}

	// 2. Validate input
	const input = endpoint.input.parse(request.input);

	// 3. Execute resolver
	const result = await endpoint.resolve(input);

	// 4. Validate output
	const validated = endpoint.output.parse(result);

	// 5. Apply field selection
	const selected = applyFieldSelection(validated, request.select);

	// 6. Auto-publish if mutation
	if (endpoint.type === "mutation" && config?.autoSubscribe) {
		await autoPublishMutation(
			request.path,
			input,
			selected,
			config.autoSubscribe
		);
	}

	return selected as T;
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

	// Check if it's a valid endpoint
	if (
		current &&
		typeof current === "object" &&
		(current.type === "query" || current.type === "mutation")
	) {
		return current;
	}

	return null;
}
