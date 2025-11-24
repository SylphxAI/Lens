/**
 * @lens/server
 *
 * Server runtime for Lens API framework.
 * Resolvers, execution engine, and WebSocket handler.
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

// =============================================================================
// SSE (Server-Sent Events)
// =============================================================================

export {
	// Class
	SSEHandler,
	// Factory
	createSSEHandler,
	// Types
	type SSEClient,
	type SSESubscription,
	type SSEHandlerConfig,
} from "./sse/handler";

// =============================================================================
// Subscriptions (Field-level real-time updates)
// =============================================================================

export {
	// Class
	SubscriptionHandler,
	// Factory
	createSubscriptionHandler,
	// Types
	type SubscriptionClient,
	type ClientSubscribeMessage,
	type ClientUnsubscribeMessage,
	type ClientMessage,
	type ServerUpdateMessage,
	type EntityKey as SubscriptionEntityKey,
	type FieldSubscriptionState,
	type EntitySubscriptionState,
	type SubscriptionHandlerConfig,
} from "./subscriptions";

// =============================================================================
// State Management (Canonical state + client sync)
// =============================================================================

export {
	// Class
	GraphStateManager,
	// Factory
	createGraphStateManager,
	// Types
	type EntityKey as StateEntityKey,
	type StateClient,
	type StateUpdateMessage,
	type StateFullMessage,
	type Subscription,
	type GraphStateManagerConfig,
} from "./state";
