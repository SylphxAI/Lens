/**
 * @sylphx/lens-core - Optimistic Updates
 *
 * DSL evaluation and utilities for optimistic updates.
 */

// =============================================================================
// UDSL - New API (recommended)
// =============================================================================

// Re-export everything from UDSL
export * from "./udsl";

// =============================================================================
// Legacy API (deprecated, will be removed in v2)
// =============================================================================

// DSL Builder (legacy)
export { op, pipeline, ref, when } from "./builder";

// Evaluator (legacy)
export {
	applyDeferredOperation,
	applyDeferredOperations,
	type DeferredOperation,
	type EvaluatedOperation,
	type EvaluationContext,
	evaluateMultiEntityDSL,
	evaluateMultiEntityDSLMap,
	OptimisticEvaluationError,
} from "./evaluator";
