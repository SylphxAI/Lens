/**
 * @sylphx/lens-core - UDSL Integration
 *
 * Re-exports UDSL for optimistic updates with Lens-specific adapters.
 * UDSL provides the "Mutations as Data" pattern - describe operations once,
 * execute anywhere with plugins.
 *
 * @example
 * ```typescript
 * import { pipe, entity, branch, ref, now, temp, inc } from '@sylphx/lens-core/optimistic';
 *
 * const createSession = pipe(({ input }) => [
 *   branch(input.sessionId)
 *     .then(entity.update('Session', { id: input.sessionId, title: input.title }))
 *     .else(entity.create('Session', { id: temp(), title: input.title }))
 *     .as('session'),
 *
 *   entity.create('Message', {
 *     id: temp(),
 *     sessionId: ref('session').id,
 *     content: input.content,
 *   }).as('message'),
 * ]);
 * ```
 */

// =============================================================================
// Re-export UDSL Builder API
// =============================================================================

export {
	addToSet,
	// Conditional builder
	branch,
	dec,
	defaultTo,
	// Entity helpers
	entity,
	// Operators
	inc,
	now,
	// Operation builder
	op,
	// Pipeline builders
	pipe,
	pull,
	push,
	// Value references
	ref,
	single,
	temp,
	when,
} from "@sylphx/udsl";

// =============================================================================
// Re-export UDSL Types
// =============================================================================

export type {
	Conditional,
	ConditionalResult,
	DSL,
	EffectHandler,
	EvalContext,
	OpAddToSet,
	OpDec,
	OpDefault,
	// Core types
	Operation,
	// Result types
	OperationResult,
	OpIf,
	// Operator types
	OpInc,
	OpPull,
	OpPush,
	Pipeline,
	PipelineResult,
	PipelineStep,
	// Plugin types
	Plugin,
	// Reference types
	RefInput,
	RefNow,
	RefResult,
	RefTemp,
	// Builder types
	StepBuilder,
	StepResult,
} from "@sylphx/udsl";

// =============================================================================
// Re-export UDSL Execution
// =============================================================================

export {
	clearPlugins,
	// Adapters
	createCachePlugin,
	createPrismaPlugin,
	// Errors
	EvaluationError,
	// Built-in plugins
	entityPlugin,
	// Execution
	execute,
	executeConditional,
	executeOperation,
	executePipeline,
	getPluginNamespaces,
	// Plugin registry
	registerPlugin,
	// Value resolution
	resolveValue,
	unregisterPlugin,
} from "@sylphx/udsl";

// =============================================================================
// Re-export adapter types
// =============================================================================

export type { CacheLike, CachePluginOptions, PrismaLike, PrismaPluginOptions } from "@sylphx/udsl";
