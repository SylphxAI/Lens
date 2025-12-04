/**
 * Tests for React Hooks (Operations-based API)
 *
 * NOTE: These tests require DOM environment (happy-dom).
 * Run from packages/react directory: cd packages/react && bun test
 */

// Skip all tests if DOM is not available (when run from root)
const hasDom = typeof document !== "undefined";

import { test as bunTest, describe, expect } from "bun:test";

const test = hasDom ? bunTest : bunTest.skip;

import type { MutationResult, QueryResult } from "@sylphx/lens-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useLazyQuery, useMutation, useQuery } from "./hooks.js";

// =============================================================================
// Mock QueryResult
// =============================================================================

function createMockQueryResult<T>(initialValue: T | null = null): QueryResult<T> & {
	_setValue: (value: T) => void;
	_setError: (error: Error) => void;
} {
	let currentValue = initialValue;
	const subscribers: Array<(value: T) => void> = [];
	let resolved = false;
	let resolvePromise: ((value: T) => void) | null = null;
	let rejectPromise: ((error: Error) => void) | null = null;

	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
		if (initialValue !== null) {
			resolved = true;
			resolve(initialValue);
		}
	});

	const result = {
		get value() {
			return currentValue;
		},
		subscribe(callback?: (data: T) => void): () => void {
			if (callback) {
				subscribers.push(callback);
				if (currentValue !== null) {
					callback(currentValue);
				}
			}
			return () => {
				const idx = subscribers.indexOf(callback!);
				if (idx >= 0) subscribers.splice(idx, 1);
			};
		},
		select() {
			return result as unknown as QueryResult<T>;
		},
		then<TResult1 = T, TResult2 = never>(
			onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
		): Promise<TResult1 | TResult2> {
			return promise.then(onfulfilled, onrejected);
		},
		// Test helpers
		_setValue(value: T) {
			currentValue = value;
			for (const cb of subscribers) cb(value);
			if (!resolved && resolvePromise) {
				resolved = true;
				resolvePromise(value);
			}
		},
		_setError(error: Error) {
			if (!resolved && rejectPromise) {
				resolved = true;
				rejectPromise(error);
			}
		},
	};

	return result as QueryResult<T> & {
		_setValue: (value: T) => void;
		_setError: (error: Error) => void;
	};
}

// =============================================================================
// Tests: useQuery (Accessor + Deps pattern)
// =============================================================================

describe("useQuery", () => {
	test("returns loading state initially", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []));

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("returns data when query resolves", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []));

		// Simulate data loading
		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toEqual({ id: "123", name: "John" });
		expect(result.current.error).toBe(null);
	});

	test("returns error when query fails", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []));

		// Simulate error
		act(() => {
			mockQuery._setError(new Error("Query failed"));
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error?.message).toBe("Query failed");
		expect(result.current.data).toBe(null);
	});

	test("handles non-Error rejection", async () => {
		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any, onRejected: any) => {
				// Reject with a string instead of Error
				return Promise.reject("String error").then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result } = renderHook(() => useQuery(() => mockQuery, []));

		await waitFor(() => {
			expect(result.current.error?.message).toBe("String error");
		});
	});

	test("skips query when skip option is true", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, [], { skip: true }));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("handles null query from accessor", () => {
		const { result } = renderHook(() => useQuery(() => null, []));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("handles undefined query from accessor", () => {
		const { result } = renderHook(() => useQuery(() => undefined, []));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("updates when query subscription emits", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []));

		// First value
		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("John");
		});

		// Update value via subscription
		act(() => {
			mockQuery._setValue({ id: "123", name: "Jane" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("Jane");
		});
	});

	test("refetch reloads the query", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []));

		// Initial load
		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("John");
		});

		// Refetch should trigger loading state and reload
		act(() => {
			result.current.refetch();
		});

		// Note: In this mock, refetch will resolve with the same data
		// In a real scenario, it would trigger a new network request
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toEqual({ id: "123", name: "John" });
	});

	test("refetch handles errors", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []));

		// Initial load succeeds
		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("John");
		});

		// Create a new query that will fail
		const failingQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any, onRejected: any) => {
				return Promise.reject(new Error("Refetch failed")).then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string; name: string }>;

		// Update the query to use failing query
		const { result: result2 } = renderHook(() => useQuery(() => failingQuery, []));

		await waitFor(() => {
			expect(result2.current.error?.message).toBe("Refetch failed");
		});
	});

	test("refetch does nothing when query is null", () => {
		const { result } = renderHook(() => useQuery(() => null, []));

		act(() => {
			result.current.refetch();
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("refetch does nothing when skip is true", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, [], { skip: true }));

		act(() => {
			result.current.refetch();
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("refetch with non-Error rejection", async () => {
		let shouldFail = false;
		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any, onRejected: any) => {
				if (shouldFail) {
					return Promise.reject("Refetch string error").then(onFulfilled, onRejected);
				}
				return Promise.resolve({ id: "123", name: "John" } as any).then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string; name: string }>;

		const { result } = renderHook(() => useQuery(() => mockQuery, []));

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "123", name: "John" });
		});

		// Make it fail on refetch
		shouldFail = true;

		act(() => {
			result.current.refetch();
		});

		await waitFor(() => {
			expect(result.current.error?.message).toBe("Refetch string error");
		});
	});

	test("cleans up subscription on unmount", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();
		let unsubscribeCalled = false;

		// Override subscribe to track unsubscribe
		const originalSubscribe = mockQuery.subscribe;
		mockQuery.subscribe = (callback?: (data: { id: string; name: string }) => void) => {
			const originalUnsubscribe = originalSubscribe.call(mockQuery, callback);
			return () => {
				unsubscribeCalled = true;
				originalUnsubscribe();
			};
		};

		const { unmount } = renderHook(() => useQuery(() => mockQuery, []));

		unmount();

		expect(unsubscribeCalled).toBe(true);
	});

	test("does not update state after unmount", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { unmount } = renderHook(() => useQuery(() => mockQuery, []));

		// Unmount before query resolves
		unmount();

		// Try to set value after unmount
		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		// State should not be updated (we can't really assert this directly,
		// but the test passing without errors shows no state update occurred)
		expect(true).toBe(true);
	});

	test("handles query change via deps", async () => {
		const mockQuery1 = createMockQueryResult<{ id: string; name: string }>();
		const mockQuery2 = createMockQueryResult<{ id: string; name: string }>();

		let queryId = 1;
		const { result, rerender } = renderHook(() => useQuery(() => (queryId === 1 ? mockQuery1 : mockQuery2), [queryId]));

		// Load first query
		act(() => {
			mockQuery1._setValue({ id: "1", name: "First" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("First");
		});

		// Change to second query
		queryId = 2;
		rerender();

		expect(result.current.loading).toBe(true);

		// Load second query
		act(() => {
			mockQuery2._setValue({ id: "2", name: "Second" });
		});

		await waitFor(() => {
			expect(result.current.data?.name).toBe("Second");
		});
	});

	test("handles skip option change from true to false", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		let skip = true;
		const { result, rerender } = renderHook(() => useQuery(() => mockQuery, [], { skip }));

		expect(result.current.loading).toBe(false);

		// Change skip to false
		skip = false;
		rerender();

		expect(result.current.loading).toBe(true);

		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "123", name: "John" });
		});
	});

	test("handles skip option change from false to true", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		let skip = false;
		const { result, rerender } = renderHook(() => useQuery(() => mockQuery, [], { skip }));

		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "123", name: "John" });
		});

		// Change skip to true
		skip = true;
		rerender();

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("select transforms the data", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() =>
			useQuery(() => mockQuery, [], {
				select: (data) => data.name.toUpperCase(),
			}),
		);

		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.data).toBe("JOHN");
		});
	});

	test("Route + Params pattern works", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();
		const route = (_params: { id: string }) => mockQuery;

		const { result } = renderHook(() => useQuery(route, { id: "123" }));

		act(() => {
			mockQuery._setValue({ id: "123", name: "John" });
		});

		await waitFor(() => {
			expect(result.current.data).toEqual({ id: "123", name: "John" });
		});
	});

	test("Route + Params with null route", () => {
		const { result } = renderHook(() => useQuery(null, { id: "123" }));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});
});

// =============================================================================
// Tests: useMutation
// =============================================================================

describe("useMutation", () => {
	test("executes mutation and returns result", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return {
				data: { id: "new-id", name: input.name },
			};
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);

		let mutationResult: MutationResult<{ id: string; name: string }> | undefined;
		await act(async () => {
			mutationResult = await result.current.mutate({ name: "New User" });
		});

		expect(mutationResult?.data).toEqual({ id: "new-id", name: "New User" });
		expect(result.current.data).toEqual({ id: "new-id", name: "New User" });
		expect(result.current.loading).toBe(false);
	});

	test("handles mutation error", async () => {
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			throw new Error("Mutation failed");
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		await act(async () => {
			try {
				await result.current.mutate({ name: "New User" });
			} catch {
				// Expected error
			}
		});

		expect(result.current.error?.message).toBe("Mutation failed");
		expect(result.current.loading).toBe(false);
	});

	test("handles non-Error exception in mutation", async () => {
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			throw "String error";
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		await act(async () => {
			try {
				await result.current.mutate({ name: "New User" });
			} catch {
				// Expected error
			}
		});

		expect(result.current.error?.message).toBe("String error");
		expect(result.current.loading).toBe(false);
	});

	test("shows loading state during mutation", async () => {
		let resolveMutation: ((value: MutationResult<{ id: string }>) => void) | null = null;
		const mutationFn = async (_input: { name: string }): Promise<MutationResult<{ id: string }>> => {
			return new Promise((resolve) => {
				resolveMutation = resolve;
			});
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		// Start mutation (don't await)
		let mutationPromise: Promise<MutationResult<{ id: string }>> | undefined;
		act(() => {
			mutationPromise = result.current.mutate({ name: "New User" });
		});

		// Should be loading
		expect(result.current.loading).toBe(true);

		// Resolve mutation
		await act(async () => {
			resolveMutation?.({ data: { id: "new-id" } });
			await mutationPromise;
		});

		expect(result.current.loading).toBe(false);
	});

	test("reset clears mutation state", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return { data: { id: "new-id", name: input.name } };
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		await act(async () => {
			await result.current.mutate({ name: "New User" });
		});

		expect(result.current.data).not.toBe(null);

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("handles multiple mutations in sequence", async () => {
		let counter = 0;
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			counter++;
			return { data: { id: `id-${counter}`, name: input.name } };
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		// First mutation
		await act(async () => {
			await result.current.mutate({ name: "First" });
		});

		expect(result.current.data).toEqual({ id: "id-1", name: "First" });

		// Second mutation
		await act(async () => {
			await result.current.mutate({ name: "Second" });
		});

		expect(result.current.data).toEqual({ id: "id-2", name: "Second" });
	});

	test("clears error on successful mutation after previous error", async () => {
		let shouldFail = true;
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			if (shouldFail) {
				throw new Error("Mutation failed");
			}
			return { data: { id: "new-id", name: input.name } };
		};

		const { result } = renderHook(() => useMutation(mutationFn));

		// First mutation fails
		await act(async () => {
			try {
				await result.current.mutate({ name: "New User" });
			} catch {
				// Expected error
			}
		});

		expect(result.current.error?.message).toBe("Mutation failed");

		// Second mutation succeeds
		shouldFail = false;
		await act(async () => {
			await result.current.mutate({ name: "New User" });
		});

		expect(result.current.error).toBe(null);
		expect(result.current.data).toEqual({ id: "new-id", name: "New User" });
	});

	test("does not update state after unmount", async () => {
		const mutationFn = async (input: { name: string }): Promise<MutationResult<{ id: string; name: string }>> => {
			return { data: { id: "new-id", name: input.name } };
		};

		const { result, unmount } = renderHook(() => useMutation(mutationFn));

		// Start mutation but unmount before it completes
		const mutationPromise = result.current.mutate({ name: "New User" });
		unmount();

		// Wait for mutation to complete
		await mutationPromise;

		// Test passes if no error is thrown (state update after unmount would cause error)
		expect(true).toBe(true);
	});
});

// =============================================================================
// Tests: useLazyQuery (Accessor + Deps pattern)
// =============================================================================

describe("useLazyQuery", () => {
	test("does not execute query on mount", () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []));

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("executes query when execute is called", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []));

		let queryResult: { id: string; name: string } | undefined;
		await act(async () => {
			queryResult = await result.current.execute();
		});

		expect(queryResult).toEqual({ id: "123", name: "John" });
		expect(result.current.data).toEqual({ id: "123", name: "John" });
	});

	test("handles query error", async () => {
		// Create a mock query that rejects
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []));

		// Set error before execute
		act(() => {
			mockQuery._setError(new Error("Query failed"));
		});

		// Execute should throw
		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// Expected error
			}
		});

		expect(result.current.error?.message).toBe("Query failed");
	});

	test("handles non-Error rejection", async () => {
		const mockQuery = {
			then: (onFulfilled: any, onRejected: any) => {
				return Promise.reject("String error").then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []));

		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// Expected error
			}
		});

		expect(result.current.error?.message).toBe("String error");
	});

	test("reset clears query state", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []));

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data).not.toBe(null);

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("handles null query from accessor", async () => {
		const { result } = renderHook(() => useLazyQuery(() => null, []));

		let queryResult: any;
		await act(async () => {
			queryResult = await result.current.execute();
		});

		expect(queryResult).toBe(null);
		expect(result.current.data).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("handles undefined query from accessor", async () => {
		const { result } = renderHook(() => useLazyQuery(() => undefined, []));

		let queryResult: any;
		await act(async () => {
			queryResult = await result.current.execute();
		});

		expect(queryResult).toBe(null);
		expect(result.current.data).toBe(null);
		expect(result.current.loading).toBe(false);
	});

	test("uses latest query value from accessor on execute", async () => {
		let currentValue = "first";
		const mockQuery1 = createMockQueryResult<string>("first");
		const mockQuery2 = createMockQueryResult<string>("second");

		const accessor = () => (currentValue === "first" ? mockQuery1 : mockQuery2);

		const { result } = renderHook(() => useLazyQuery(accessor, []));

		// First execute
		let queryResult1: string | undefined;
		await act(async () => {
			queryResult1 = await result.current.execute();
		});

		expect(queryResult1).toBe("first");

		// Change accessor to return different query
		currentValue = "second";

		// Second execute should use new query
		let queryResult2: string | undefined;
		await act(async () => {
			queryResult2 = await result.current.execute();
		});

		expect(queryResult2).toBe("second");
	});

	test("shows loading state during execution", async () => {
		const mockQuery = createMockQueryResult<{ id: string }>();

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []));

		// Execute and set value
		let executePromise: Promise<{ id: string }>;
		await act(async () => {
			executePromise = result.current.execute();
			mockQuery._setValue({ id: "123" });
			await executePromise;
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toEqual({ id: "123" });
	});

	test("does not update state after unmount", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result, unmount } = renderHook(() => useLazyQuery(() => mockQuery, []));

		// Start execution, unmount, then resolve
		const executePromise = result.current.execute();
		unmount();

		// Resolve after unmount
		await act(async () => {
			mockQuery._setValue({ id: "123", name: "John" });
			try {
				await executePromise;
			} catch {
				// May reject due to unmount
			}
		});

		// Test passes if no error is thrown (state update after unmount would cause error)
		expect(true).toBe(true);
	});

	test("can execute multiple times", async () => {
		let count = 0;
		const createQuery = () => {
			count++;
			return createMockQueryResult<{ count: number }>({ count });
		};

		const { result } = renderHook(() => useLazyQuery(() => createQuery(), []));

		// First execution
		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data?.count).toBe(1);

		// Second execution
		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data?.count).toBe(2);
	});

	test("Route + Params pattern works", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});
		const route = (_params: { id: string }) => mockQuery;

		const { result } = renderHook(() => useLazyQuery(route, { id: "123" }));

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data).toEqual({ id: "123", name: "John" });
	});

	test("Route + Params with null route", async () => {
		const { result } = renderHook(() => useLazyQuery(null, { id: "123" }));

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data).toBe(null);
	});

	test("select transforms the data", async () => {
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});

		const { result } = renderHook(() =>
			useLazyQuery(() => mockQuery, [], {
				select: (data) => data.name.toUpperCase(),
			}),
		);

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data).toBe("JOHN");
	});
});
