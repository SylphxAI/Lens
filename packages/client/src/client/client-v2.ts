/**
 * @lens/client - Client V2 (Operations-based)
 *
 * Operations-based client for Lens API.
 * Supports queries, mutations with optimistic updates.
 *
 * @example
 * ```typescript
 * import { createClientV2 } from '@lens/client';
 * import { queries, mutations } from './operations';
 *
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [websocketLink({ url: 'ws://localhost:3000' })],
 * });
 *
 * // Type-safe query
 * const user = await client.query.whoami();
 *
 * // Type-safe mutation with optimistic update
 * const result = await client.mutation.createPost({ title: 'Hello' });
 * ```
 */

import type { QueryDef, MutationDef, isQueryDef, isMutationDef } from "@lens/core";
import { ReactiveStore, type EntityState } from "../store/reactive-store";
import {
	type Link,
	type LinkFn,
	type OperationResult,
	type NextLink,
	composeLinks,
	createOperationContext,
} from "../links";

// =============================================================================
// Types
// =============================================================================

/** Queries map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutations map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

/** Infer input type from query/mutation definition */
export type InferInput<T> = T extends QueryDef<infer I, unknown>
	? I extends void
		? void
		: I
	: T extends MutationDef<infer I, unknown>
		? I
		: never;

/** Infer output type from query/mutation definition */
export type InferOutput<T> = T extends QueryDef<unknown, infer O>
	? O
	: T extends MutationDef<unknown, infer O>
		? O
		: never;

/** Client V2 configuration */
export interface ClientV2Config<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/** Query definitions */
	queries?: Q;
	/** Mutation definitions */
	mutations?: M;
	/** Links (middleware chain) - last one should be terminal */
	links: Link[];
	/** Enable optimistic updates (default: true) */
	optimistic?: boolean;
}

/** Query accessor - callable function */
export type QueryAccessor<I, O> = I extends void
	? () => Promise<O>
	: (input: I) => Promise<O>;

/** Mutation accessor - callable function with optimistic support */
export type MutationAccessor<I, O> = (
	input: I,
	options?: MutationV2Options,
) => Promise<MutationV2Result<O>>;

/** Mutation options */
export interface MutationV2Options {
	/** Enable optimistic update (default: true) */
	optimistic?: boolean;
}

/** Mutation result */
export interface MutationV2Result<T> {
	/** Result data */
	data: T;
	/** Rollback function (only if optimistic) */
	rollback?: () => void;
}

/** Build query accessor type from queries map */
export type QueryAccessors<Q extends QueriesMap> = {
	[K in keyof Q]: QueryAccessor<InferInput<Q[K]>, InferOutput<Q[K]>>;
};

/** Build mutation accessor type from mutations map */
export type MutationAccessors<M extends MutationsMap> = {
	[K in keyof M]: MutationAccessor<InferInput<M[K]>, InferOutput<M[K]>>;
};

/** Client V2 type */
export interface ClientV2<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/** Query accessors */
	query: QueryAccessors<Q>;
	/** Mutation accessors */
	mutation: MutationAccessors<M>;
	/** Underlying store */
	$store: ReactiveStore;
	/** Execute raw operation */
	$execute: (
		type: "query" | "mutation",
		name: string,
		input: unknown,
	) => Promise<OperationResult>;
	/** Get query names */
	$queryNames: () => string[];
	/** Get mutation names */
	$mutationNames: () => string[];
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create operations-based client V2
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries: { whoami, searchUsers },
 *   mutations: { createPost, updatePost },
 *   links: [websocketLink({ url: 'ws://localhost:3000' })],
 * });
 *
 * // Queries
 * const me = await client.query.whoami();
 * const results = await client.query.searchUsers({ query: 'john' });
 *
 * // Mutations with optimistic updates
 * const { data, rollback } = await client.mutation.createPost({
 *   title: 'Hello',
 *   content: 'World',
 * });
 * ```
 */
export function createClientV2<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(config: ClientV2Config<Q, M>): ClientV2<Q, M> {
	const { queries = {} as Q, mutations = {} as M, links, optimistic = true } = config;

	// Validate links
	if (!links || links.length === 0) {
		throw new Error("At least one link is required");
	}

	// Initialize links
	const initializedLinks: LinkFn[] = links.map((link) => link());

	// Create store
	const store = new ReactiveStore({ optimistic });

	// Compose link chain (last link is terminal, doesn't call next)
	const terminalLink = initializedLinks[initializedLinks.length - 1];
	const middlewareLinks = initializedLinks.slice(0, -1);

	const executeChain = composeLinks(middlewareLinks, async (op) => {
		const result = terminalLink(op, () => Promise.resolve({ error: new Error("No next link") }));
		return result instanceof Promise ? result : Promise.resolve(result);
	});

	// Execute function for operations
	const execute = async (
		type: "query" | "mutation",
		name: string,
		input: unknown,
	): Promise<OperationResult> => {
		// Use "operation" as entity name for V2 operations
		const context = createOperationContext(type, "operation", name, input);
		return executeChain(context);
	};

	// Create query accessors
	const queryAccessors: Record<string, (input?: unknown) => Promise<unknown>> = {};
	for (const [name, queryDef] of Object.entries(queries)) {
		queryAccessors[name] = async (input?: unknown) => {
			const result = await execute("query", name, input);
			if (result.error) {
				throw result.error;
			}
			return result.data;
		};
	}

	// Create mutation accessors
	const mutationAccessors: Record<
		string,
		(input: unknown, options?: MutationV2Options) => Promise<MutationV2Result<unknown>>
	> = {};

	for (const [name, mutationDef] of Object.entries(mutations)) {
		mutationAccessors[name] = async (
			input: unknown,
			options?: MutationV2Options,
		): Promise<MutationV2Result<unknown>> => {
			const useOptimistic = options?.optimistic ?? optimistic;
			let optimisticId: string | undefined;

			// Apply optimistic update if mutation has optimistic handler
			if (useOptimistic && mutationDef._optimistic) {
				const optimisticData = mutationDef._optimistic({ input });
				if (optimisticData) {
					// Store the optimistic data (we use the mutation name as a key prefix)
					optimisticId = store.applyOptimistic("operation", "mutate", {
						name,
						data: optimisticData,
					});
				}
			}

			try {
				const result = await execute("mutation", name, input);

				if (result.error) {
					if (optimisticId) store.rollbackOptimistic(optimisticId);
					throw result.error;
				}

				if (optimisticId) {
					store.confirmOptimistic(optimisticId, result.data);
				}

				return {
					data: result.data,
					rollback: optimisticId
						? () => store.rollbackOptimistic(optimisticId!)
						: undefined,
				};
			} catch (error) {
				if (optimisticId) store.rollbackOptimistic(optimisticId);
				throw error;
			}
		};
	}

	return {
		query: queryAccessors as QueryAccessors<Q>,
		mutation: mutationAccessors as MutationAccessors<M>,
		$store: store,
		$execute: execute,
		$queryNames: () => Object.keys(queries),
		$mutationNames: () => Object.keys(mutations),
	};
}
