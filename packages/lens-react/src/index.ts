/**
 * React hooks for Lens
 *
 * Provides type-safe hooks for queries, mutations, and subscriptions.
 */

// Provider
export { LensProvider, useLensContext } from "./provider.js";
export type { LensContextValue } from "./provider.js";

// Low-level hooks (transport layer)
export { useQuery } from "./use-query.js";
export { useMutation } from "./use-mutation.js";
export { useSubscription } from "./use-subscription.js";
export type { UseQueryOptions, UseQueryResult } from "./use-query.js";
export type { UseMutationOptions, UseMutationResult } from "./use-mutation.js";
export type {
	UseSubscriptionOptions,
	UseSubscriptionResult,
} from "./use-subscription.js";

// High-level hooks (resource API)
export { useResource } from "./use-resource.js";
export { useResourceMutation } from "./use-resource-mutation.js";
export type {
	UseResourceOptions,
	UseResourceResult,
	FieldStreamingState,
} from "./use-resource.js";
export type {
	UseResourceMutationOptions,
	UseResourceMutationResult,
	ResourceMutationVariables,
} from "./use-resource-mutation.js";
