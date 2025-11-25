/**
 * @sylphx/lens-client
 *
 * Reactive client for Lens API framework.
 * Transport system, plugins, signals, and store for real-time data access.
 */

// =============================================================================
// Transport System
// =============================================================================

export {
	// Core types
	type Transport,
	type Operation,
	type Result,
	type Metadata,
	type OperationMeta,
	type OptimisticDSL,
	// Observable types
	type Observable,
	type Observer,
	type Unsubscribable,
	// Route types
	type RouteCondition,
	type RouteEntry,
	// Plugins
	type Plugin,
	logger,
	type LoggerPluginOptions,
	auth,
	type AuthPluginOptions,
	retry,
	type RetryPluginOptions,
	cache,
	type CachePluginOptions,
	timeout,
	type TimeoutPluginOptions,
	// Transports
	http,
	type HttpTransportOptions,
	type HttpServerTransportOptions,
	ws,
	type WsTransportOptions,
	type WsServerTransportOptions,
	inProcess,
	type InProcessTransportOptions,
	type LensServerInterface,
	// Route transports
	route,
	routeByType,
	type RouteByTypeConfig,
	routeByPath,
	type RouteByPathConfig,
} from "./transport";

// =============================================================================
// Signals (powered by @preact/signals-core)
// =============================================================================

export {
	// Types
	type Signal,
	type WritableSignal,
	type Subscriber,
	type Unsubscribe,
	// Factory functions
	signal,
	computed,
	effect,
	batch,
	// Utilities
	isSignal,
	toPromise,
	derive,
} from "./signals/signal";

// =============================================================================
// Reactive Store
// =============================================================================

export {
	// Class
	ReactiveStore,
	// Factory
	createStore,
	// Types
	type EntityKey,
	type EntityState,
	type OptimisticEntry as StoreOptimisticEntry,
	type StoreConfig,
} from "./store/reactive-store";

// =============================================================================
// Client (Primary API)
// =============================================================================

export {
	// Factory (recommended)
	createClient,
	// Types
	type LensClient,
	type LensClientConfig,
	type LensClientConfig as ClientConfig, // Alias for compatibility
	type QueryResult,
	type MutationResult,
	type SelectionObject,
	type QueriesMap,
	type MutationsMap,
	type InferInput,
	type InferOutput,
	type OperationContext,
} from "./client/create";
