/**
 * PubSub adapter interface for auto-subscription
 *
 * Integrates with any pub/sub system:
 * - AppEventStream (your existing system)
 * - Redis Pub/Sub
 * - RabbitMQ
 * - Kafka
 * - In-memory (for testing)
 */

import { Observable } from "rxjs";

/**
 * Event structure
 */
export interface PubSubEvent<T = unknown> {
	type: string;
	payload: T;
	timestamp?: number;
	[key: string]: unknown;
}

/**
 * PubSub adapter interface
 */
export interface PubSubAdapter {
	/**
	 * Publish event to channel
	 */
	publish<T = unknown>(channel: string, event: PubSubEvent<T>): Promise<void>;

	/**
	 * Subscribe to channel
	 */
	subscribe<T = unknown>(channel: string): Observable<PubSubEvent<T>>;

	/**
	 * Optional: Close adapter
	 */
	close?(): Promise<void>;
}

/**
 * In-memory pub/sub for testing
 */
export class InMemoryPubSub implements PubSubAdapter {
	private subjects = new Map<string, Set<(event: PubSubEvent) => void>>();

	async publish<T>(channel: string, event: PubSubEvent<T>): Promise<void> {
		const subscribers = this.subjects.get(channel);
		if (subscribers) {
			for (const subscriber of subscribers) {
				subscriber(event);
			}
		}
	}

	subscribe<T>(channel: string): Observable<PubSubEvent<T>> {
		const listeners = new Set<(value: PubSubEvent<T>) => void>();

		const handler = (event: PubSubEvent) => {
			for (const listener of listeners) {
				listener(event as PubSubEvent<T>);
			}
		};

		// Add to subjects
		if (!this.subjects.has(channel)) {
			this.subjects.set(channel, new Set());
		}
		this.subjects.get(channel)!.add(handler);

		return {
			subscribe: (observer: any) => {
				listeners.add(observer.next || observer);
				return {
					unsubscribe: () => {
						listeners.delete(observer.next || observer);
						if (listeners.size === 0) {
							const subscribers = this.subjects.get(channel);
							if (subscribers) {
								subscribers.delete(handler);
								if (subscribers.size === 0) {
									this.subjects.delete(channel);
								}
							}
						}
					},
				};
			},
		} as Observable<PubSubEvent<T>>;
	}

	async close(): Promise<void> {
		this.subjects.clear();
	}
}
