/**
 * useResource hook for Lens
 *
 * High-level hook that automatically handles:
 * - Field-level subscriptions
 * - Streaming fields (onStart/onDelta/onEnd)
 * - Delta operations
 * - Type inference
 *
 * This is the recommended way to use Lens in React applications.
 */

import type {
	Resource,
	QueryOptions,
	QueryContext,
	DeltaOperation,
	FieldSubscriptions,
	InferEntity,
} from "@sylphx/lens-core";
import { applyDelta } from "@sylphx/lens-core";
import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Streaming state for a field
 */
export interface FieldStreamingState {
	/** Whether the field is currently streaming */
	isStreaming: boolean;
	/** Error during streaming (if any) */
	error?: Error;
}

/**
 * Options for useResource hook
 */
export interface UseResourceOptions<TEntity> extends QueryOptions<TEntity> {
	/** Enable/disable the subscription */
	enabled?: boolean;
	/** Callback when data is loaded */
	onData?: (data: TEntity) => void;
	/** Callback when error occurs */
	onError?: (error: Error) => void;
	/** Fields to watch (for field-level subscriptions) */
	fields?: (keyof TEntity)[];
	/** Query context */
	ctx: QueryContext;
}

/**
 * Result from useResource hook
 */
export interface UseResourceResult<TEntity> {
	/** Current entity data */
	data: TEntity | null;
	/** Loading state */
	isLoading: boolean;
	/** Error state */
	error: Error | null;
	/** Streaming state per field */
	isStreaming: Record<string, FieldStreamingState>;
	/** Refetch function */
	refetch: () => Promise<void>;
}

/**
 * Hook for subscribing to a resource with automatic field-level subscriptions
 *
 * Automatically handles:
 * - Field-level subscriptions
 * - Streaming fields with delta operations
 * - Real-time updates
 * - Type safety
 *
 * @example Basic usage
 * ```tsx
 * const { data, isLoading, isStreaming } = useResource(Session, {
 *   id: sessionId,
 *   ctx,
 * });
 *
 * // data.title automatically updates with deltas
 * // isStreaming.title tracks streaming state
 * ```
 *
 * @example With field selection
 * ```tsx
 * const { data } = useResource(Session, {
 *   id: sessionId,
 *   select: { title: true, status: true },
 *   ctx,
 * });
 * ```
 *
 * @example With callbacks
 * ```tsx
 * const { data } = useResource(Session, {
 *   id: sessionId,
 *   onData: (session) => console.log('Session updated:', session),
 *   onError: (error) => console.error('Error:', error),
 *   ctx,
 * });
 * ```
 */
export function useResource<TEntity = any>(
	resource: Resource,
	options: UseResourceOptions<TEntity> & { id: string },
): UseResourceResult<TEntity> {
	const [data, setData] = useState<TEntity | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [isStreaming, setIsStreaming] = useState<
		Record<string, FieldStreamingState>
	>({});

	// Track field values for delta operations
	const fieldValuesRef = useRef<Record<string, any>>({});

	const { id, ctx, enabled = true, onData, onError, ...queryOptions } = options;

	// Initial fetch
	const fetchData = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const result = await resource.api.get.query({ id }, queryOptions, ctx);

			setData(result as TEntity);
			onData?.(result as TEntity);

			// Initialize field values for delta tracking
			if (result) {
				fieldValuesRef.current = { ...result };
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setError(error);
			onError?.(error);
		} finally {
			setIsLoading(false);
		}
	}, [id, JSON.stringify(queryOptions), ctx]);

	// Subscribe to field updates
	useEffect(() => {
		if (!enabled) {
			return;
		}

		// Initial fetch
		fetchData();

		// Get streaming fields from resource definition
		const updateStrategy = resource.definition.updateStrategy;
		const streamingFields =
			typeof updateStrategy === "object" && updateStrategy?.streamingFields
				? updateStrategy.streamingFields
				: [];

		// Build field subscriptions
		const fieldSubscriptions: FieldSubscriptions<TEntity> = {};

		// Determine which fields to subscribe to
		const fieldsToWatch =
			options.fields ||
			(options.select
				? Object.keys(options.select).filter(
						(key) => (options.select as any)[key] === true,
					)
				: Object.keys((resource.definition.fields as any).shape || {}));

		for (const fieldName of fieldsToWatch) {
			const fieldNameStr = String(fieldName);

			if (streamingFields.includes(fieldNameStr)) {
				// Streaming field - use onStart/onDelta/onEnd
				fieldSubscriptions[fieldName as keyof TEntity] = {
					onStart: (value: any) => {
						setIsStreaming((prev) => ({
							...prev,
							[fieldNameStr]: { isStreaming: true },
						}));

						setData((prev) =>
							prev
								? ({
										...prev,
										[fieldName]: value,
									} as TEntity)
								: null,
						);

						fieldValuesRef.current[fieldNameStr] = value;
					},

					onDelta: (delta: DeltaOperation) => {
						// Apply delta to current value
						const currentValue = fieldValuesRef.current[fieldNameStr] || "";
						const newValue = applyDelta(String(currentValue), delta);

						fieldValuesRef.current[fieldNameStr] = newValue;

						setData((prev) =>
							prev
								? ({
										...prev,
										[fieldName]: newValue,
									} as TEntity)
								: null,
						);
					},

					onEnd: (value: any) => {
						setIsStreaming((prev) => ({
							...prev,
							[fieldNameStr]: { isStreaming: false },
						}));

						setData((prev) =>
							prev
								? ({
										...prev,
										[fieldName]: value,
									} as TEntity)
								: null,
						);

						fieldValuesRef.current[fieldNameStr] = value;
					},

					onError: (error: Error) => {
						setIsStreaming((prev) => ({
							...prev,
							[fieldNameStr]: { isStreaming: false, error },
						}));
					},
				};
			} else {
				// Regular field - use onChange
				fieldSubscriptions[fieldName as keyof TEntity] = {
					onChange: (value: any) => {
						setData((prev) =>
							prev
								? ({
										...prev,
										[fieldName]: value,
									} as TEntity)
								: null,
						);

						fieldValuesRef.current[fieldNameStr] = value;
					},

					onError: (error: Error) => {
						setError(error);
						onError?.(error);
					},
				};
			}
		}

		// Subscribe to fields
		const subscription = resource.api.get.subscribe(
			{ id },
			{ fields: fieldSubscriptions } as any,
			undefined,
			ctx,
		);

		return () => {
			subscription.unsubscribe();
		};
	}, [id, enabled, JSON.stringify(queryOptions), ctx]);

	return {
		data,
		isLoading,
		error,
		isStreaming,
		refetch: fetchData,
	};
}
