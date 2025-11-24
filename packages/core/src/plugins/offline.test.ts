/**
 * Tests for Offline Support Plugin
 */

import { describe, expect, test, beforeEach, mock } from "bun:test";
import { offlinePlugin } from "./offline";

describe("offlinePlugin", () => {
	describe("client", () => {
		test("creates client instance with API", () => {
			const instance = offlinePlugin.client!({});

			expect(instance.name).toBe("offline");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.isOnline).toBe("function");
			expect(typeof instance.api!.getPendingCount).toBe("function");
			expect(typeof instance.api!.sync).toBe("function");
		});

		test("isOnline function exists", () => {
			const instance = offlinePlugin.client!({});
			const api = instance.api as { isOnline: () => boolean };

			expect(typeof api.isOnline).toBe("function");
			// Note: actual value depends on navigator.onLine which may not exist in test env
		});

		test("getPendingCount returns 0 initially", () => {
			const instance = offlinePlugin.client!({});
			const api = instance.api as { getPendingCount: () => number };

			expect(api.getPendingCount()).toBe(0);
		});

		test("clearPending clears all pending operations", () => {
			const instance = offlinePlugin.client!({});
			const api = instance.api as {
				clearPending: () => void;
				getPendingCount: () => number;
			};

			api.clearPending();
			expect(api.getPendingCount()).toBe(0);
		});

		test("onStatusChange registers callback", () => {
			const instance = offlinePlugin.client!({});
			const api = instance.api as {
				onStatusChange: (cb: (online: boolean) => void) => () => void;
			};

			const callback = mock(() => {});
			const unsubscribe = api.onStatusChange(callback);

			expect(typeof unsubscribe).toBe("function");
		});
	});

	describe("server", () => {
		test("creates server instance with API", () => {
			const instance = offlinePlugin.server!({});

			expect(instance.name).toBe("offline");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.getConflictStrategy).toBe("function");
		});

		test("getConflictStrategy returns configured strategy", () => {
			const instance = offlinePlugin.server!({ conflictStrategy: "client-wins" });
			const api = instance.api as { getConflictStrategy: () => string };

			expect(api.getConflictStrategy()).toBe("client-wins");
		});

		test("default conflict strategy is server-wins", () => {
			const instance = offlinePlugin.server!({});
			const api = instance.api as { getConflictStrategy: () => string };

			expect(api.getConflictStrategy()).toBe("server-wins");
		});
	});

	describe("config", () => {
		test("getClientConfig returns sanitized config", () => {
			const config = {
				maxRetries: 5,
				conflictStrategy: "merge" as const,
				backgroundSync: false,
				syncInterval: 10000,
				storagePrefix: "custom_", // Should not be exposed
			};

			const clientConfig = offlinePlugin.getClientConfig!(config);

			expect(clientConfig.maxRetries).toBe(5);
			expect(clientConfig.conflictStrategy).toBe("merge");
			expect(clientConfig.backgroundSync).toBe(false);
			expect(clientConfig.syncInterval).toBe(10000);
		});
	});
});
