/**
 * useResourceMutation hook for Lens
 *
 * High-level mutation hook with automatic:
 * - Optimistic updates
 * - Rollback on error
 * - Type inference
 * - Update strategy encoding
 */

import type {
	Resource,
	MutationOptions,
	QueryContext,
	InferEntity,
} from "@sylphx/lens-core";
import {
	createOptimisticUpdate,
	encodeUpdate,
} from "@sylphx/lens-core";
import { useState, useCallback, useRef } from "react";

/**
 * Options for useResourceMutation hook
 */
export interface UseResourceMutationOptions<TEntity, TData> {
	/** Query context */
	ctx: QueryContext;
	/** Enable optimistic updates */
	optimistic?: boolean;
	/** Rollback on error */
	rollbackOnError?: boolean;
	/** Callback on success */
	onSuccess?: (data: TData) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
	/** Callback when mutation settles */
	onSettled?: (data: TData | undefined, error: Error | null) => void;
	/** Mutation options */
	mutationOptions?: MutationOptions<TEntity>;
}

/**
 * Variables for resource mutation
 */
export interface ResourceMutationVariables<TEntity> {
	/** Entity ID */
	id: string;
	/** Data to update */
	data: Partial<TEntity>;
}

/**
 * Result from useResourceMutation hook
 */
export interface UseResourceMutationResult<TEntity, TData> {
	/** Mutation data */
	data: TData | undefined;
	/** Error state */
	error: Error | null;
	/** Loading state */
	isLoading: boolean;
	/** Success state */
	isSuccess: boolean;
	/** Error state */
	isError: boolean;
	/** Mutate function (with error handling) */
	mutate: (variables: ResourceMutationVariables<TEntity>) => Promise<void>;
	/** Mutate function (throws errors) */
	mutateAsync: (
		variables: ResourceMutationVariables<TEntity>,
	) => Promise<TData>;
	/** Reset mutation state */
	reset: () => void;
}

/**
 * Hook for resource mutations with optimistic updates
 *
 * Automatically handles:
 * - Optimistic updates
 * - Rollback on error
 * - Update strategy encoding
 * - Type safety
 *
 * @example Basic mutation
 * ```tsx
 * const { mutate, isLoading } = useResourceMutation(Session, {
 *   ctx,
 *   onSuccess: (data) => console.log('Updated:', data),
 * });
 *
 * // Update session title
 * mutate({
 *   id: sessionId,
 *   data: { title: 'New Title' },
 * });
 * ```
 *
 * @example With optimistic updates
 * ```tsx
 * const { mutate } = useResourceMutation(Session, {
 *   ctx,
 *   optimistic: true,
 *   rollbackOnError: true,
 * });
 *
 * // UI updates immediately, rolls back on error
 * mutate({
 *   id: sessionId,
 *   data: { status: 'completed' },
 * });
 * ```
 *
 * @example Using mutateAsync for error handling
 * ```tsx
 * const { mutateAsync } = useResourceMutation(Session, { ctx });
 *
 * try {
 *   const result = await mutateAsync({
 *     id: sessionId,
 *     data: { title: 'New Title' },
 *   });
 *   console.log('Success:', result);
 * } catch (error) {
 *   console.error('Failed:', error);
 * }
 * ```
 */
export function useResourceMutation<TEntity = any, TData = TEntity>(
	resource: Resource,
	options: UseResourceMutationOptions<TEntity, TData>,
): UseResourceMutationResult<TEntity, TData> {
	const [data, setData] = useState<TData | undefined>(undefined);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	// Store current entity for optimistic updates
	const currentEntityRef = useRef<TEntity | null>(null);
	const optimisticEntityRef = useRef<TEntity | null>(null);

	const {
		ctx,
		optimistic = false,
		rollbackOnError = true,
		onSuccess,
		onError: onErrorCallback,
		onSettled,
		mutationOptions = {},
	} = options;

	const mutateAsync = useCallback(
		async (
			variables: ResourceMutationVariables<TEntity>,
		): Promise<TData> => {
			try {
				setIsLoading(true);
				setError(null);

				const { id, data: mutationData } = variables;

				// If optimistic updates enabled, fetch current entity first
				if (optimistic && !currentEntityRef.current) {
					try {
						const current = await resource.api.get.query({ id }, {}, ctx);
						currentEntityRef.current = current as TEntity;
					} catch {
						// Ignore fetch error for optimistic update
					}
				}

				// Create optimistic update
				if (optimistic && currentEntityRef.current) {
					const optimisticEntity = createOptimisticUpdate(
						resource,
						currentEntityRef.current,
						mutationData,
					);

					optimisticEntityRef.current = optimisticEntity;

					// Publish optimistic update (would need event stream integration)
					if (ctx.eventStream) {
						ctx.eventStream.publish(
							`${resource.name}:${id}:optimistic`,
							optimisticEntity,
						);
					}
				}

				// Encode update for minimal transmission
				const encodedUpdate =
					optimistic && currentEntityRef.current
						? encodeUpdate(
								resource,
								currentEntityRef.current,
								{ ...currentEntityRef.current, ...mutationData } as TEntity,
							)
						: mutationData;

				// Execute mutation
				const result = await resource.api.update.mutate(
					{ id, data: encodedUpdate },
					mutationOptions,
					ctx,
				);

				setData(result as TData);

				// Update current entity reference
				currentEntityRef.current = result as TEntity;
				optimisticEntityRef.current = null;

				onSuccess?.(result as TData);
				onSettled?.(result as TData, null);

				return result as TData;
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				setError(error);

				// Rollback optimistic update
				if (
					optimistic &&
					rollbackOnError &&
					currentEntityRef.current &&
					ctx.eventStream
				) {
					ctx.eventStream.publish(
						`${resource.name}:${variables.id}:rollback`,
						currentEntityRef.current,
					);
				}

				optimisticEntityRef.current = null;

				onErrorCallback?.(error);
				onSettled?.(undefined, error);

				throw error;
			} finally {
				setIsLoading(false);
			}
		},
		[
			resource,
			ctx,
			optimistic,
			rollbackOnError,
			onSuccess,
			onErrorCallback,
			onSettled,
			mutationOptions,
		],
	);

	const mutate = useCallback(
		async (variables: ResourceMutationVariables<TEntity>) => {
			try {
				await mutateAsync(variables);
			} catch {
				// Error already handled in mutateAsync
			}
		},
		[mutateAsync],
	);

	const reset = useCallback(() => {
		setData(undefined);
		setError(null);
		setIsLoading(false);
		currentEntityRef.current = null;
		optimisticEntityRef.current = null;
	}, []);

	return {
		data,
		error,
		isLoading,
		isSuccess: data !== undefined && error === null,
		isError: error !== null,
		mutate,
		mutateAsync,
		reset,
	};
}
