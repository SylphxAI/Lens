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
// Hooks
// =============================================================================

export {
	// Entity hooks
	useEntity,
	useList,
	// Mutation hook
	useMutation,
	// Signal hooks
	useSignalValue,
	useLensComputed,
	// Types
	type EntityInput,
	type QueryOptions,
	type UseEntityResult,
	type UseListResult,
	type UseMutationResult,
	type UpdateMutationInput,
	type DeleteMutationInput,
} from "./hooks";

// =============================================================================
// Reactive Hooks (Fine-grained reactivity)
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
	type UpdateMutationInput as ReactiveUpdateMutationInput,
	type DeleteMutationInput as ReactiveDeleteMutationInput,
} from "./reactive-hooks";

// =============================================================================
// Re-exports from @preact/signals-react
// =============================================================================

export { useSignal, useComputed, useSignalEffect } from "@preact/signals-react";

// =============================================================================
// V2 Hooks (Operations-based API)
// =============================================================================

export {
	// Context & Provider
	LensProviderV2,
	useLensClientV2,
	type LensProviderV2Props,
} from "./context-v2";

export {
	// Query hooks
	useQuery,
	useLazyQuery,
	// Mutation hook
	useMutation as useMutationV2,
	// Types
	type UseQueryResult,
	type UseLazyQueryResult,
	type UseMutationV2Result,
	type UseQueryOptions,
} from "./hooks-v2";
