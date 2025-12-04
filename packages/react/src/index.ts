/**
 * @sylphx/lens-react
 *
 * React bindings for Lens API framework.
 * Hooks and context provider for reactive data access.
 */

// =============================================================================
// Context & Provider
// =============================================================================

export { LensProvider, type LensProviderProps, useLensClient } from "./context.js";

// =============================================================================
// Hooks (Operations-based API)
// =============================================================================

export {
	// Types
	type MutationSelector,
	type QuerySelector,
	type RouteSelector,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
	// Query hooks
	useLazyQuery,
	// Mutation hook
	useMutation,
	useQuery,
} from "./hooks.js";
