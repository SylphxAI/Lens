/**
 * useQuery hook for Lens
 */

import type { LensRequest } from "@sylphx/lens-core";
import { useEffect, useState } from "react";
import { useLensContext } from "./provider.js";

export interface UseQueryOptions<TData> {
	/** Enable/disable the query */
	enabled?: boolean;
	/** Refetch interval in milliseconds */
	refetchInterval?: number;
	/** Initial data */
	initialData?: TData;
	/** Callback on success */
	onSuccess?: (data: TData) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
}

export interface UseQueryResult<TData> {
	data: TData | undefined;
	error: Error | null;
	isLoading: boolean;
	isError: boolean;
	isSuccess: boolean;
	refetch: () => Promise<void>;
}

/**
 * Hook for executing queries
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useQuery({
 *   type: 'query',
 *   path: ['user', 'get'],
 *   input: { id: '123' },
 *   select: ['id', 'name', 'email']
 * });
 * ```
 */
export function useQuery<TData>(
	request: LensRequest,
	options: UseQueryOptions<TData> = {},
): UseQueryResult<TData> {
	const { transport } = useLensContext();
	const [data, setData] = useState<TData | undefined>(options.initialData);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const fetchData = async () => {
		try {
			setIsLoading(true);
			setError(null);

			const result = await transport.query<TData>(request);
			setData(result);
			options.onSuccess?.(result);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setError(error);
			options.onError?.(error);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (options.enabled === false) {
			return;
		}

		fetchData();

		if (options.refetchInterval) {
			const interval = setInterval(fetchData, options.refetchInterval);
			return () => clearInterval(interval);
		}
	}, [
		JSON.stringify(request),
		options.enabled,
		options.refetchInterval,
	]);

	return {
		data,
		error,
		isLoading,
		isError: error !== null,
		isSuccess: data !== undefined && error === null,
		refetch: fetchData,
	};
}
