/**
 * @sylphx/lens-client - Transport System
 *
 * Pluggable transport layer for client-server communication.
 */

// =============================================================================
// Types
// =============================================================================

export type {
	// Multi-entity DSL types (re-exported from core)
	EntityOperation,
	Metadata,
	MultiEntityDSL,
	// Observable types
	Observable,
	Observer,
	Operation,
	OperationMeta,
	OperationsMap,
	OptimisticDSL,
	OptimisticUpdateManyConfig,
	RefInput,
	RefNow,
	RefSibling,
	RefTemp,
	Result,
	// Core types
	Transport,
	Unsubscribable,
	ValueRef,
} from "./types";

// Type guard functions (re-exported from core)
export {
	isEntityOperation,
	isMultiEntityDSL,
	isOptimisticDSL,
	isValueRef,
	normalizeOptimisticDSL,
} from "./types";

// =============================================================================
// Plugins
// =============================================================================

export {
	type AuthPluginOptions,
	auth,
	type CachePluginOptions,
	cache,
	type LoggerPluginOptions,
	// Built-in plugins
	logger,
	// Plugin interface
	type Plugin,
	type RetryPluginOptions,
	retry,
	type TimeoutPluginOptions,
	timeout,
} from "./plugin";

// =============================================================================
// Transports
// =============================================================================

// HTTP
export { type HttpServerTransportOptions, type HttpTransportOptions, http } from "./http";
// In-Process
export { type InProcessTransportOptions, inProcess, type LensServerInterface } from "./in-process";
// Route
export {
	type RouteByTypeConfig,
	type RouteConfig,
	route,
	// Legacy
	routeByPath,
	routeByType,
} from "./route";
// WebSocket
export { type WsTransportOptions, ws } from "./ws";
