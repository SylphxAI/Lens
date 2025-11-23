/**
 * Resource System
 *
 * Core resource-based architecture for Lens.
 * Declarative resource definitions with auto-generated APIs.
 *
 * @module @sylphx/lens-core/resource
 */

// Main API
export {
	defineResource,
	validateAllResources,
	getResource,
	getAllResources,
	ResourceDefinitionError,
} from "./define-resource";

// Relationship helpers
export { hasMany, belongsTo, hasOne, manyToMany } from "./relationships";
export type {
	HasManyOptions,
	BelongsToOptions,
	HasOneOptions,
	ManyToManyOptions,
} from "./relationships";

// Registry
export { ResourceRegistry, ResourceRegistryError, getRegistry } from "./registry";

// Types
export type {
	// Core types
	Resource,
	ResourceDefinition,
	InferEntity,
	// Relationships
	Relationship,
	RelationshipType,
	HasManyRelationship,
	BelongsToRelationship,
	HasOneRelationship,
	ManyToManyRelationship,
	BaseRelationship,
	// Computed fields
	ComputedField,
	// Hooks
	ResourceHooks,
	// Optimistic updates
	OptimisticConfig,
	// Update strategies
	UpdateStrategyMode,
	UpdateStrategyConfig,
	// Query types
	QueryOptions,
	ListOptions,
	MutationOptions,
	Select,
	Include,
	// Subscriptions
	Subscription,
	SubscriptionHandlers,
	// Context
	QueryContext,
	DatabaseAdapter,
	EventStreamInterface,
} from "./types";

// Update strategy integration
export {
	UpdateStrategySelector,
	applyUpdateStrategy,
	applyUpdateStrategies,
	createOptimisticUpdate,
	encodeUpdate,
	decodeUpdate,
	getStrategyMetadata,
	DEFAULT_STRATEGY_CONFIG,
	type StrategyConfig,
} from "./update-strategy-integration";
