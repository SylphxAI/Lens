/**
 * React hooks for Lens
 *
 * Provides type-safe hooks for queries, mutations, and subscriptions.
 */

export { LensProvider, useLensContext } from "./provider.js";
export { useQuery } from "./use-query.js";
export { useMutation } from "./use-mutation.js";
export { useSubscription } from "./use-subscription.js";
export type { LensContextValue } from "./provider.js";
export type { UseQueryOptions, UseQueryResult } from "./use-query.js";
export type { UseMutationOptions, UseMutationResult } from "./use-mutation.js";
export type {
	UseSubscriptionOptions,
	UseSubscriptionResult,
} from "./use-subscription.js";
