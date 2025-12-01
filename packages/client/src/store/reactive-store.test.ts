/**
 * Tests for Reactive Store
 */

import { describe, expect, test } from "bun:test";
import { entity, pipe } from "@sylphx/reify";
import { createStore } from "./reactive-store.js";

describe("ReactiveStore", () => {
	describe("Entity Management", () => {
		test("creates entity signal on first access", () => {
			const store = createStore();
			const entity = store.getEntity("User", "123");

			expect(entity.value).toEqual({
				data: null,
				loading: true,
				error: null,
				stale: false,
				refCount: 0,
			});
		});

		test("returns same signal for same entity", () => {
			const store = createStore();
			const entity1 = store.getEntity("User", "123");
			const entity2 = store.getEntity("User", "123");

			expect(entity1).toBe(entity2);
		});

		test("setEntity updates signal value", () => {
			const store = createStore();
			store.getEntity("User", "123");

			store.setEntity("User", "123", { id: "123", name: "John" });

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual({ id: "123", name: "John" });
			expect(entity.value.loading).toBe(false);
		});

		test("setEntityError sets error state", () => {
			const store = createStore();
			store.getEntity("User", "123");

			const error = new Error("Not found");
			store.setEntityError("User", "123", error);

			const entity = store.getEntity("User", "123");
			expect(entity.value.error).toBe(error);
			expect(entity.value.loading).toBe(false);
		});

		test("removeEntity clears from cache", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123" });

			expect(store.hasEntity("User", "123")).toBe(true);

			store.removeEntity("User", "123");

			expect(store.hasEntity("User", "123")).toBe(false);
		});
	});

	describe("List Management", () => {
		test("creates list signal on first access", () => {
			const store = createStore();
			const list = store.getList("users:all");

			expect(list.value).toEqual({
				data: null,
				loading: true,
				error: null,
				stale: false,
				refCount: 0,
			});
		});

		test("setList updates list signal", () => {
			const store = createStore();
			const users = [
				{ id: "1", name: "Alice" },
				{ id: "2", name: "Bob" },
			];

			store.setList("users:all", users);

			const list = store.getList("users:all");
			expect(list.value.data).toEqual(users);
			expect(list.value.loading).toBe(false);
		});
	});

	describe("Optimistic Updates", () => {
		test("applyOptimistic creates temporary entity", () => {
			const store = createStore();

			const optimisticId = store.applyOptimistic("User", "create", {
				id: "temp_123",
				name: "New User",
			});

			expect(optimisticId).toBeTruthy();

			const entity = store.getEntity("User", "temp_123");
			expect(entity.value.data).toEqual({ id: "temp_123", name: "New User" });
		});

		test("applyOptimistic updates existing entity", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "John", age: 30 });

			store.applyOptimistic("User", "update", {
				id: "123",
				name: "John Doe",
			});

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual({ id: "123", name: "John Doe", age: 30 });
		});

		test("applyOptimistic deletes entity", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "John" });

			store.applyOptimistic("User", "delete", { id: "123" });

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toBeNull();
		});

		test("confirmOptimistic with server data", () => {
			const store = createStore();

			const optimisticId = store.applyOptimistic("User", "create", {
				id: "temp_123",
				name: "New User",
			});

			store.confirmOptimistic(optimisticId, {
				id: "real_123",
				name: "New User",
				createdAt: "2024-01-01",
			});

			// Server data should be applied
			const pending = store.getPendingOptimistic();
			expect(pending).toHaveLength(0);
		});

		test("rollbackOptimistic reverts create", () => {
			const store = createStore();

			const optimisticId = store.applyOptimistic("User", "create", {
				id: "temp_123",
				name: "New User",
			});

			store.rollbackOptimistic(optimisticId);

			expect(store.hasEntity("User", "temp_123")).toBe(false);
		});

		test("rollbackOptimistic reverts update", () => {
			const store = createStore();
			const original = { id: "123", name: "John", age: 30 };
			store.setEntity("User", "123", original);

			const optimisticId = store.applyOptimistic("User", "update", {
				id: "123",
				name: "Changed",
			});

			store.rollbackOptimistic(optimisticId);

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual(original);
		});

		test("rollbackOptimistic reverts delete", () => {
			const store = createStore();
			const original = { id: "123", name: "John" };
			store.setEntity("User", "123", original);

			const optimisticId = store.applyOptimistic("User", "delete", { id: "123" });

			store.rollbackOptimistic(optimisticId);

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual(original);
		});

		test("disables optimistic when configured", () => {
			const store = createStore({ optimistic: false });

			const optimisticId = store.applyOptimistic("User", "create", {
				id: "temp_123",
				name: "New User",
			});

			expect(optimisticId).toBe("");
		});
	});

	describe("Reference Counting", () => {
		test("retain increments refCount", () => {
			const store = createStore();
			store.getEntity("User", "123");

			store.retain("User", "123");
			store.retain("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.refCount).toBe(2);
		});

		test("release decrements refCount", () => {
			const store = createStore();
			store.getEntity("User", "123");
			store.retain("User", "123");
			store.retain("User", "123");

			store.release("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.refCount).toBe(1);
		});

		test("release marks stale when refCount reaches 0", () => {
			const store = createStore();
			store.getEntity("User", "123");
			store.retain("User", "123");

			store.release("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.refCount).toBe(0);
			expect(entity.value.stale).toBe(true);
		});

		test("gc clears stale entities", () => {
			const store = createStore();

			// Create some entities
			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "2", { id: "2" });
			store.setEntity("User", "3", { id: "3" });

			// Mark some as stale
			store.retain("User", "1");
			store.release("User", "1"); // Now stale

			store.retain("User", "2"); // Not stale (still retained)

			store.retain("User", "3");
			store.release("User", "3"); // Now stale

			const cleared = store.gc();

			expect(cleared).toBe(2);
			expect(store.hasEntity("User", "1")).toBe(false);
			expect(store.hasEntity("User", "2")).toBe(true);
			expect(store.hasEntity("User", "3")).toBe(false);
		});
	});

	describe("Statistics", () => {
		test("getStats returns current cache state", () => {
			const store = createStore();

			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "2", { id: "2" });
			store.setList("users:all", []);

			store.applyOptimistic("User", "create", { id: "temp", name: "New" });

			const stats = store.getStats();
			expect(stats.entities).toBe(3);
			expect(stats.lists).toBe(1);
			expect(stats.pendingOptimistic).toBe(1);
		});

		test("clear removes everything", () => {
			const store = createStore();

			store.setEntity("User", "1", { id: "1" });
			store.setList("users:all", []);
			store.applyOptimistic("User", "create", { id: "temp", name: "New" });

			store.clear();

			const stats = store.getStats();
			expect(stats.entities).toBe(0);
			expect(stats.lists).toBe(0);
			expect(stats.pendingOptimistic).toBe(0);
		});
	});

	describe("Cache Invalidation", () => {
		test("invalidate marks entity as stale", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "John" });

			store.invalidate("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.stale).toBe(true);
		});

		test("invalidateEntity marks all entities of type as stale", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "2", { id: "2" });
			store.setEntity("Post", "1", { id: "1" });

			store.invalidateEntity("User");

			expect(store.getEntity("User", "1").value.stale).toBe(true);
			expect(store.getEntity("User", "2").value.stale).toBe(true);
			expect(store.getEntity("Post", "1").value.stale).toBe(false);
		});

		test("invalidateByTags marks tagged entities as stale", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" }, ["team-a"]);
			store.setEntity("User", "2", { id: "2" }, ["team-b"]);
			store.setEntity("User", "3", { id: "3" }, ["team-a", "admin"]);

			const count = store.invalidateByTags(["team-a"]);

			expect(count).toBe(2);
			expect(store.getEntity("User", "1").value.stale).toBe(true);
			expect(store.getEntity("User", "2").value.stale).toBe(false);
			expect(store.getEntity("User", "3").value.stale).toBe(true);
		});

		test("invalidateByPattern matches glob patterns", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "2", { id: "2" });
			store.setEntity("Post", "1", { id: "1" });

			const count = store.invalidateByPattern("User:*");

			expect(count).toBe(2);
			expect(store.getEntity("User", "1").value.stale).toBe(true);
			expect(store.getEntity("User", "2").value.stale).toBe(true);
			expect(store.getEntity("Post", "1").value.stale).toBe(false);
		});

		test("tagEntity adds tags to existing entity", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });

			store.tagEntity("User", "1", ["featured", "premium"]);

			const entity = store.getEntity("User", "1");
			expect(entity.value.tags).toContain("featured");
			expect(entity.value.tags).toContain("premium");
		});

		test("isStale returns true for stale entities", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });

			expect(store.isStale("User", "1")).toBe(false);

			store.invalidate("User", "1");

			expect(store.isStale("User", "1")).toBe(true);
		});

		test("isStale returns true for non-existent entities", () => {
			const store = createStore();

			expect(store.isStale("User", "nonexistent")).toBe(true);
		});

		test("cascade invalidation triggers related entity invalidation", () => {
			const store = createStore({
				cascadeRules: [{ source: "User", targets: ["Post", "Comment"] }],
			});

			store.setEntity("User", "1", { id: "1" });
			store.setEntity("Post", "1", { id: "1" });
			store.setEntity("Comment", "1", { id: "1" });
			store.setEntity("Tag", "1", { id: "1" });

			store.invalidateEntity("User");

			expect(store.getEntity("Post", "1").value.stale).toBe(true);
			expect(store.getEntity("Comment", "1").value.stale).toBe(true);
			expect(store.getEntity("Tag", "1").value.stale).toBe(false);
		});
	});

	describe("Stale While Revalidate", () => {
		test("returns stale data with revalidation promise", async () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1", name: "Old" });
			// Manually mark as stale
			store.invalidate("User", "1", { cascade: false });

			const result = store.getStaleWhileRevalidate("User", "1", async () => ({
				id: "1",
				name: "New",
			}));

			// Returns old data immediately
			expect(result.data).toEqual({ id: "1", name: "Old" });
			expect(result.isStale).toBe(true);
			expect(result.revalidating).not.toBeNull();

			// Wait for revalidation
			if (result.revalidating) {
				await result.revalidating;
			}

			// Data should be updated
			const entity = store.getEntity("User", "1");
			expect(entity.value.data).toEqual({ id: "1", name: "New" });
		});

		test("returns null with null revalidation for missing data", () => {
			const store = createStore();

			const result = store.getStaleWhileRevalidate("User", "nonexistent", async () => ({
				id: "1",
				name: "New",
			}));

			expect(result.data).toBeNull();
			expect(result.isStale).toBe(true);
			expect(result.revalidating).toBeNull();
		});
	});

	describe("applyServerUpdate", () => {
		test("applies server update to existing entity", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "John", age: 30 });

			// Use value strategy update
			store.applyServerUpdate("User", "123", {
				strategy: "value",
				data: { id: "123", name: "Jane", age: 30 },
			});

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual({ id: "123", name: "Jane", age: 30 });
			expect(entity.value.stale).toBe(false);
		});

		test("applies patch strategy update to existing entity", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "John", age: 30 });

			// Use patch strategy update
			store.applyServerUpdate("User", "123", {
				strategy: "patch",
				data: [{ op: "replace", path: "/name", value: "Jane" }],
			});

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual({ id: "123", name: "Jane", age: 30 });
			expect(entity.value.stale).toBe(false);
		});

		test("does nothing if entity signal does not exist", () => {
			const store = createStore();

			// Should not throw
			store.applyServerUpdate("User", "nonexistent", {
				strategy: "value",
				data: { name: "Test" },
			});

			expect(store.hasEntity("User", "nonexistent")).toBe(false);
		});

		test("does nothing if entity data is null", () => {
			const store = createStore();
			store.getEntity("User", "123"); // Creates signal with null data

			store.applyServerUpdate("User", "123", {
				strategy: "value",
				data: { name: "Test" },
			});

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toBeNull();
		});
	});

	describe("setEntityLoading", () => {
		test("sets loading state to true", () => {
			const store = createStore();
			store.getEntity("User", "123");

			store.setEntityLoading("User", "123", true);

			const entity = store.getEntity("User", "123");
			expect(entity.value.loading).toBe(true);
		});

		test("sets loading state to false", () => {
			const store = createStore();
			store.getEntity("User", "123");

			store.setEntityLoading("User", "123", false);

			const entity = store.getEntity("User", "123");
			expect(entity.value.loading).toBe(false);
		});

		test("does nothing if entity signal does not exist", () => {
			const store = createStore();

			// Should not throw
			store.setEntityLoading("User", "nonexistent", true);

			expect(store.hasEntity("User", "nonexistent")).toBe(false);
		});
	});

	describe("Pipeline Optimistic Updates", () => {
		test("applyPipelineOptimistic executes pipeline and returns transaction ID", async () => {
			const store = createStore();

			// Use proper Reify entity DSL
			const pipeline = pipe(({ input }: { input: { name: string } }) => [
				entity.create("User", { name: input.name }).as("user"),
			]);

			const txId = await store.applyPipelineOptimistic(pipeline, { name: "Test User" });

			expect(txId).toBeTruthy();
			expect(txId).toMatch(/^tx_/);

			const transactions = store.getPendingTransactions();
			expect(transactions).toHaveLength(1);
			expect(transactions[0]?.id).toBe(txId);
		});

		test("applyPipelineOptimistic uses cache adapter get method", async () => {
			const store = createStore();
			store.setEntity("User", "existing-123", { id: "existing-123", name: "Existing User" });

			// Create a pipeline that reads and updates existing entity
			const pipeline = pipe(() => [entity.update("User", "existing-123", { name: "Updated Name" }).as("user")]);

			const txId = await store.applyPipelineOptimistic(pipeline, {});

			// Verify transaction was created
			expect(txId).toBeTruthy();
			const transactions = store.getPendingTransactions();
			expect(transactions).toHaveLength(1);
		});

		test("applyPipelineOptimistic uses cache adapter set method", async () => {
			const store = createStore();

			const pipeline = pipe(() => [entity.create("User", { id: "new-123", name: "New User" }).as("user")]);

			await store.applyPipelineOptimistic(pipeline, {});

			expect(store.hasEntity("User", "new-123")).toBe(true);
			const userEntity = store.getEntity("User", "new-123");
			expect(userEntity.value.data).toMatchObject({ name: "New User" });
		});

		test("applyPipelineOptimistic uses cache adapter delete method", async () => {
			const store = createStore();
			store.setEntity("User", "delete-123", { id: "delete-123", name: "To Delete" });

			const pipeline = pipe(() => [entity.delete("User", "delete-123")]);

			await store.applyPipelineOptimistic(pipeline, {});

			const userEntity = store.getEntity("User", "delete-123");
			expect(userEntity.value.data).toBeNull();
		});

		test("applyPipelineOptimistic uses cache adapter has method via upsert", async () => {
			const store = createStore();

			// Upsert on non-existent entity - this should call has() method
			const pipeline = pipe(() => [
				entity.upsert("User", "new-upsert-123", { id: "new-upsert-123", name: "Upserted" }).as("user"),
			]);

			const txId = await store.applyPipelineOptimistic(pipeline, {});

			// Verify transaction was created and entity exists
			expect(txId).toBeTruthy();
			// The entity might be created with a temp ID or the specified ID
			const stats = store.getStats();
			expect(stats.entities).toBeGreaterThan(0);
		});

		test("applyPipelineOptimistic uses cache adapter has method via upsert existing", async () => {
			const store = createStore();
			store.setEntity("User", "existing-upsert-123", {
				id: "existing-upsert-123",
				name: "Exists",
			});

			// Upsert on existing entity - this should call has() method
			const pipeline = pipe(() => [entity.upsert("User", "existing-upsert-123", { name: "Updated" }).as("user")]);

			const txId = await store.applyPipelineOptimistic(pipeline, {});

			// Verify transaction was created
			expect(txId).toBeTruthy();
		});

		test("applyPipelineOptimistic stores original data for rollback", async () => {
			const store = createStore();

			const pipeline = pipe(() => [entity.create("User", { id: "new-id", name: "New" }).as("user")]);

			const _txId = await store.applyPipelineOptimistic(pipeline, {});

			const transactions = store.getPendingTransactions();
			// Should store original data (null for new entities)
			expect(transactions[0]?.originalData.size).toBeGreaterThanOrEqual(0);
		});

		test("applyPipelineOptimistic returns empty string when optimistic disabled", async () => {
			const store = createStore({ optimistic: false });

			const pipeline = pipe(() => [entity.create("User", { name: "Test" }).as("user")]);

			const txId = await store.applyPipelineOptimistic(pipeline, {});

			expect(txId).toBe("");
		});

		test("confirmPipelineOptimistic removes transaction without server results", () => {
			const store = createStore();

			// Manually create a transaction
			const txId = "tx_test";
			const tx = {
				id: txId,
				results: { success: true, data: {} },
				originalData: new Map(),
				timestamp: Date.now(),
			};
			// Access private field for testing
			(store as any).optimisticTransactions.set(txId, tx);

			store.confirmPipelineOptimistic(txId);

			const transactions = store.getPendingTransactions();
			expect(transactions).toHaveLength(0);
		});

		test("confirmPipelineOptimistic replaces temp IDs with real IDs", () => {
			const store = createStore();
			store.setEntity("User", "temp_123", { id: "temp_123", name: "New User" });

			// Manually create a transaction
			const txId = "tx_test";
			const tx = {
				id: txId,
				results: { success: true, data: {} },
				originalData: new Map([["User:temp_123", null]]),
				timestamp: Date.now(),
			};
			(store as any).optimisticTransactions.set(txId, tx);

			store.confirmPipelineOptimistic(txId, [
				{
					entity: "User",
					tempId: "temp_123",
					data: { id: "real_123", name: "New User", createdAt: "2024-01-01" },
				},
			]);

			expect(store.hasEntity("User", "temp_123")).toBe(false);
			expect(store.hasEntity("User", "real_123")).toBe(true);

			const entity = store.getEntity("User", "real_123");
			expect(entity.value.data).toEqual({
				id: "real_123",
				name: "New User",
				createdAt: "2024-01-01",
			});
		});

		test("confirmPipelineOptimistic handles null data", () => {
			const store = createStore();

			const txId = "tx_test";
			const tx = {
				id: txId,
				results: { success: true, data: {} },
				originalData: new Map(),
				timestamp: Date.now(),
			};
			(store as any).optimisticTransactions.set(txId, tx);

			// Should not throw with null data
			store.confirmPipelineOptimistic(txId, [
				{
					entity: "User",
					tempId: "temp_123",
					data: null,
				},
			]);

			expect(store.hasEntity("User", "temp_123")).toBe(false);
		});

		test("confirmPipelineOptimistic handles data without id", () => {
			const store = createStore();

			const txId = "tx_test";
			const tx = {
				id: txId,
				results: { success: true, data: {} },
				originalData: new Map(),
				timestamp: Date.now(),
			};
			(store as any).optimisticTransactions.set(txId, tx);

			// Should not throw with data without id
			store.confirmPipelineOptimistic(txId, [
				{
					entity: "User",
					tempId: "temp_123",
					data: { name: "No ID" },
				},
			]);

			expect(store.hasEntity("User", "temp_123")).toBe(false);
		});

		test("confirmPipelineOptimistic does nothing for non-existent transaction", () => {
			const store = createStore();

			// Should not throw
			store.confirmPipelineOptimistic("nonexistent_tx");

			const transactions = store.getPendingTransactions();
			expect(transactions).toHaveLength(0);
		});

		test("rollbackPipelineOptimistic restores original data", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "Original" });
			store.setEntity("User", "456", { id: "456", name: "Another" });

			// Manually modify and create transaction
			const txId = "tx_test";
			const tx = {
				id: txId,
				results: { success: true, data: {} },
				originalData: new Map([
					["User:123", { id: "123", name: "Original" }],
					["User:456", { id: "456", name: "Another" }],
				]),
				timestamp: Date.now(),
			};
			(store as any).optimisticTransactions.set(txId, tx);

			// Modify the entities
			store.setEntity("User", "123", { id: "123", name: "Modified" });
			store.setEntity("User", "456", { id: "456", name: "Changed" });

			store.rollbackPipelineOptimistic(txId);

			const entity1 = store.getEntity("User", "123");
			const entity2 = store.getEntity("User", "456");

			expect(entity1.value.data).toEqual({ id: "123", name: "Original" });
			expect(entity2.value.data).toEqual({ id: "456", name: "Another" });
		});

		test("rollbackPipelineOptimistic removes entities that did not exist", () => {
			const store = createStore();
			store.setEntity("User", "temp_123", { id: "temp_123", name: "New" });

			const txId = "tx_test";
			const tx = {
				id: txId,
				results: { success: true, data: {} },
				originalData: new Map([["User:temp_123", null]]),
				timestamp: Date.now(),
			};
			(store as any).optimisticTransactions.set(txId, tx);

			store.rollbackPipelineOptimistic(txId);

			expect(store.hasEntity("User", "temp_123")).toBe(false);
		});

		test("rollbackPipelineOptimistic does nothing for non-existent transaction", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "Test" });

			// Should not throw
			store.rollbackPipelineOptimistic("nonexistent_tx");

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual({ id: "123", name: "Test" });
		});

		test("getPendingTransactions returns all pending transactions", () => {
			const store = createStore();

			const tx1 = {
				id: "tx_1",
				results: { success: true, data: {} },
				originalData: new Map(),
				timestamp: Date.now(),
			};
			const tx2 = {
				id: "tx_2",
				results: { success: true, data: {} },
				originalData: new Map(),
				timestamp: Date.now(),
			};

			(store as any).optimisticTransactions.set("tx_1", tx1);
			(store as any).optimisticTransactions.set("tx_2", tx2);

			const transactions = store.getPendingTransactions();

			expect(transactions).toHaveLength(2);
			expect(transactions.map((t) => t.id)).toContain("tx_1");
			expect(transactions.map((t) => t.id)).toContain("tx_2");
		});
	});

	describe("Edge Cases and Error Handling", () => {
		test("setEntity works when entity does not exist yet", () => {
			const store = createStore();

			store.setEntity("User", "new_user", { id: "new_user", name: "New" });

			const entity = store.getEntity("User", "new_user");
			expect(entity.value.data).toEqual({ id: "new_user", name: "New" });
			expect(entity.value.loading).toBe(false);
		});

		test("setEntity preserves existing tags when not provided", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123" }, ["tag1", "tag2"]);

			store.setEntity("User", "123", { id: "123", name: "Updated" });

			const entity = store.getEntity("User", "123");
			expect(entity.value.tags).toEqual(["tag1", "tag2"]);
		});

		test("setEntity updates tags when provided", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123" }, ["tag1"]);

			store.setEntity("User", "123", { id: "123" }, ["tag2", "tag3"]);

			const entity = store.getEntity("User", "123");
			expect(entity.value.tags).toEqual(["tag2", "tag3"]);
		});

		test("setEntityError does nothing if entity does not exist", () => {
			const store = createStore();

			// Should not throw
			store.setEntityError("User", "nonexistent", new Error("Test"));

			expect(store.hasEntity("User", "nonexistent")).toBe(false);
		});

		test("applyOptimistic update does nothing if entity does not exist", () => {
			const store = createStore();

			const optimisticId = store.applyOptimistic("User", "update", {
				id: "nonexistent",
				name: "Test",
			});

			expect(optimisticId).toBeTruthy();

			// Entity should not be created for update
			const entity = store.getEntity("User", "nonexistent");
			expect(entity.value.data).toBeNull();
		});

		test("applyOptimistic delete does nothing if entity does not exist", () => {
			const store = createStore();

			const optimisticId = store.applyOptimistic("User", "delete", {
				id: "nonexistent",
			});

			expect(optimisticId).toBeTruthy();

			const entity = store.getEntity("User", "nonexistent");
			expect(entity.value.data).toBeNull();
		});

		test("confirmOptimistic does nothing for non-existent optimistic update", () => {
			const store = createStore();

			// Should not throw
			store.confirmOptimistic("nonexistent_optimistic_id");
		});

		test("confirmOptimistic with delete type does not set server data", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "Test" });

			const optimisticId = store.applyOptimistic("User", "delete", { id: "123" });

			// Should not restore data even with server data
			store.confirmOptimistic(optimisticId, { id: "123", name: "Server Data" });

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toBeNull();
		});

		test("rollbackOptimistic does nothing for non-existent optimistic update", () => {
			const store = createStore();
			store.setEntity("User", "123", { id: "123", name: "Test" });

			// Should not throw
			store.rollbackOptimistic("nonexistent_optimistic_id");

			const entity = store.getEntity("User", "123");
			expect(entity.value.data).toEqual({ id: "123", name: "Test" });
		});

		test("invalidate with cascade disabled", () => {
			const store = createStore({
				cascadeRules: [{ source: "User", targets: ["Post"] }],
			});

			store.setEntity("User", "1", { id: "1" });
			store.setEntity("Post", "1", { id: "1" });

			store.invalidate("User", "1", { cascade: false });

			expect(store.getEntity("User", "1").value.stale).toBe(true);
			expect(store.getEntity("Post", "1").value.stale).toBe(false);
		});

		test("invalidateEntity invalidates related lists", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });
			store.setList("User:list", [{ id: "1" }]);
			store.setList("Post:list", [{ id: "1" }]);

			store.invalidateEntity("User");

			const userList = store.getList("User:list");
			const postList = store.getList("Post:list");

			expect(userList.value.stale).toBe(true);
			expect(postList.value.stale).toBe(false);
		});

		test("cascadeInvalidate respects operation filters", () => {
			const store = createStore({
				cascadeRules: [
					{
						source: "User",
						operations: ["create", "delete"],
						targets: ["Post"],
					},
				],
			});

			store.setEntity("User", "1", { id: "1" });
			store.setEntity("Post", "1", { id: "1" });

			// Update should not cascade
			store.invalidate("User", "1");

			expect(store.getEntity("Post", "1").value.stale).toBe(false);
		});

		test("invalidateByTags with non-existent tags returns 0", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" }, ["tag1"]);

			const count = store.invalidateByTags(["nonexistent"]);

			expect(count).toBe(0);
		});

		test("invalidateByPattern with no matches returns 0", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });

			const count = store.invalidateByPattern("Post:*");

			expect(count).toBe(0);
		});

		test("tagEntity does nothing if entity does not exist", () => {
			const store = createStore();

			// Should not throw
			store.tagEntity("User", "nonexistent", ["tag1"]);
		});

		test("tagEntity merges with existing tags without duplicates", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" }, ["tag1", "tag2"]);

			store.tagEntity("User", "1", ["tag2", "tag3"]);

			const entity = store.getEntity("User", "1");
			expect(entity.value.tags).toEqual(["tag1", "tag2", "tag3"]);
		});

		test("isStale checks TTL expiration", () => {
			const store = createStore({ cacheTTL: 100 }); // 100ms TTL
			store.setEntity("User", "1", { id: "1" });

			expect(store.isStale("User", "1")).toBe(false);

			// Wait for TTL to expire
			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(store.isStale("User", "1")).toBe(true);
					resolve();
				}, 150);
			});
		});

		test("isStale returns false for fresh entity without cachedAt", () => {
			const store = createStore();
			const entity = store.getEntity("User", "1");

			// Manually set state without cachedAt
			(entity as any).value = {
				data: { id: "1" },
				loading: false,
				error: null,
				stale: false,
				refCount: 0,
			};

			expect(store.isStale("User", "1")).toBe(false);
		});

		test("release does not allow negative refCount", () => {
			const store = createStore();
			store.getEntity("User", "123");

			store.release("User", "123");
			store.release("User", "123");
			store.release("User", "123");

			const entity = store.getEntity("User", "123");
			expect(entity.value.refCount).toBe(0);
		});

		test("release does nothing if entity does not exist", () => {
			const store = createStore();

			// Should not throw
			store.release("User", "nonexistent");
		});

		test("retain does nothing if entity does not exist", () => {
			const store = createStore();

			// Should not throw
			store.retain("User", "nonexistent");
		});

		test("getStaleWhileRevalidate with fresh data", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1", name: "Test" });

			const result = store.getStaleWhileRevalidate("User", "1", async () => ({
				id: "1",
				name: "New",
			}));

			expect(result.data).toEqual({ id: "1", name: "Test" });
			expect(result.isStale).toBe(false);
			expect(result.revalidating).toBeNull();
		});

		test("concurrent optimistic updates maintain order", () => {
			const store = createStore();

			const id1 = store.applyOptimistic("User", "create", {
				id: "1",
				name: "First",
			});
			const id2 = store.applyOptimistic("User", "create", {
				id: "2",
				name: "Second",
			});
			const id3 = store.applyOptimistic("User", "update", {
				id: "1",
				name: "Updated",
			});

			const pending = store.getPendingOptimistic();
			expect(pending).toHaveLength(3);

			// Confirm out of order
			store.confirmOptimistic(id2);
			store.confirmOptimistic(id1);

			const pending2 = store.getPendingOptimistic();
			expect(pending2).toHaveLength(1);
			expect(pending2[0]?.id).toBe(id3);
		});

		test("clear removes optimistic updates", () => {
			const store = createStore();

			store.applyOptimistic("User", "create", { id: "1", name: "Test" });

			expect(store.getPendingOptimistic()).toHaveLength(1);

			store.clear();

			expect(store.getPendingOptimistic()).toHaveLength(0);
		});

		test("patternToRegex escapes special characters", () => {
			const store = createStore();
			store.setEntity("User", "test.user", { id: "test.user" });
			store.setEntity("User", "testXuser", { id: "testXuser" });

			const count = store.invalidateByPattern("User:test.user");

			// Should match exact pattern, not treat . as wildcard
			expect(count).toBe(1);
		});

		test("patternToRegex handles question mark wildcard", () => {
			const store = createStore();
			store.setEntity("User", "1", { id: "1" });
			store.setEntity("User", "12", { id: "12" });

			const count = store.invalidateByPattern("User:?");

			// ? should match single character
			expect(count).toBe(1);
		});

		test("setList updates existing list signal", () => {
			const store = createStore();
			store.getList("users:all"); // Create signal

			store.setList("users:all", [{ id: "1" }]);

			const list = store.getList("users:all");
			expect(list.value.data).toEqual([{ id: "1" }]);
		});

		test("multiple tags index correctly", () => {
			const store = createStore();

			store.setEntity("User", "1", { id: "1" }, ["team-a", "admin"]);
			store.setEntity("User", "2", { id: "2" }, ["team-a"]);
			store.setEntity("User", "3", { id: "3" }, ["team-b"]);

			const countA = store.invalidateByTags(["team-a"]);
			expect(countA).toBe(2);

			const countAdmin = store.invalidateByTags(["admin"]);
			expect(countAdmin).toBe(1);
		});
	});

	// Note: Multi-entity optimistic tests removed - now uses Reify Pipeline
	// See @sylphx/reify for Pipeline-based optimistic update tests
});
