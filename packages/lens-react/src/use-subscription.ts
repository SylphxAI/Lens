/**
 * useSubscription hook for Lens
 */

import type { LensRequest } from "@sylphx/lens-core";
import { useEffect, useState } from "react";
import { useLensContext } from "./provider.js";

export interface UseSubscriptionOptions<TData> {
	/** Enable/disable the subscription */
	enabled?: boolean;
	/** Callback on data update */
	onData?: (data: TData) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
	/** Callback on complete */
	onComplete?: () => void;
}

export interface UseSubscriptionResult<TData> {
	data: TData | undefined;
	error: Error | null;
	isConnected: boolean;
	isError: boolean;
}

/**
 * Hook for real-time subscriptions
 *
 * @example
 * ```tsx
 * const { data, isConnected } = useSubscription({
 *   type: 'subscription',
 *   path: ['user', 'get'],
 *   input: { id: '123' },
 *   updateMode: 'auto'
 * }, {
 *   onData: (data) => console.log('Update:', data)
 * });
 * ```
 */
export function useSubscription<TData>(
	request: LensRequest,
	options: UseSubscriptionOptions<TData> = {},
): UseSubscriptionResult<TData> {
	const { transport } = useLensContext();
	const [data, setData] = useState<TData | undefined>(undefined);
	const [error, setError] = useState<Error | null>(null);
	const [isConnected, setIsConnected] = useState(false);

	useEffect(() => {
		if (options.enabled === false) {
			return;
		}

		const observable = transport.subscribe<TData>(request);
		setIsConnected(true);

		const subscription = observable.subscribe({
			next: (value: TData) => {
				setData(value);
				options.onData?.(value);
			},
			error: (err: Error) => {
				setError(err);
				setIsConnected(false);
				options.onError?.(err);
			},
			complete: () => {
				setIsConnected(false);
				options.onComplete?.();
			},
		});

		return () => {
			subscription.unsubscribe();
			setIsConnected(false);
		};
	}, [JSON.stringify(request), options.enabled]);

	return {
		data,
		error,
		isConnected,
		isError: error !== null,
	};
}
