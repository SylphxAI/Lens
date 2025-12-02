/**
 * @sylphx/lens-server - Pusher Subscription Helper Tests
 */

import { describe, expect, it } from "bun:test";
import { createPusherSubscription, type PusherLike } from "./pusher.js";

// =============================================================================
// createPusherSubscription Tests
// =============================================================================

describe("createPusherSubscription", () => {
	it("subscribes to channel with prefix", () => {
		const subscribeChannels: string[] = [];
		const boundEvents: string[] = [];

		const mockPusher: PusherLike = {
			subscribe(channelName: string) {
				subscribeChannels.push(channelName);
				return {
					bind(eventName: string, _callback: (data: unknown) => void) {
						boundEvents.push(eventName);
					},
					unbind(_eventName: string, _callback: (data: unknown) => void) {},
				};
			},
			unsubscribe(_channelName: string) {},
		};

		createPusherSubscription(mockPusher, "entity:User:123", () => {});

		expect(subscribeChannels).toEqual(["lens-entity:User:123"]);
		expect(boundEvents).toEqual(["update"]);
	});

	it("uses custom channel prefix", () => {
		const subscribeChannels: string[] = [];

		const mockPusher: PusherLike = {
			subscribe(channelName: string) {
				subscribeChannels.push(channelName);
				return {
					bind(_eventName: string, _callback: (data: unknown) => void) {},
					unbind(_eventName: string, _callback: (data: unknown) => void) {},
				};
			},
			unsubscribe(_channelName: string) {},
		};

		createPusherSubscription(mockPusher, "entity:User:123", () => {}, "app-");

		expect(subscribeChannels).toEqual(["app-entity:User:123"]);
	});

	it("calls onMessage when update event fires", () => {
		const messages: unknown[] = [];
		let savedCallback: ((data: unknown) => void) | null = null;

		const mockPusher: PusherLike = {
			subscribe(_channelName: string) {
				return {
					bind(_eventName: string, callback: (data: unknown) => void) {
						savedCallback = callback;
					},
					unbind(_eventName: string, _callback: (data: unknown) => void) {},
				};
			},
			unsubscribe(_channelName: string) {},
		};

		createPusherSubscription(mockPusher, "entity:User:123", (data) => {
			messages.push(data);
		});

		// Simulate Pusher sending an update
		savedCallback?.({ id: "123", name: "Test" });

		expect(messages).toEqual([{ id: "123", name: "Test" }]);
	});

	it("returns unsubscribe function", () => {
		const unboundEvents: string[] = [];
		const unsubscribedChannels: string[] = [];

		const mockPusher: PusherLike = {
			subscribe(_channelName: string) {
				return {
					bind(_eventName: string, _callback: (data: unknown) => void) {},
					unbind(eventName: string, _callback: (data: unknown) => void) {
						unboundEvents.push(eventName);
					},
				};
			},
			unsubscribe(channelName: string) {
				unsubscribedChannels.push(channelName);
			},
		};

		const unsubscribe = createPusherSubscription(mockPusher, "entity:User:123", () => {});

		// Should return function
		expect(typeof unsubscribe).toBe("function");

		// Call unsubscribe
		unsubscribe();

		expect(unboundEvents).toEqual(["update"]);
		expect(unsubscribedChannels).toEqual(["lens-entity:User:123"]);
	});
});
