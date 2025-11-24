/**
 * Tests for Subscription Batching Plugin
 */

import { describe, expect, test } from "bun:test";
import { subscriptionBatchingPlugin } from "./subscription-batching";

describe("subscriptionBatchingPlugin", () => {
	describe("client", () => {
		test("creates client instance with API", () => {
			const instance = subscriptionBatchingPlugin.client!({});

			expect(instance.name).toBe("subscription-batching");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.getBatchSize).toBe("function");
			expect(typeof instance.api!.flush).toBe("function");
		});

		test("getBatchSize returns 0 initially", () => {
			const instance = subscriptionBatchingPlugin.client!({});
			const api = instance.api as { getBatchSize: () => number };

			expect(api.getBatchSize()).toBe(0);
		});

		test("getPendingUpdates returns empty array initially", () => {
			const instance = subscriptionBatchingPlugin.client!({});
			const api = instance.api as { getPendingUpdates: () => unknown[] };

			expect(api.getPendingUpdates()).toEqual([]);
		});

		test("getStats returns initial stats", () => {
			const instance = subscriptionBatchingPlugin.client!({});
			const api = instance.api as {
				getStats: () => {
					totalUpdates: number;
					batchedUpdates: number;
					coalescedUpdates: number;
					averageBatchSize: number;
				};
			};

			const stats = api.getStats();
			expect(stats.totalUpdates).toBe(0);
			expect(stats.batchedUpdates).toBe(0);
			expect(stats.coalescedUpdates).toBe(0);
			expect(stats.averageBatchSize).toBe(0);
		});

		test("setPriority sets entity priority", () => {
			const instance = subscriptionBatchingPlugin.client!({});
			const api = instance.api as {
				setPriority: (entity: string, id: string, priority: number) => void;
			};

			// Should not throw
			api.setPriority("User", "1", 10);
		});
	});

	describe("server", () => {
		test("creates server instance with API", () => {
			const instance = subscriptionBatchingPlugin.server!({});

			expect(instance.name).toBe("subscription-batching");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.queueUpdate).toBe("function");
			expect(typeof instance.api!.flushClient).toBe("function");
		});

		test("getPendingCount returns 0 for unknown client", () => {
			const instance = subscriptionBatchingPlugin.server!({});
			const api = instance.api as { getPendingCount: (clientId: string) => number };

			expect(api.getPendingCount("unknown-client")).toBe(0);
		});

		test("flushClient returns empty for unknown client", () => {
			const instance = subscriptionBatchingPlugin.server!({});
			const api = instance.api as { flushClient: (clientId: string) => unknown[] };

			expect(api.flushClient("unknown-client")).toEqual([]);
		});

		test("queueUpdate adds update for client", () => {
			const instance = subscriptionBatchingPlugin.server!({ batchWindow: 10000 });
			const api = instance.api as {
				queueUpdate: (clientId: string, entity: string, id: string, update: unknown) => void;
				getPendingCount: (clientId: string) => number;
			};

			api.queueUpdate("client-1", "User", "1", { name: "Updated" });

			expect(api.getPendingCount("client-1")).toBe(1);
		});

		test("queueUpdate coalesces updates for same entity/id", () => {
			const instance = subscriptionBatchingPlugin.server!({ batchWindow: 10000, coalesce: true });
			const api = instance.api as {
				queueUpdate: (clientId: string, entity: string, id: string, update: unknown) => void;
				getPendingCount: (clientId: string) => number;
			};

			api.queueUpdate("client-1", "User", "1", { name: "First" });
			api.queueUpdate("client-1", "User", "1", { name: "Second" });

			// Should be coalesced to 1
			expect(api.getPendingCount("client-1")).toBe(1);
		});

		test("flushClient returns and clears pending updates", () => {
			const instance = subscriptionBatchingPlugin.server!({ batchWindow: 10000 });
			const api = instance.api as {
				queueUpdate: (clientId: string, entity: string, id: string, update: unknown) => void;
				flushClient: (clientId: string) => Array<{ entity: string; id: string; update: unknown }>;
				getPendingCount: (clientId: string) => number;
			};

			api.queueUpdate("client-1", "User", "1", { name: "Test" });

			const updates = api.flushClient("client-1");
			expect(updates).toHaveLength(1);
			expect(updates[0].entity).toBe("User");
			expect(updates[0].id).toBe("1");

			// Should be cleared
			expect(api.getPendingCount("client-1")).toBe(0);
		});
	});

	describe("config", () => {
		test("getClientConfig returns sanitized config", () => {
			const config = {
				batchWindow: 100,
				maxBatchSize: 50,
				coalesce: false,
				priorityThreshold: 5,
			};

			const clientConfig = subscriptionBatchingPlugin.getClientConfig!(config);

			expect(clientConfig.batchWindow).toBe(100);
			expect(clientConfig.maxBatchSize).toBe(50);
			expect(clientConfig.coalesce).toBe(false);
			expect(clientConfig.priorityThreshold).toBe(5);
		});

		test("uses default config values", () => {
			const clientConfig = subscriptionBatchingPlugin.getClientConfig!({});

			expect(clientConfig.batchWindow).toBe(50);
			expect(clientConfig.maxBatchSize).toBe(100);
			expect(clientConfig.coalesce).toBe(true);
			expect(clientConfig.priorityThreshold).toBe(10);
		});
	});
});
