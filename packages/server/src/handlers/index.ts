/**
 * @sylphx/lens-server - Handlers
 *
 * Protocol handlers for bridging the Lens app to various transports.
 */

// =============================================================================
// Unified Handler (HTTP + SSE)
// =============================================================================

export { createHandler, type Handler, type HandlerOptions } from "./unified.js";

// =============================================================================
// Framework Handler Utilities
// =============================================================================

export {
	createFrameworkHandler,
	createServerClientProxy,
	type FrameworkHandlerOptions,
	handleWebMutation,
	handleWebQuery,
	handleWebSSE,
} from "./framework.js";

// =============================================================================
// SSE Handler
// =============================================================================

export {
	createSSEHandler,
	type SSEClientInfo,
	SSEHandler,
	type SSEHandlerConfig as SSEHandlerOptions,
} from "../sse/handler.js";

// =============================================================================
// HTTP Handler
// =============================================================================

export {
	createHTTPHandler,
	type HTTPHandler,
	type HTTPHandlerOptions,
} from "./http.js";

// =============================================================================
// WebSocket Handler
// =============================================================================

export {
	createWSHandler,
	type WSHandler,
	type WSHandlerOptions,
} from "./ws.js";

// =============================================================================
// Deprecated Aliases (will be removed in next major version)
// =============================================================================

/** @deprecated Use `SSEHandlerOptions` instead */
export type { SSEHandlerConfig as SSEAdapterOptions } from "../sse/handler.js";
/** @deprecated Use `createSSEHandler` instead */
export { createSSEHandler as createSSEAdapter } from "../sse/handler.js";
/** @deprecated Use `HTTPHandler` instead */
/** @deprecated Use `HTTPHandlerOptions` instead */
export type { HTTPAdapter, HTTPAdapterOptions } from "./http.js";
/** @deprecated Use `createHTTPHandler` instead */
export { createHTTPAdapter } from "./http.js";
/** @deprecated Use `WSHandler` instead */
/** @deprecated Use `WSHandlerOptions` instead */
export type { WSAdapter, WSAdapterOptions } from "./ws.js";
/** @deprecated Use `createWSHandler` instead */
export { createWSAdapter } from "./ws.js";
