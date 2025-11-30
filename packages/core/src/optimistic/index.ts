/**
 * @sylphx/lens-core - Optimistic Updates
 *
 * DSL evaluation and utilities for optimistic updates.
 */

// DSL Builder
export { op, pipeline, ref, when } from "./builder";
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
