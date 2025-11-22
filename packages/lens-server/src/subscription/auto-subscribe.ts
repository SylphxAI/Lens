/**
 * Auto-subscription system
 *
 * Automatically creates subscriptions for queries based on conventions
 */

import { Observable } from "rxjs";
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
export function createAutoSubscription<TInput, TOutput>(
	query: LensQuery<TInput, TOutput>,
	config: AutoSubscribeConfig
): (input: TInput) => Observable<TOutput> {
	return (input: TInput) => {
		// If query has explicit subscribe, use it
		if (query.subscribe) {
			return query.subscribe(input);
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
						callback(event.payload as TOutput);
					},
					error: observer.error,
					complete: observer.complete,
				});
			},
		} as Observable<TOutput>;
	};
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
