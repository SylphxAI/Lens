/**
 * @sylphx/lens-server - Unified Handler
 *
 * Creates a combined HTTP + SSE handler from a Lens app.
 * Routes SSE requests automatically.
 */

import type { LensServer } from "../server/create.js";
import { SSEHandler } from "../sse/handler.js";
import { createGraphStateManager, type GraphStateManager } from "../state/index.js";
import { createHTTPHandler, type HTTPHandlerOptions } from "./http.js";

// =============================================================================
// Types
// =============================================================================

export interface HandlerOptions extends HTTPHandlerOptions {
	/**
	 * SSE endpoint path.
	 * Default: "/__lens/sse"
	 */
	ssePath?: string;

	/**
	 * GraphStateManager for subscriptions.
	 * If not provided, a new one is created.
	 */
	stateManager?: GraphStateManager;

	/**
	 * Heartbeat interval for SSE connections in ms.
	 * Default: 30000
	 */
	heartbeatInterval?: number;
}

export interface Handler {
	/**
	 * Handle HTTP/SSE request.
	 * Compatible with fetch API (Bun, Cloudflare Workers, Vercel).
	 */
	(request: Request): Promise<Response>;

	/**
	 * Alternative method-style call.
	 */
	handle(request: Request): Promise<Response>;

	/**
	 * Access the GraphStateManager for manual subscriptions.
	 */
	stateManager: GraphStateManager;
}

// =============================================================================
// Unified Handler Factory
// =============================================================================

/**
 * Create a unified HTTP + SSE handler from a Lens app.
 *
 * Automatically routes:
 * - GET {ssePath} → SSE connection
 * - Other requests → HTTP handler
 *
 * @example
 * ```typescript
 * import { createApp, createHandler } from '@sylphx/lens-server'
 *
 * const app = createApp({ router })
 * const handler = createHandler(app)
 *
 * // Bun
 * Bun.serve({ port: 3000, fetch: handler })
 *
 * // SSE endpoint: GET /__lens/sse
 * // HTTP endpoints: POST /, GET /__lens/metadata
 * ```
 */
export function createHandler(server: LensServer, options: HandlerOptions = {}): Handler {
	const {
		ssePath = "/__lens/sse",
		stateManager = createGraphStateManager(),
		heartbeatInterval,
		...httpOptions
	} = options;

	const pathPrefix = httpOptions.pathPrefix ?? "";
	const fullSsePath = `${pathPrefix}${ssePath}`;

	// Create HTTP handler
	const httpHandler = createHTTPHandler(server, httpOptions);

	// Create SSE handler
	const sseHandler = new SSEHandler({
		stateManager,
		...(heartbeatInterval !== undefined && { heartbeatInterval }),
	});

	const handler = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);

		// Route SSE requests
		if (request.method === "GET" && url.pathname === fullSsePath) {
			return sseHandler.handleConnection(request);
		}

		// All other requests go to HTTP handler
		return httpHandler(request);
	};

	// Make it callable as both function and object
	const result = handler as Handler;
	result.handle = handler;
	result.stateManager = stateManager;

	return result;
}
