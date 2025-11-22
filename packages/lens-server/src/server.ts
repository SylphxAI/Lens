/**
 * Lens Server - Main entry point
 *
 * Creates a Lens server with auto-subscription, compression, and request handling
 */

import type { LensObject, UpdateMode } from "@sylphx/lens-core";
import type { AutoSubscribeConfig } from "./subscription/auto-subscribe.js";

/**
 * Server configuration
 */
export interface LensServerConfig {
	/**
	 * Auto-subscription configuration
	 *
	 * When enabled, Lens automatically:
	 * 1. Creates subscriptions for queries based on channel naming
	 * 2. Publishes updates when mutations execute
	 *
	 * @example
	 * ```ts
	 * autoSubscribe: {
	 *   channelFor: (path, input) => `${path.join(':')}:${input.id}`,
	 *   pubsub: myPubSubAdapter
	 * }
	 * ```
	 */
	autoSubscribe?: AutoSubscribeConfig;

	/**
	 * Default update mode for streaming responses
	 *
	 * - 'value': Send full value (safest, default)
	 * - 'delta': Send text deltas (for LLM streaming)
	 * - 'patch': Send JSON patches (for object updates)
	 * - 'auto': Intelligently select best mode
	 */
	updateMode?: UpdateMode;

	/**
	 * Compression configuration
	 */
	compression?: {
		/**
		 * Enable compression
		 */
		enabled: boolean;

		/**
		 * Compression algorithm
		 */
		algorithm: "brotli" | "gzip";

		/**
		 * Minimum payload size to compress (bytes)
		 */
		threshold: number;
	};
}

/**
 * Lens server instance
 */
export interface LensServer {
	/**
	 * HTTP/Express-compatible handler
	 */
	handler: (req: any, res: any) => Promise<void>;

	/**
	 * WebSocket handler
	 */
	wsHandler: (ws: any) => void;

	/**
	 * Close server and cleanup resources
	 */
	close: () => Promise<void>;
}

/**
 * Create Lens server
 *
 * @example
 * ```ts
 * import { createLensServer } from '@sylphx/lens-server';
 * import { api } from './api';
 *
 * const server = createLensServer(api, {
 *   autoSubscribe: {
 *     channelFor: (path, input) => `${path.join(':')}:${input.id}`,
 *     pubsub: eventStream
 *   },
 *   updateMode: 'auto',
 *   compression: {
 *     enabled: true,
 *     algorithm: 'brotli',
 *     threshold: 1024
 *   }
 * });
 *
 * // Express
 * app.use('/lens', server.handler);
 *
 * // WebSocket
 * wss.on('connection', server.wsHandler);
 * ```
 */
export function createLensServer<T extends LensObject<any>>(
	api: T,
	config?: LensServerConfig
): LensServer {
	// Import handlers dynamically to avoid circular dependencies
	const { createHTTPHandler } = require("./handlers/http.js");
	const { createWebSocketHandler } = require("./handlers/websocket.js");

	// Create handlers
	const handler = createHTTPHandler(api, config);
	const wsHandler = createWebSocketHandler(api, config);

	// Cleanup
	const close = async () => {
		if (config?.autoSubscribe?.pubsub?.close) {
			await config.autoSubscribe.pubsub.close();
		}
	};

	return {
		handler,
		wsHandler,
		close,
	};
}
