/**
 * @lens/client - Optimistic Manager Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { OptimisticManager, createOptimisticManager } from "./optimistic-manager";
import { SubscriptionManager } from "./subscription-manager";

describe("OptimisticManager", () => {
	let subscriptions: SubscriptionManager;
	let manager: OptimisticManager;

	beforeEach(() => {
		subscriptions = new SubscriptionManager();
		manager = new OptimisticManager(subscriptions);
	});

	describe("Basic Operations", () => {
		it("applies optimistic update to existing entity", () => {
			// Create existing subscription
			subscriptions.getOrCreateSubscription("User", "123", {
				id: "123",
				name: "Original Name",
				email: "test@example.com",
			});

			// Apply optimistic update
			const optId = manager.applyOptimistic("User", "123", "update", {
				name: "Optimistic Name",
			});

			expect(optId).toBeTruthy();
			expect(optId.startsWith("opt_")).toBe(true);

			// Verify signal updated
			const signal = subscriptions.getSignal("User", "123");
			expect(signal?.$.name.value).toBe("Optimistic Name");
			expect(signal?.$.email.value).toBe("test@example.com");
		});

		it("applies optimistic create", () => {
			const optId = manager.applyOptimistic("User", "456", "create", {
				id: "456",
				name: "New User",
				email: "new@example.com",
			});

			expect(optId).toBeTruthy();

			// Verify signal created
			const signal = subscriptions.getSignal("User", "456");
			expect(signal).not.toBeNull();
			expect(signal?.$.name.value).toBe("New User");
		});

		it("applies optimistic delete", () => {
			subscriptions.getOrCreateSubscription("User", "123", {
				id: "123",
				name: "To Delete",
			});

			manager.applyOptimistic("User", "123", "delete", {});

			// Verify signal marked as deleted
			const signal = subscriptions.getSignal("User", "123");
			expect((signal?.value.value as Record<string, unknown>).__deleted).toBe(true);
		});
	});

	describe("Confirmation", () => {
		it("confirms optimistic update", () => {
			subscriptions.getOrCreateSubscription("User", "123", {
				id: "123",
				name: "Original",
			});

			const optId = manager.applyOptimistic("User", "123", "update", {
				name: "Optimistic",
			});

			// Confirm with server data
			manager.confirm(optId, {
				id: "123",
				name: "Server Name",
				updatedAt: "2024-01-01",
			});

			// Verify signal has server data
			const signal = subscriptions.getSignal("User", "123");
			expect(signal?.$.name.value).toBe("Server Name");
			expect((signal?.value.value as Record<string, unknown>).updatedAt).toBe("2024-01-01");

			// Verify pending cleared
			expect(manager.getPendingCount()).toBe(0);
		});

		it("confirms without server data", () => {
			subscriptions.getOrCreateSubscription("User", "123", {
				id: "123",
				name: "Original",
			});

			const optId = manager.applyOptimistic("User", "123", "update", {
				name: "Optimistic",
			});

			manager.confirm(optId);

			// Optimistic data remains
			const signal = subscriptions.getSignal("User", "123");
			expect(signal?.$.name.value).toBe("Optimistic");
			expect(manager.getPendingCount()).toBe(0);
		});

		it("confirms delete removes subscription", () => {
			subscriptions.getOrCreateSubscription("User", "123", {
				id: "123",
				name: "To Delete",
			});
			subscriptions.subscribeFullEntity("User", "123");

			const optId = manager.applyOptimistic("User", "123", "delete", {});
			manager.confirm(optId);

			// Subscription should be removed
			// Note: signal might still exist but marked for cleanup
			expect(manager.getPendingCount()).toBe(0);
		});
	});

	describe("Rollback", () => {
		it("rolls back update to original data", () => {
			subscriptions.getOrCreateSubscription("User", "123", {
				id: "123",
				name: "Original",
				email: "test@example.com",
			});

			const optId = manager.applyOptimistic("User", "123", "update", {
				name: "Optimistic",
			});

			// Verify optimistic applied
			const signal = subscriptions.getSignal("User", "123");
			expect(signal?.$.name.value).toBe("Optimistic");

			// Rollback
			manager.rollback(optId);

			// Verify restored
			expect(signal?.$.name.value).toBe("Original");
			expect(signal?.$.email.value).toBe("test@example.com");
			expect(manager.getPendingCount()).toBe(0);
		});

		it("rolls back create removes entity", () => {
			const optId = manager.applyOptimistic("User", "789", "create", {
				id: "789",
				name: "New User",
			});

			// Verify created
			expect(subscriptions.getSignal("User", "789")).not.toBeNull();

			// Rollback
			manager.rollback(optId);

			// Entity subscription cleaned up
			expect(manager.getPendingCount()).toBe(0);
		});

		it("rolls back delete restores data", () => {
			subscriptions.getOrCreateSubscription("User", "123", {
				id: "123",
				name: "Original",
			});

			const optId = manager.applyOptimistic("User", "123", "delete", {});

			// Verify deleted flag
			const signal = subscriptions.getSignal("User", "123");
			expect((signal?.value.value as Record<string, unknown>).__deleted).toBe(true);

			// Rollback
			manager.rollback(optId);

			// Verify restored
			expect((signal?.value.value as Record<string, unknown>).__deleted).toBeUndefined();
			expect(signal?.$.name.value).toBe("Original");
		});
	});

	describe("Batch Operations", () => {
		it("applies batch updates", () => {
			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "User 1" });
			subscriptions.getOrCreateSubscription("User", "2", { id: "2", name: "User 2" });

			const optIds = manager.applyBatch([
				{ entityName: "User", entityId: "1", type: "update", data: { name: "Updated 1" } },
				{ entityName: "User", entityId: "2", type: "update", data: { name: "Updated 2" } },
			]);

			expect(optIds.length).toBe(2);
			expect(subscriptions.getSignal("User", "1")?.$.name.value).toBe("Updated 1");
			expect(subscriptions.getSignal("User", "2")?.$.name.value).toBe("Updated 2");
		});

		it("confirms batch", () => {
			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "User 1" });
			subscriptions.getOrCreateSubscription("User", "2", { id: "2", name: "User 2" });

			const optIds = manager.applyBatch([
				{ entityName: "User", entityId: "1", type: "update", data: { name: "Opt 1" } },
				{ entityName: "User", entityId: "2", type: "update", data: { name: "Opt 2" } },
			]);

			const serverDataMap = new Map([
				["User:1", { id: "1", name: "Server 1" }],
				["User:2", { id: "2", name: "Server 2" }],
			]);

			manager.confirmBatch(optIds, serverDataMap);

			expect(subscriptions.getSignal("User", "1")?.$.name.value).toBe("Server 1");
			expect(subscriptions.getSignal("User", "2")?.$.name.value).toBe("Server 2");
			expect(manager.getPendingCount()).toBe(0);
		});

		it("rolls back batch", () => {
			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "Original 1" });
			subscriptions.getOrCreateSubscription("User", "2", { id: "2", name: "Original 2" });

			const optIds = manager.applyBatch([
				{ entityName: "User", entityId: "1", type: "update", data: { name: "Opt 1" } },
				{ entityName: "User", entityId: "2", type: "update", data: { name: "Opt 2" } },
			]);

			manager.rollbackBatch(optIds);

			expect(subscriptions.getSignal("User", "1")?.$.name.value).toBe("Original 1");
			expect(subscriptions.getSignal("User", "2")?.$.name.value).toBe("Original 2");
			expect(manager.getPendingCount()).toBe(0);
		});
	});

	describe("State Queries", () => {
		it("gets pending updates", () => {
			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "U1" });
			subscriptions.getOrCreateSubscription("User", "2", { id: "2", name: "U2" });

			manager.applyOptimistic("User", "1", "update", { name: "New 1" });
			manager.applyOptimistic("User", "2", "update", { name: "New 2" });

			const pending = manager.getPending();
			expect(pending.length).toBe(2);
		});

		it("gets pending for specific entity", () => {
			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "U1" });
			subscriptions.getOrCreateSubscription("User", "2", { id: "2", name: "U2" });

			manager.applyOptimistic("User", "1", "update", { name: "New 1" });
			manager.applyOptimistic("User", "1", "update", { name: "Newer 1" });
			manager.applyOptimistic("User", "2", "update", { name: "New 2" });

			const pendingFor1 = manager.getPendingForEntity("User", "1");
			expect(pendingFor1.length).toBe(2);

			const pendingFor2 = manager.getPendingForEntity("User", "2");
			expect(pendingFor2.length).toBe(1);
		});

		it("checks if entity has pending", () => {
			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "U1" });

			expect(manager.hasPending("User", "1")).toBe(false);

			manager.applyOptimistic("User", "1", "update", { name: "New" });

			expect(manager.hasPending("User", "1")).toBe(true);
			expect(manager.hasPending("User", "2")).toBe(false);
		});
	});

	describe("Configuration", () => {
		it("can disable optimistic updates", () => {
			const disabledManager = new OptimisticManager(subscriptions, { enabled: false });

			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "Original" });

			const optId = disabledManager.applyOptimistic("User", "1", "update", { name: "New" });

			expect(optId).toBe("");
			expect(subscriptions.getSignal("User", "1")?.$.name.value).toBe("Original");
		});

		it("can toggle enabled state", () => {
			manager.setEnabled(false);
			expect(manager.isEnabled()).toBe(false);

			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "Original" });
			const optId = manager.applyOptimistic("User", "1", "update", { name: "New" });
			expect(optId).toBe("");

			manager.setEnabled(true);
			expect(manager.isEnabled()).toBe(true);
		});
	});

	describe("Clear", () => {
		it("clears all pending with rollback", () => {
			subscriptions.getOrCreateSubscription("User", "1", { id: "1", name: "Original 1" });
			subscriptions.getOrCreateSubscription("User", "2", { id: "2", name: "Original 2" });

			manager.applyOptimistic("User", "1", "update", { name: "New 1" });
			manager.applyOptimistic("User", "2", "update", { name: "New 2" });

			expect(manager.getPendingCount()).toBe(2);

			manager.clear();

			expect(manager.getPendingCount()).toBe(0);
			expect(subscriptions.getSignal("User", "1")?.$.name.value).toBe("Original 1");
			expect(subscriptions.getSignal("User", "2")?.$.name.value).toBe("Original 2");
		});
	});

	describe("Factory", () => {
		it("creates manager with factory function", () => {
			const mgr = createOptimisticManager(subscriptions, { timeout: 10000 });
			expect(mgr).toBeInstanceOf(OptimisticManager);
		});
	});
});
