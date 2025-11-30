/**
 * @sylphx/lens-core - Optimistic Updates
 *
 * Reify-powered DSL for optimistic updates.
 * "Describe once, execute anywhere"
 */

// =============================================================================
// Reify DSL API
// =============================================================================

export * from "./reify";

// =============================================================================
// Evaluator (for legacy MultiEntityDSL format)
// =============================================================================

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
