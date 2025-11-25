/**
 * @lens/server
 *
 * Server runtime for Lens API framework.
 * Resolvers, execution engine, GraphStateManager, and transport adapters.
 */

// =============================================================================
// Resolvers
// =============================================================================

export {
	// Factory
	createResolvers,
	// Error
	ResolverValidationError,
} from "./resolvers/create";

export {
	// Types
	type BaseContext,
	type EmitContext,
	type ResolverContext,
	type EntityResolver,
	type BatchResolver,
	type RelationResolver,
	type ListResolver,
	type PaginatedListResolver,
	type ListInput,
	type PaginatedResult,
	type PageInfo,
	type CreateResolver,
	type UpdateResolver,
	type DeleteResolver,
	type EntityResolverDef,
	type ResolverDefinition,
	type Resolvers,
} from "./resolvers/types";

// =============================================================================
// Execution
// =============================================================================

export {
	// Classes
	ExecutionEngine,
	DataLoader,
	// Errors
	ExecutionError,
	// Types
	type ExecutionEngineConfig,
	type ReactiveSubscription,
} from "./execution/engine";

// =============================================================================
// Server
// =============================================================================

export {
	// Factory
	createServer,
	// Types
	type ServerConfig,
	type LensServer,
	type WebSocketLike,
} from "./server/create";

export {
	// Factory (V2 - Operations-based)
	createServerV2,
	// Types
	type ServerV2Config,
	type LensServerV2,
	type EntitiesMap,
	type RelationsArray,
	type QueriesMap,
	type MutationsMap,
	type WebSocketLike as WebSocketLikeV2,
} from "./server/create-v2";

// =============================================================================
// State Management (Single source of truth)
// =============================================================================

export {
	// Class
	GraphStateManager,
	// Factory
	createGraphStateManager,
	// Types
	type EntityKey,
	type StateClient,
	type StateUpdateMessage,
	type StateFullMessage,
	type Subscription,
	type GraphStateManagerConfig,
} from "./state";

// =============================================================================
// SSE Transport Adapter
// =============================================================================

export {
	// Class
	SSEHandler,
	// Factory
	createSSEHandler,
	// Types
	type SSEHandlerConfig,
	type SSEClientInfo,
} from "./sse/handler";

// =============================================================================
// Unified Server (V2 Operations + V1 Optimization Layer)
// =============================================================================

export {
	// Factory
	createUnifiedServer,
	// Types
	type UnifiedServer,
	type UnifiedServerConfig,
	type EntitiesMap as UnifiedEntitiesMap,
	type QueriesMap as UnifiedQueriesMap,
	type MutationsMap as UnifiedMutationsMap,
	type WebSocketLike as UnifiedWebSocketLike,
} from "./server/unified";
