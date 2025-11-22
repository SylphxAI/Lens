/**
 * @sylphx/lens-client
 *
 * Type-safe client for Lens APIs with inference from server schema.
 * Provides Router-like API similar to tRPC client.
 */

import type { LensObject, LensRequest, LensTransport } from "@sylphx/lens-core";
import type { Observable } from "@sylphx/lens-core";

/**
 * Client configuration
 */
export interface LensClientConfig {
	transport: LensTransport;
}

/**
 * Query/Mutation options
 */
export interface QueryOptions {
	/** Field selection */
	select?: string[] | Record<string, any>;
}

/**
 * Infer input type from schema path
 */
type InferInput<T> = T extends { input: { parse: (val: any) => infer I } }
	? I
	: never;

/**
 * Infer output type from schema path
 */
type InferOutput<T> = T extends { output: { parse: (val: any) => infer O } }
	? O
	: never;

/**
 * Create proxy for nested path building
 */
function createProxy<T extends LensObject>(
	transport: LensTransport,
	path: string[] = [],
): any {
	return new Proxy(
		{},
		{
			get(_, prop: string) {
				const newPath = [...path, prop];

				// Terminal methods
				if (prop === "query") {
					return async (input: any, options?: QueryOptions) => {
						return transport.query({
							type: "query",
							path,
							input,
							select: options?.select,
						});
					};
				}

				if (prop === "mutate") {
					return async (input: any, options?: QueryOptions) => {
						return transport.mutate({
							type: "mutation",
							path,
							input,
							select: options?.select,
						});
					};
				}

				if (prop === "subscribe") {
					return (input: any, options?: QueryOptions): Observable<any> => {
						return transport.subscribe({
							type: "subscription",
							path,
							input,
							select: options?.select,
						});
					};
				}

				// Continue building path
				return createProxy(transport, newPath);
			},
		},
	);
}

/**
 * Create type-safe Lens client
 *
 * @example
 * ```ts
 * const client = createLensClient<typeof api>({ transport });
 *
 * // Type-safe queries
 * const user = await client.user.get.query({ id: '1' });
 *
 * // Type-safe mutations
 * const updated = await client.user.update.mutate({
 *   id: '1',
 *   data: { name: 'Alice' }
 * });
 *
 * // Type-safe subscriptions
 * client.user.get.subscribe({ id: '1' }).subscribe({
 *   next: (user) => console.log(user)
 * });
 * ```
 */
export function createLensClient<T extends LensObject>(
	config: LensClientConfig,
): LensClient<T> {
	return createProxy(config.transport) as LensClient<T>;
}

/**
 * Type-safe client interface
 */
export type LensClient<T> = {
	[K in keyof T]: T[K] extends { type: "query" }
		? {
				query: (
					input: InferInput<T[K]>,
					options?: QueryOptions,
				) => Promise<InferOutput<T[K]>>;
				subscribe: (
					input: InferInput<T[K]>,
					options?: QueryOptions,
				) => Observable<InferOutput<T[K]>>;
			}
		: T[K] extends { type: "mutation" }
			? {
					mutate: (
						input: InferInput<T[K]>,
						options?: QueryOptions,
					) => Promise<InferOutput<T[K]>>;
				}
			: T[K] extends LensObject
				? LensClient<T[K]>
				: never;
};
