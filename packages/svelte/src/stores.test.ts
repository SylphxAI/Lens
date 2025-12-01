/**
 * Tests for Svelte Stores
 */

import { describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import { lazyQuery, mutation, query } from "./stores.js";

// =============================================================================
// Mock QueryResult
// =============================================================================

function createMockQueryResult<T>(initialData: T | null = null) {
	const subscribers = new Set<(value: T) => void>();
	let currentData = initialData;
	let pendingResolvers: Array<{ resolve: (v: T) => void; reject: (e: Error) => void }> = [];
	let resolvedValue: T | null = null;
	let rejectedError: Error | null = null;
	let allowMultipleResolutions = false;

	const result = {
		// Promise-like - called each time .then is invoked
		then: <R1, R2>(
			onFulfilled?: ((value: T) => R1) | null,
			onRejected?: ((err: Error) => R2) | null,
		): Promise<R1 | R2> => {
			// If already resolved/rejected and not allowing multiple, return immediately
			if (!allowMultipleResolutions && resolvedValue !== null) {
				return Promise.resolve(onFulfilled ? onFulfilled(resolvedValue) : (resolvedValue as unknown as R1));
			}
			if (!allowMultipleResolutions && rejectedError !== null) {
				if (onRejected) {
					return Promise.resolve(onRejected(rejectedError));
				}
				return Promise.reject(rejectedError);
			}

			// Otherwise wait for resolution
			return new Promise<R1 | R2>((resolve, reject) => {
				pendingResolvers.push({
					resolve: (value: T) => {
						resolve(onFulfilled ? onFulfilled(value) : (value as unknown as R1));
					},
					reject: (err: Error) => {
						if (onRejected) {
							resolve(onRejected(err));
						} else {
							reject(err);
						}
					},
				});
			});
		},
		// Subscribable
		subscribe: (callback: (value: T) => void) => {
			subscribers.add(callback);
			if (currentData !== null) {
				callback(currentData);
			}
			return () => {
				subscribers.delete(callback);
			};
		},
		// Test helpers
		_resolve: (value: T) => {
			currentData = value;
			resolvedValue = value;
			rejectedError = null;
			for (const { resolve } of pendingResolvers) {
				resolve(value);
			}
			pendingResolvers = [];
			for (const cb of subscribers) cb(value);
		},
		_reject: (err: Error) => {
			rejectedError = err;
			resolvedValue = null;
			for (const { reject } of pendingResolvers) {
				reject(err);
			}
			pendingResolvers = [];
		},
		_reset: () => {
			resolvedValue = null;
			rejectedError = null;
			pendingResolvers = [];
			allowMultipleResolutions = true;
		},
	};

	return result;
}

// =============================================================================
// Tests
// =============================================================================

describe("query()", () => {
	test("creates a readable store with initial loading state", () => {
		const mockResult = createMockQueryResult<{ id: string; name: string }>();
		const store = query(mockResult as never);
		const value = get(store);

		expect(value.loading).toBe(true);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("updates store when query resolves", async () => {
		const mockResult = createMockQueryResult<{ id: string; name: string }>();
		const store = query(mockResult as never);

		// Subscribe to trigger the query
		const unsubscribe = store.subscribe(() => {});

		// Resolve the query
		mockResult._resolve({ id: "123", name: "John" });

		// Wait for async update
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.data).toEqual({ id: "123", name: "John" });

		unsubscribe();
	});

	test("handles query errors", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never);

		// Subscribe to trigger the query
		const unsubscribe = store.subscribe(() => {});

		// Reject the query
		mockResult._reject(new Error("Network error"));

		// Wait for async update
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("Network error");
		expect(value.data).toBe(null);

		unsubscribe();
	});

	test("skips query when skip option is true", () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never, { skip: true });
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
	});

	test("handles null query input", () => {
		const store = query(null);
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("handles undefined query input", () => {
		const store = query(undefined);
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("handles query accessor function returning null", () => {
		const store = query(() => null);
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("handles query accessor function returning query", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(() => mockResult as never);

		const unsubscribe = store.subscribe(() => {});

		mockResult._resolve({ id: "456" });
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.data).toEqual({ id: "456" });

		unsubscribe();
	});

	test("refetch reloads the query", async () => {
		const mockResult = createMockQueryResult<{ id: string; name: string }>();
		const store = query(mockResult as never);

		// Subscribe to trigger the query
		const values: Array<{ data: any; loading: boolean }> = [];
		const unsubscribe = store.subscribe((v) => {
			values.push({ data: v.data, loading: v.loading });
		});

		// Initial resolve
		mockResult._resolve({ id: "123", name: "John" });
		await new Promise((r) => setTimeout(r, 10));

		expect(get(store).data).toEqual({ id: "123", name: "John" });

		// Reset mock to allow re-execution
		mockResult._reset();

		// Refetch should set loading and re-execute
		store.refetch();

		// Wait a tick for loading state to propagate
		await new Promise((r) => setTimeout(r, 5));

		// Resolve again with new data
		mockResult._resolve({ id: "456", name: "Jane" });
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.data).toEqual({ id: "456", name: "Jane" });

		unsubscribe();
	});

	test("refetch handles errors", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never);

		const unsubscribe = store.subscribe(() => {});

		// Initial resolve
		mockResult._resolve({ id: "123" });
		await new Promise((r) => setTimeout(r, 10));

		// Reset mock to allow re-execution
		mockResult._reset();

		// Refetch and reject
		store.refetch();
		await new Promise((r) => setTimeout(r, 5));
		mockResult._reject(new Error("Refetch failed"));
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("Refetch failed");
		expect(value.data).toBe(null);

		unsubscribe();
	});

	test("refetch handles non-Error rejections", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never);

		const unsubscribe = store.subscribe(() => {});

		// Initial resolve
		mockResult._resolve({ id: "123" });
		await new Promise((r) => setTimeout(r, 10));

		// Reset mock to allow re-execution
		mockResult._reset();

		// Refetch and reject with non-Error
		store.refetch();
		await new Promise((r) => setTimeout(r, 5));
		mockResult._reject("string error" as never);
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("string error");
		expect(value.data).toBe(null);

		unsubscribe();
	});

	test("handles non-Error initial rejections", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never);

		const unsubscribe = store.subscribe(() => {});

		// Reject with non-Error (e.g., string)
		mockResult._reject("string error" as never);
		await new Promise((r) => setTimeout(r, 10));

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("string error");
		expect(value.data).toBe(null);

		unsubscribe();
	});

	test("subscription cleanup prevents updates after unsubscribe", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never);
		let updateCount = 0;

		const unsubscribe = store.subscribe(() => {
			updateCount++;
		});

		// Initial subscription triggers
		expect(updateCount).toBe(1);

		// Unsubscribe
		unsubscribe();

		// Resolve after unsubscribe
		mockResult._resolve({ id: "123" });
		await new Promise((r) => setTimeout(r, 10));

		// Should not have triggered additional updates
		expect(updateCount).toBe(1);
	});

	test("refetch does nothing if store has no active subscription", () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = query(mockResult as never);

		// Refetch without subscribing - should not throw
		expect(() => store.refetch()).not.toThrow();
	});
});

describe("mutation()", () => {
	test("creates a store with initial idle state", () => {
		const mutationFn = async (_input: { title: string }) => ({
			data: { id: "1", title: "Test" },
		});
		const store = mutation(mutationFn);
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("shows loading state during mutation", async () => {
		let resolvePromise: (value: { data: { id: string } }) => void;
		const mutationFn = (_input: { title: string }) =>
			new Promise<{ data: { id: string } }>((resolve) => {
				resolvePromise = resolve;
			});

		const store = mutation(mutationFn);
		const values: boolean[] = [];

		// Subscribe to track loading states
		store.subscribe((v) => values.push(v.loading));

		// Start mutation
		const promise = store.mutate({ title: "Test" });

		// Should be loading
		expect(get(store).loading).toBe(true);

		// Resolve
		resolvePromise!({ data: { id: "1" } });
		await promise;

		// Should not be loading
		expect(get(store).loading).toBe(false);
		expect(get(store).data).toEqual({ id: "1" });
	});

	test("handles mutation errors", async () => {
		const mutationFn = async (_input: { title: string }) => {
			throw new Error("Mutation failed");
		};

		const store = mutation(mutationFn);

		await expect(store.mutate({ title: "Test" })).rejects.toThrow("Mutation failed");

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("Mutation failed");
	});

	test("reset clears the state", async () => {
		const mutationFn = async (_input: { title: string }) => ({
			data: { id: "1", title: "Test" },
		});

		const store = mutation(mutationFn);
		await store.mutate({ title: "Test" });

		// Data should be set
		expect(get(store).data).toEqual({ id: "1", title: "Test" });

		// Reset
		store.reset();

		const value = get(store);
		expect(value.data).toBe(null);
		expect(value.loading).toBe(false);
		expect(value.error).toBe(null);
	});

	test("handles non-Error rejections", async () => {
		const mutationFn = async (_input: { title: string }) => {
			throw "string error";
		};

		const store = mutation(mutationFn);

		await expect(store.mutate({ title: "Test" })).rejects.toThrow("string error");

		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("string error");
		expect(value.data).toBe(null);
	});

	test("reset clears error state", async () => {
		const mutationFn = async (_input: { title: string }) => {
			throw new Error("Mutation error");
		};

		const store = mutation(mutationFn);

		// Trigger error
		await expect(store.mutate({ title: "Test" })).rejects.toThrow("Mutation error");
		expect(get(store).error?.message).toBe("Mutation error");

		// Reset should clear error
		store.reset();

		const value = get(store);
		expect(value.error).toBe(null);
		expect(value.data).toBe(null);
		expect(value.loading).toBe(false);
	});

	test("multiple mutations update store correctly", async () => {
		let counter = 0;
		const mutationFn = async (_input: { title: string }) => ({
			data: { id: String(++counter), title: _input.title },
		});

		const store = mutation(mutationFn);

		// First mutation
		await store.mutate({ title: "First" });
		expect(get(store).data).toEqual({ id: "1", title: "First" });

		// Second mutation
		await store.mutate({ title: "Second" });
		expect(get(store).data).toEqual({ id: "2", title: "Second" });
	});
});

describe("lazyQuery()", () => {
	test("creates a store with idle state (not loading)", () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = lazyQuery(mockResult as never);
		const value = get(store);

		expect(value.loading).toBe(false);
		expect(value.data).toBe(null);
		expect(value.error).toBe(null);
	});

	test("execute triggers the query", async () => {
		const mockResult = createMockQueryResult<{ id: string; name: string }>();
		const store = lazyQuery(mockResult as never);

		// Execute should start loading
		const promise = store.execute();

		// Should be loading
		expect(get(store).loading).toBe(true);

		// Resolve
		mockResult._resolve({ id: "123", name: "John" });
		const result = await promise;

		// Should have data
		expect(result).toEqual({ id: "123", name: "John" });
		expect(get(store).data).toEqual({ id: "123", name: "John" });
		expect(get(store).loading).toBe(false);
	});

	test("reset clears the state", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = lazyQuery(mockResult as never);

		// Execute and resolve
		const promise = store.execute();
		mockResult._resolve({ id: "123" });
		await promise;

		// Data should be set
		expect(get(store).data).toEqual({ id: "123" });

		// Reset
		store.reset();

		const value = get(store);
		expect(value.data).toBe(null);
		expect(value.loading).toBe(false);
	});

	test("execute with null query returns null", async () => {
		const store = lazyQuery(null);

		const result = await store.execute();

		expect(result).toBe(null);
		expect(get(store).data).toBe(null);
		expect(get(store).loading).toBe(false);
		expect(get(store).error).toBe(null);
	});

	test("execute with undefined query returns null", async () => {
		const store = lazyQuery(undefined);

		const result = await store.execute();

		expect(result).toBe(null);
		expect(get(store).data).toBe(null);
		expect(get(store).loading).toBe(false);
	});

	test("execute with accessor function returning null", async () => {
		const store = lazyQuery(() => null);

		const result = await store.execute();

		expect(result).toBe(null);
		expect(get(store).data).toBe(null);
		expect(get(store).loading).toBe(false);
	});

	test("execute handles query errors", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = lazyQuery(mockResult as never);

		// Execute
		const promise = store.execute();

		// Reject
		mockResult._reject(new Error("Query failed"));

		// Should throw
		await expect(promise).rejects.toThrow("Query failed");

		// Store should have error
		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("Query failed");
		expect(value.data).toBe(null);
	});

	test("execute handles non-Error rejections", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = lazyQuery(mockResult as never);

		// Execute
		const promise = store.execute();

		// Reject with non-Error
		mockResult._reject("string error" as never);

		// Should throw Error with string message
		await expect(promise).rejects.toThrow("string error");

		// Store should have error converted to Error object
		const value = get(store);
		expect(value.loading).toBe(false);
		expect(value.error?.message).toBe("string error");
		expect(value.data).toBe(null);
	});

	test("reset clears error state", async () => {
		const mockResult = createMockQueryResult<{ id: string }>();
		const store = lazyQuery(mockResult as never);

		// Execute and reject
		const promise = store.execute();
		mockResult._reject(new Error("Query error"));
		await expect(promise).rejects.toThrow("Query error");

		// Should have error
		expect(get(store).error?.message).toBe("Query error");

		// Reset should clear
		store.reset();

		const value = get(store);
		expect(value.error).toBe(null);
		expect(value.data).toBe(null);
		expect(value.loading).toBe(false);
	});

	test("multiple executions update store correctly", async () => {
		const mockResult1 = createMockQueryResult<{ id: string }>();
		const mockResult2 = createMockQueryResult<{ id: string }>();
		let useSecond = false;

		const store = lazyQuery(() => (useSecond ? mockResult2 : mockResult1) as never);

		// First execution
		const promise1 = store.execute();
		mockResult1._resolve({ id: "first" });
		await promise1;
		expect(get(store).data).toEqual({ id: "first" });

		// Second execution with different query
		useSecond = true;
		const promise2 = store.execute();
		mockResult2._resolve({ id: "second" });
		await promise2;
		expect(get(store).data).toEqual({ id: "second" });
	});

	test("execute with accessor function resolves query", async () => {
		const mockResult = createMockQueryResult<{ value: number }>();
		const store = lazyQuery(() => mockResult as never);

		const promise = store.execute();
		mockResult._resolve({ value: 42 });
		const result = await promise;

		expect(result).toEqual({ value: 42 });
		expect(get(store).data).toEqual({ value: 42 });
	});
});
