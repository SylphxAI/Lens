/**
 * @lens/client
 *
 * Reactive client for Lens API framework.
 * Signals, store, and Links for real-time data access.
 */

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
	type ClientConfig,
	type Transport,
	type QueryResult,
	type MutationResult,
	type SelectionObject,
	type QueriesMap,
	type MutationsMap,
	type InferInput,
	type InferOutput,
	// Middleware types
	type Middleware,
	type MiddlewareFn,
	type OperationContext,
} from "./client/create";

// =============================================================================
// Client Middleware
// =============================================================================

export {
	// Middleware links
	loggerMiddleware,
	retryMiddleware,
	timingMiddleware,
	errorHandlerMiddleware,
	// Types
	type LoggerOptions,
	type RetryOptions,
	type TimingOptions,
	type ErrorHandlerOptions,
} from "./client/middleware";

// =============================================================================
// WebSocket Transport
// =============================================================================

export {
	// Class
	WebSocketTransport,
	// Factory
	createWebSocketTransport,
	websocketTransport,
	// Alias for convenience
	websocketTransport as websocketLink,
	// Types
	type WebSocketTransportOptions,
	type WebSocketState,
	// Alias for convenience
	type WebSocketTransportOptions as WebSocketLinkOptions,
} from "./client/transport";

// =============================================================================
// Client V2 (Alternative: Operations-based with Links)
// =============================================================================

export {
	// Factory
	createClientV2,
	// Types
	type ClientV2,
	type ClientV2Config,
	type QueriesMap as QueriesMapV2,
	type MutationsMap as MutationsMapV2,
	type QueryAccessor,
	type MutationAccessor,
	type QueryAccessors,
	type MutationAccessors,
	type MutationV2Options,
	type MutationV2Result,
	type InferInput as InferInputV2,
	type InferOutput as InferOutputV2,
} from "./client/client-v2";

// =============================================================================
// Links (tRPC-style middleware chain for V2 client)
// =============================================================================

export {
	// Types
	type OperationType,
	type OperationContext as LinkOperationContext,
	type OperationResult,
	type NextLink,
	type LinkFn,
	type Link,
	type TerminalLink,
	type Observable,
	type Observer,
	type Unsubscribable,
	// Utilities
	composeLinks,
	createOperationContext,
	// Middleware links
	loggerLink,
	type LoggerLinkOptions,
	retryLink,
	type RetryLinkOptions,
	cacheLink,
	createCacheStore,
	type CacheLinkOptions,
	splitLink,
	splitByType,
	type SplitLinkOptions,
	queryOptimizerLink,
	type QueryOptimizerOptions,
	compressionLink,
	type CompressionLinkOptions,
	msgpackLink,
	serializeMsgpack,
	deserializeMsgpack,
	compareSizes,
	type MsgpackLinkOptions,
	// Terminal links
	httpLink,
	httpBatchLink,
	type HttpLinkOptions,
	// HTTP V2 (operations protocol)
	httpLinkV2,
	type HttpLinkV2Options,
	sseLink,
	SSESubscriptionTransport,
	createSSETransport,
	type SSELinkOptions,
	type SSEState,
	inProcessLink,
	createInProcessLink,
	type InProcessLinkOptions,
	type InProcessResolvers,
	// In-process V2 (operations protocol)
	inProcessLinkV2,
	createInProcessLinkV2,
	type InProcessLinkV2Options,
	type InProcessServerV2,
	// WebSocket V2 (operations protocol)
	WebSocketTransportV2,
	createWebSocketTransportV2,
	websocketLinkV2,
	type WebSocketLinkV2Options,
	type WebSocketV2State,
} from "./links";
