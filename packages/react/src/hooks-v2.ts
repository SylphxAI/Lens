/**
 * @lens/react - Hooks V2
 *
 * React hooks for operations-based Lens API.
 *
 * @example
 * ```tsx
 * import { useQuery, useMutation } from '@lens/react';
 *
 * function UserProfile() {
 *   const { data, loading, error } = useQuery('whoami');
 *   // ...
 * }
 *
 * function CreatePost() {
 *   const { mutate, loading } = useMutation('createPost');
 *   // ...
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type {
	ClientV2,
	QueriesMap,
	MutationsMap,
	InferInput,
	InferOutput,
	MutationV2Result,
} from "@lens/client";
import { useLensClientV2 } from "./context-v2";

// =============================================================================
// Types
// =============================================================================

/** Result of useQuery hook */
export interface UseQueryResult<TOutput> {
	/** Query data (null if loading or error) */
	data: TOutput | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Refetch the query */
	refetch: () => Promise<void>;
}

/** Result of useMutation hook */
export interface UseMutationV2Result<TInput, TOutput> {
	/** Execute the mutation */
	mutate: (input: TInput, options?: { optimistic?: boolean }) => Promise<MutationV2Result<TOutput>>;
	/** Mutation is in progress */
	loading: boolean;
	/** Mutation error */
	error: Error | null;
	/** Last mutation result */
	data: TOutput | null;
	/** Reset mutation state */
	reset: () => void;
}

/** Options for useQuery */
export interface UseQueryOptions<TInput> {
	/** Input for the query (if required) */
	input?: TInput;
	/** Skip the query (don't execute) */
	skip?: boolean;
	/** Refetch on mount */
	refetchOnMount?: boolean;
}

// =============================================================================
// useQuery Hook
// =============================================================================

/**
 * Execute a query operation with loading/error state
 *
 * @param queryName - Name of the query to execute
 * @param options - Query options (input, skip, etc.)
 *
 * @example
 * ```tsx
 * // Query without input
 * function UserProfile() {
 *   const { data: user, loading, error } = useQuery('whoami');
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   if (!user) return <NotFound />;
 *
 *   return <h1>{user.name}</h1>;
 * }
 *
 * // Query with input
 * function UserById({ userId }: { userId: string }) {
 *   const { data: user, loading } = useQuery('getUser', {
 *     input: { id: userId },
 *   });
 *
 *   if (loading) return <Spinner />;
 *   return <h1>{user?.name}</h1>;
 * }
 *
 * // Skip query conditionally
 * function ConditionalQuery({ shouldFetch }: { shouldFetch: boolean }) {
 *   const { data } = useQuery('getUsers', { skip: !shouldFetch });
 *   // ...
 * }
 * ```
 */
export function useQuery<
	Q extends QueriesMap,
	K extends keyof Q & string,
>(
	queryName: K,
	options?: UseQueryOptions<InferInput<Q[K]>>,
): UseQueryResult<InferOutput<Q[K]>> {
	const client = useLensClientV2<Q, MutationsMap>();

	const [data, setData] = useState<InferOutput<Q[K]> | null>(null);
	const [loading, setLoading] = useState(!options?.skip);
	const [error, setError] = useState<Error | null>(null);

	// Track if component is mounted
	const mountedRef = useRef(true);

	// Serialize input for dependency tracking
	const inputKey = JSON.stringify(options?.input ?? null);

	// Execute query
	const executeQuery = useCallback(async () => {
		if (options?.skip) return;

		setLoading(true);
		setError(null);

		try {
			const queryFn = client.query[queryName];
			if (!queryFn) {
				throw new Error(`Query not found: ${queryName}`);
			}

			const result = await (queryFn as (input?: unknown) => Promise<unknown>)(
				options?.input,
			);

			if (mountedRef.current) {
				setData(result as InferOutput<Q[K]>);
			}
		} catch (err) {
			if (mountedRef.current) {
				setError(err instanceof Error ? err : new Error(String(err)));
			}
		} finally {
			if (mountedRef.current) {
				setLoading(false);
			}
		}
	}, [client, queryName, inputKey, options?.skip]);

	// Execute on mount and when dependencies change
	useEffect(() => {
		mountedRef.current = true;
		executeQuery();

		return () => {
			mountedRef.current = false;
		};
	}, [executeQuery]);

	// Refetch function
	const refetch = useCallback(async () => {
		await executeQuery();
	}, [executeQuery]);

	return {
		data,
		loading,
		error,
		refetch,
	};
}

// =============================================================================
// useMutation Hook
// =============================================================================

/**
 * Execute a mutation operation with loading/error state
 *
 * @param mutationName - Name of the mutation to execute
 *
 * @example
 * ```tsx
 * function CreatePost() {
 *   const { mutate: createPost, loading, error } = useMutation('createPost');
 *
 *   const handleSubmit = async (formData: FormData) => {
 *     try {
 *       const { data: post } = await createPost({
 *         title: formData.get('title'),
 *         content: formData.get('content'),
 *       });
 *       console.log('Created:', post);
 *     } catch (err) {
 *       console.error('Failed:', err);
 *     }
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <button type="submit" disabled={loading}>
 *         {loading ? 'Creating...' : 'Create'}
 *       </button>
 *       {error && <p className="error">{error.message}</p>}
 *     </form>
 *   );
 * }
 *
 * // With optimistic updates
 * function UpdatePost({ postId }: { postId: string }) {
 *   const { mutate: updatePost } = useMutation('updatePost');
 *
 *   const handleUpdate = async (title: string) => {
 *     const { data, rollback } = await updatePost(
 *       { id: postId, title },
 *       { optimistic: true },
 *     );
 *
 *     // rollback() can be called to undo the optimistic update
 *   };
 * }
 * ```
 */
export function useMutation<
	M extends MutationsMap,
	K extends keyof M & string,
>(
	mutationName: K,
): UseMutationV2Result<InferInput<M[K]>, InferOutput<M[K]>> {
	const client = useLensClientV2<QueriesMap, M>();

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [data, setData] = useState<InferOutput<M[K]> | null>(null);

	// Track if component is mounted
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Mutation function
	const mutate = useCallback(
		async (
			input: InferInput<M[K]>,
			options?: { optimistic?: boolean },
		): Promise<MutationV2Result<InferOutput<M[K]>>> => {
			setLoading(true);
			setError(null);

			try {
				const mutationFn = client.mutation[mutationName];
				if (!mutationFn) {
					throw new Error(`Mutation not found: ${mutationName}`);
				}

				const result = await (
					mutationFn as (
						input: unknown,
						options?: { optimistic?: boolean },
					) => Promise<MutationV2Result<unknown>>
				)(input, options);

				if (mountedRef.current) {
					setData(result.data as InferOutput<M[K]>);
				}

				return result as MutationV2Result<InferOutput<M[K]>>;
			} catch (err) {
				const mutationError = err instanceof Error ? err : new Error(String(err));
				if (mountedRef.current) {
					setError(mutationError);
				}
				throw mutationError;
			} finally {
				if (mountedRef.current) {
					setLoading(false);
				}
			}
		},
		[client, mutationName],
	);

	// Reset function
	const reset = useCallback(() => {
		setLoading(false);
		setError(null);
		setData(null);
	}, []);

	return {
		mutate,
		loading,
		error,
		data,
		reset,
	};
}

// =============================================================================
// useLazyQuery Hook
// =============================================================================

/** Result of useLazyQuery hook */
export interface UseLazyQueryResult<TInput, TOutput> {
	/** Execute the query */
	execute: (input?: TInput) => Promise<TOutput>;
	/** Query data (null if not executed or error) */
	data: TOutput | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Reset query state */
	reset: () => void;
}

/**
 * Execute a query operation on demand (not on mount)
 *
 * @param queryName - Name of the query to execute
 *
 * @example
 * ```tsx
 * function SearchUsers() {
 *   const { execute: searchUsers, data, loading } = useLazyQuery('searchUsers');
 *
 *   const handleSearch = async (query: string) => {
 *     const users = await searchUsers({ query });
 *     console.log('Found:', users);
 *   };
 *
 *   return (
 *     <div>
 *       <input onChange={e => handleSearch(e.target.value)} />
 *       {loading && <Spinner />}
 *       {data?.map(user => <UserCard key={user.id} user={user} />)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useLazyQuery<
	Q extends QueriesMap,
	K extends keyof Q & string,
>(
	queryName: K,
): UseLazyQueryResult<InferInput<Q[K]>, InferOutput<Q[K]>> {
	const client = useLensClientV2<Q, MutationsMap>();

	const [data, setData] = useState<InferOutput<Q[K]> | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Track if component is mounted
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Execute function
	const execute = useCallback(
		async (input?: InferInput<Q[K]>): Promise<InferOutput<Q[K]>> => {
			setLoading(true);
			setError(null);

			try {
				const queryFn = client.query[queryName];
				if (!queryFn) {
					throw new Error(`Query not found: ${queryName}`);
				}

				const result = await (queryFn as (input?: unknown) => Promise<unknown>)(input);

				if (mountedRef.current) {
					setData(result as InferOutput<Q[K]>);
				}

				return result as InferOutput<Q[K]>;
			} catch (err) {
				const queryError = err instanceof Error ? err : new Error(String(err));
				if (mountedRef.current) {
					setError(queryError);
				}
				throw queryError;
			} finally {
				if (mountedRef.current) {
					setLoading(false);
				}
			}
		},
		[client, queryName],
	);

	// Reset function
	const reset = useCallback(() => {
		setLoading(false);
		setError(null);
		setData(null);
	}, []);

	return {
		execute,
		data,
		loading,
		error,
		reset,
	};
}
