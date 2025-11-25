/**
 * @lens/react
 *
 * React bindings for Lens API framework.
 * Hooks, context provider, and signal integration.
 */

// =============================================================================
// Context & Provider
// =============================================================================

export { LensProvider, useLensClient, type LensProviderProps } from "./context";

// =============================================================================
// Hooks (Operations-based API)
// =============================================================================

export {
	// Query hooks
	useQuery,
	useLazyQuery,
	// Mutation hook
	useMutation,
	// Types
	type UseQueryResult,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type MutationFn,
} from "./hooks";

// =============================================================================
// Reactive Hooks (Fine-grained reactivity with signals)
// =============================================================================

export {
	// Context & Provider
	ReactiveLensProvider,
	useReactiveLensClient,
	type ReactiveLensProviderProps,
} from "./reactive-context";

export {
	// Entity hooks with field-level signals
	useReactiveEntity,
	useReactiveList,
	// Field signal hook
	useFieldSignal,
	// Mutation hook
	useReactiveMutation,
	// Types
	type UseReactiveEntityResult,
	type UseReactiveListResult,
	type UpdateMutationInput,
	type DeleteMutationInput,
} from "./reactive-hooks";

// =============================================================================
// Re-exports from @preact/signals-react
// =============================================================================

export { useSignal, useComputed, useSignalEffect } from "@preact/signals-react";
