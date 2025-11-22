/**
 * useMutation hook for Lens
 */

import type { LensRequest } from "@sylphx/lens-core";
import { useState } from "react";
import { useLensContext } from "./provider.js";

export interface UseMutationOptions<TData, TVariables> {
	/** Callback on success */
	onSuccess?: (data: TData, variables: TVariables) => void;
	/** Callback on error */
	onError?: (error: Error, variables: TVariables) => void;
	/** Callback on settled (success or error) */
	onSettled?: (
		data: TData | undefined,
		error: Error | null,
		variables: TVariables,
	) => void;
}

export interface UseMutationResult<TData, TVariables> {
	data: TData | undefined;
	error: Error | null;
	isLoading: boolean;
	isError: boolean;
	isSuccess: boolean;
	mutate: (variables: TVariables) => Promise<void>;
	mutateAsync: (variables: TVariables) => Promise<TData>;
	reset: () => void;
}

/**
 * Hook for executing mutations
 *
 * @example
 * ```tsx
 * const { mutate, isLoading } = useMutation({
 *   onSuccess: (data) => {
 *     console.log('Updated:', data);
 *   }
 * });
 *
 * // Later in handler
 * mutate({
 *   type: 'mutation',
 *   path: ['user', 'updateStatus'],
 *   input: { id: '123', status: 'online' }
 * });
 * ```
 */
export function useMutation<TData, TVariables extends LensRequest>(
	options: UseMutationOptions<TData, TVariables> = {},
): UseMutationResult<TData, TVariables> {
	const { transport } = useLensContext();
	const [data, setData] = useState<TData | undefined>(undefined);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const mutateAsync = async (variables: TVariables): Promise<TData> => {
		try {
			setIsLoading(true);
			setError(null);

			const result = await transport.mutate<TData>(variables);
			setData(result);
			options.onSuccess?.(result, variables);
			options.onSettled?.(result, null, variables);

			return result;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setError(error);
			options.onError?.(error, variables);
			options.onSettled?.(undefined, error, variables);
			throw error;
		} finally {
			setIsLoading(false);
		}
	};

	const mutate = async (variables: TVariables) => {
		try {
			await mutateAsync(variables);
		} catch {
			// Error already handled in mutateAsync
		}
	};

	const reset = () => {
		setData(undefined);
		setError(null);
		setIsLoading(false);
	};

	return {
		data,
		error,
		isLoading,
		isError: error !== null,
		isSuccess: data !== undefined && error === null,
		mutate,
		mutateAsync,
		reset,
	};
}
