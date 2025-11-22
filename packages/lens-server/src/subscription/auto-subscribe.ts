/**
 * Auto-subscription system
 *
 * Automatically creates subscriptions for queries based on conventions
 */

import { Observable } from "rxjs";
import type { z } from "zod";
import type { LensQuery } from "@sylphx/lens-core";
import type { PubSubAdapter } from "./pubsub.js";
import type { ChannelNamingStrategy } from "./channel.js";
import { defaultChannelNaming } from "./channel.js";

/**
 * Auto-subscription configuration
 */
export interface AutoSubscribeConfig {
	/**
	 * Channel naming strategy
	 */
	channelFor: ChannelNamingStrategy;

	/**
	 * PubSub adapter for publishing/subscribing
	 */
	pubsub: PubSubAdapter;
}

/**
 * Create auto-subscription for a query
 *
 * If query has explicit subscribe function, use it.
 * Otherwise, create convention-based subscription from pub/sub.
 */
export function createAutoSubscription(
	query: LensQuery<any, any, any>,
	config: AutoSubscribeConfig
): any {
	// With input
	if (query.input !== undefined) {
		return ((input: any, ctx: any) => {
			// If query has explicit subscribe, use it
			if (query.subscribe) {
				return (query.subscribe as any)(input, ctx);
			}

			// Otherwise, create convention-based subscription
			const channel = config.channelFor(query.path, input);
			const observable = config.pubsub.subscribe(channel);

			// Map event to output
			return {
				subscribe: (observer: any) => {
					return observable.subscribe({
						next: (event) => {
							const callback = observer.next || observer;
							callback(event.payload);
						},
						error: observer.error,
						complete: observer.complete,
					});
				},
			} as Observable<any>;
		}) as any;
	}

	// Without input
	return ((ctx: any) => {
		// If query has explicit subscribe, use it
		if (query.subscribe) {
			return (query.subscribe as any)(ctx);
		}

		// Otherwise, create convention-based subscription
		const channel = config.channelFor(query.path, undefined);
		const observable = config.pubsub.subscribe(channel);

		// Map event to output
		return {
			subscribe: (observer: any) => {
				return observable.subscribe({
					next: (event) => {
						const callback = observer.next || observer;
						callback(event.payload);
					},
					error: observer.error,
					complete: observer.complete,
				});
			},
		} as Observable<any>;
	}) as any;
}

/**
 * Auto-publish result after mutation
 */
export async function autoPublishMutation<TOutput>(
	path: string[],
	input: unknown,
	result: TOutput,
	config: AutoSubscribeConfig
): Promise<void> {
	const channel = config.channelFor(path, input);

	await config.pubsub.publish(channel, {
		type: "mutation",
		payload: result,
		timestamp: Date.now(),
	});
}
