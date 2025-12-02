/**
 * @sylphx/lens-server - Pusher Subscription Helper
 *
 * Client-side helper for subscribing to Lens updates via Pusher Channels.
 * For serverless deployments where WebSocket connections aren't persistent.
 *
 * Flow:
 * 1. Server uses HTTP adapter for requests
 * 2. Clients subscribe to Pusher channels directly (using pusher-js)
 * 3. Server publishes updates to Pusher (via separate integration)
 *
 * @example
 * ```typescript
 * import Pusher from 'pusher-js';
 * import { createPusherSubscription } from '@sylphx/lens-server';
 *
 * const pusher = new Pusher('your-key', { cluster: 'us2' });
 *
 * // Subscribe to entity updates
 * const unsubscribe = createPusherSubscription(pusher, 'entity:User:123', (data) => {
 *   console.log('User updated:', data);
 * });
 *
 * // Later...
 * unsubscribe();
 * ```
 */

/**
 * Pusher transport configuration.
 */
export interface PusherTransportOptions {
	/** Pusher app ID */
	appId: string;
	/** Pusher key */
	key: string;
	/** Pusher secret */
	secret: string;
	/** Pusher cluster (e.g., 'us2', 'eu', 'ap1') */
	cluster: string;
	/** Use TLS (default: true) */
	useTLS?: boolean;
	/** Channel prefix (default: 'lens-') */
	channelPrefix?: string;
	/** Debug logging */
	debug?: boolean;
}

/**
 * Pusher client interface.
 * Matches the pusher-js client API.
 */
export interface PusherLike {
	subscribe(channelName: string): {
		bind(eventName: string, callback: (data: unknown) => void): void;
		unbind(eventName: string, callback: (data: unknown) => void): void;
	};
	unsubscribe(channelName: string): void;
}

/**
 * Create a subscription to a Lens channel via Pusher.
 *
 * @param pusher - Pusher client instance (from pusher-js)
 * @param channel - Channel name (e.g., 'entity:User:123')
 * @param onMessage - Callback for incoming messages
 * @param channelPrefix - Channel prefix (default: 'lens-')
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * import Pusher from 'pusher-js';
 * import { createPusherSubscription } from '@sylphx/lens-server';
 *
 * const pusher = new Pusher('your-key', { cluster: 'us2' });
 *
 * const unsubscribe = createPusherSubscription(pusher, 'entity:User:123', (data) => {
 *   console.log('User updated:', data);
 * });
 * ```
 */
export function createPusherSubscription(
	pusher: PusherLike,
	channel: string,
	onMessage: (data: unknown) => void,
	channelPrefix = "lens-",
): () => void {
	const pusherChannel = `${channelPrefix}${channel}`;
	const subscription = pusher.subscribe(pusherChannel);

	subscription.bind("update", onMessage);

	return () => {
		subscription.unbind("update", onMessage);
		pusher.unsubscribe(pusherChannel);
	};
}
