/**
 * Tests for React Hooks (Selector-based API)
 *
 * NOTE: These tests require DOM environment (happy-dom).
 * Run from packages/react directory: cd packages/react && bun test
 */

// Skip all tests if DOM is not available (when run from root)
const hasDom = typeof document !== "undefined";

import { test as bunTest, describe, expect } from "bun:test";

const test = hasDom ? bunTest : bunTest.skip;

import type { LensClient, MutationResult, QueryResult } from "@sylphx/lens-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { LensProvider } from "./context.js";
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
// Test Wrapper with Mock Client
// =============================================================================

function createMockClient() {
	return {} as LensClient<any, any>;
}

function createWrapper(mockClient: LensClient<any, any>) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return <LensProvider client={mockClient}>{children}</LensProvider>;
	};
}

// =============================================================================
// Tests: useQuery (Accessor + Deps pattern)
// =============================================================================

describe("useQuery", () => {
	test("returns loading state initially", () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("returns data when query resolves", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

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
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string; name: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

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
		const mockClient = createMockClient();
		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any, onRejected: any) => {
				// Reject with a string instead of Error
				return Promise.reject("String error").then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error?.message).toBe("String error");
	});

	test("skips query when skip option is true", () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, [], { skip: true }), {
			wrapper: createWrapper(mockClient),
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("handles null query from accessor", () => {
		const mockClient = createMockClient();

		const { result } = renderHook(() => useQuery(() => null, []), {
			wrapper: createWrapper(mockClient),
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("handles undefined query from accessor", () => {
		const mockClient = createMockClient();

		const { result } = renderHook(() => useQuery(() => undefined, []), {
			wrapper: createWrapper(mockClient),
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
	});

	test("updates when query subscription emits", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ count: number }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		// Initial value
		act(() => {
			mockQuery._setValue({ count: 1 });
		});

		await waitFor(() => {
			expect(result.current.data?.count).toBe(1);
		});

		// Update value via subscription
		act(() => {
			mockQuery._setValue({ count: 2 });
		});

		await waitFor(() => {
			expect(result.current.data?.count).toBe(2);
		});
	});

	test("refetch reloads the query", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "initial" });

		const { result } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data?.id).toBe("initial");

		// Refetch
		act(() => {
			result.current.refetch();
		});

		expect(result.current.loading).toBe(true);

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
	});

	test("refetch handles errors", async () => {
		const mockClient = createMockClient();
		let shouldFail = false;
		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any, onRejected: any) => {
				if (shouldFail) {
					return Promise.reject(new Error("Refetch failed")).then(onFulfilled, onRejected);
				}
				return Promise.resolve({ id: "test" }).then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		shouldFail = true;

		act(() => {
			result.current.refetch();
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error?.message).toBe("Refetch failed");
	});

	test("refetch does nothing when query is null", async () => {
		const mockClient = createMockClient();

		const { result } = renderHook(() => useQuery(() => null, []), {
			wrapper: createWrapper(mockClient),
		});

		// Should not throw
		act(() => {
			result.current.refetch();
		});

		expect(result.current.loading).toBe(false);
	});

	test("refetch does nothing when skip is true", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>();

		const { result } = renderHook(() => useQuery(() => mockQuery, [], { skip: true }), {
			wrapper: createWrapper(mockClient),
		});

		// Should not throw
		act(() => {
			result.current.refetch();
		});

		expect(result.current.loading).toBe(false);
	});

	test("refetch with non-Error rejection", async () => {
		const mockClient = createMockClient();
		let callCount = 0;
		const mockQuery = {
			subscribe: () => () => {},
			then: (onFulfilled: any, onRejected: any) => {
				callCount++;
				if (callCount > 1) {
					return Promise.reject("String error on refetch").then(onFulfilled, onRejected);
				}
				return Promise.resolve({ id: "test" }).then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		act(() => {
			result.current.refetch();
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error?.message).toBe("String error on refetch");
	});

	test("cleans up subscription on unmount", async () => {
		const mockClient = createMockClient();
		let unsubscribeCalled = false;
		const mockQuery = {
			subscribe: () => {
				return () => {
					unsubscribeCalled = true;
				};
			},
			then: (onFulfilled: any) => Promise.resolve({ id: "test" }).then(onFulfilled),
		} as unknown as QueryResult<{ id: string }>;

		const { unmount } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		unmount();

		expect(unsubscribeCalled).toBe(true);
	});

	test("does not update state after unmount", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>();

		const { result, unmount } = renderHook(() => useQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		unmount();

		// This should not cause errors or state updates
		act(() => {
			mockQuery._setValue({ id: "after-unmount" });
		});

		// Result should still be from before unmount
		expect(result.current.data).toBe(null);
	});

	test("handles query change via deps", async () => {
		const mockClient = createMockClient();
		const mockQuery1 = createMockQueryResult<{ id: string }>({ id: "query1" });
		const mockQuery2 = createMockQueryResult<{ id: string }>({ id: "query2" });

		let useQuery1 = true;
		const { result, rerender } = renderHook(() => useQuery(() => (useQuery1 ? mockQuery1 : mockQuery2), [useQuery1]), {
			wrapper: createWrapper(mockClient),
		});

		await waitFor(() => {
			expect(result.current.data?.id).toBe("query1");
		});

		// Change to query2
		useQuery1 = false;
		rerender();

		await waitFor(() => {
			expect(result.current.data?.id).toBe("query2");
		});
	});

	test("handles skip option change from true to false", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "test" });

		let skip = true;
		const { result, rerender } = renderHook(() => useQuery(() => mockQuery, [], { skip }), {
			wrapper: createWrapper(mockClient),
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);

		// Enable query
		skip = false;
		rerender();

		await waitFor(() => {
			expect(result.current.data?.id).toBe("test");
		});
	});

	test("handles skip option change from false to true", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "test" });

		let skip = false;
		const { result, rerender } = renderHook(() => useQuery(() => mockQuery, [], { skip }), {
			wrapper: createWrapper(mockClient),
		});

		await waitFor(() => {
			expect(result.current.data?.id).toBe("test");
		});

		// Disable query
		skip = true;
		rerender();

		await waitFor(() => {
			expect(result.current.data).toBe(null);
		});

		expect(result.current.loading).toBe(false);
	});

	test("select transforms the data", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});

		const { result } = renderHook(
			() =>
				useQuery(() => mockQuery, [], {
					select: (data) => data.name.toUpperCase(),
				}),
			{ wrapper: createWrapper(mockClient) },
		);

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBe("JOHN");
	});

	test("Route + Params pattern works", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "user-123" });
		const route = (_params: { id: string }) => mockQuery;

		const { result } = renderHook(() => useQuery(() => route, { id: "123" }), {
			wrapper: createWrapper(mockClient),
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data?.id).toBe("user-123");
	});

	test("Route + Params with null route", async () => {
		const mockClient = createMockClient();

		const { result } = renderHook(() => useQuery(() => null, { id: "123" }), {
			wrapper: createWrapper(mockClient),
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});
});

// =============================================================================
// Tests: useMutation
// =============================================================================

describe("useMutation", () => {
	test("executes mutation and returns result", async () => {
		const mockClient = createMockClient();
		const mockMutation = async (_input: { title: string }): Promise<MutationResult<{ id: string }>> => {
			return { data: { id: "new-123" } };
		};

		const { result } = renderHook(() => useMutation(() => mockMutation), {
			wrapper: createWrapper(mockClient),
		});

		let mutationResult: MutationResult<{ id: string }> | undefined;
		await act(async () => {
			mutationResult = await result.current.mutate({ title: "Test" });
		});

		expect(mutationResult?.data?.id).toBe("new-123");
		expect(result.current.data?.id).toBe("new-123");
		expect(result.current.loading).toBe(false);
	});

	test("handles mutation error", async () => {
		const mockClient = createMockClient();
		const mockMutation = async (): Promise<MutationResult<{ id: string }>> => {
			throw new Error("Mutation failed");
		};

		const { result } = renderHook(() => useMutation(() => mockMutation), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			try {
				await result.current.mutate({ title: "Test" });
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("Mutation failed");
		expect(result.current.loading).toBe(false);
	});

	test("handles non-Error exception in mutation", async () => {
		const mockClient = createMockClient();
		const mockMutation = async (): Promise<MutationResult<{ id: string }>> => {
			throw "String error";
		};

		const { result } = renderHook(() => useMutation(() => mockMutation), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			try {
				await result.current.mutate({ title: "Test" });
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("String error");
	});

	test("shows loading state during mutation", async () => {
		const mockClient = createMockClient();
		let resolvePromise: () => void;
		const mockMutation = async (): Promise<MutationResult<{ id: string }>> => {
			await new Promise<void>((resolve) => {
				resolvePromise = resolve;
			});
			return { data: { id: "test" } };
		};

		const { result } = renderHook(() => useMutation(() => mockMutation), {
			wrapper: createWrapper(mockClient),
		});

		let mutationPromise: Promise<any>;
		act(() => {
			mutationPromise = result.current.mutate({ title: "Test" });
		});

		expect(result.current.loading).toBe(true);

		await act(async () => {
			resolvePromise!();
			await mutationPromise;
		});

		expect(result.current.loading).toBe(false);
	});

	test("reset clears mutation state", async () => {
		const mockClient = createMockClient();
		const mockMutation = async (): Promise<MutationResult<{ id: string }>> => {
			return { data: { id: "test" } };
		};

		const { result } = renderHook(() => useMutation(() => mockMutation), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			await result.current.mutate({ title: "Test" });
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
		const mockClient = createMockClient();
		let callCount = 0;
		const mockMutation = async (_input: { title: string }): Promise<MutationResult<{ count: number }>> => {
			callCount++;
			return { data: { count: callCount } };
		};

		const { result } = renderHook(() => useMutation(() => mockMutation), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			await result.current.mutate({ title: "First" });
		});
		expect(result.current.data?.count).toBe(1);

		await act(async () => {
			await result.current.mutate({ title: "Second" });
		});
		expect(result.current.data?.count).toBe(2);
	});

	test("clears error on successful mutation after previous error", async () => {
		const mockClient = createMockClient();
		let shouldFail = true;
		const mockMutation = async (): Promise<MutationResult<{ id: string }>> => {
			if (shouldFail) {
				throw new Error("Failed");
			}
			return { data: { id: "success" } };
		};

		const { result } = renderHook(() => useMutation(() => mockMutation), {
			wrapper: createWrapper(mockClient),
		});

		// First mutation fails
		await act(async () => {
			try {
				await result.current.mutate({ title: "Test" });
			} catch {
				// Expected
			}
		});

		expect(result.current.error).not.toBe(null);

		// Second mutation succeeds
		shouldFail = false;
		await act(async () => {
			await result.current.mutate({ title: "Test" });
		});

		expect(result.current.error).toBe(null);
		expect(result.current.data?.id).toBe("success");
	});

	test("does not update state after unmount", async () => {
		const mockClient = createMockClient();
		let resolvePromise: () => void;
		const mockMutation = async (): Promise<MutationResult<{ id: string }>> => {
			await new Promise<void>((resolve) => {
				resolvePromise = resolve;
			});
			return { data: { id: "test" } };
		};

		const { result, unmount } = renderHook(() => useMutation(() => mockMutation), {
			wrapper: createWrapper(mockClient),
		});

		let mutationPromise: Promise<any>;
		act(() => {
			mutationPromise = result.current.mutate({ title: "Test" });
		});

		unmount();

		// Resolve after unmount - should not cause errors
		await act(async () => {
			resolvePromise!();
			await mutationPromise;
		});
	});
});

// =============================================================================
// Tests: useLazyQuery
// =============================================================================

describe("useLazyQuery", () => {
	test("does not execute query on mount", () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>();

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
	});

	test("executes query when execute is called", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "lazy-123" });

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data?.id).toBe("lazy-123");
		expect(result.current.loading).toBe(false);
	});

	test("handles query error", async () => {
		const mockClient = createMockClient();
		const mockQuery = {
			then: (_: any, onRejected: any) => {
				return Promise.reject(new Error("Query failed")).then(null, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("Query failed");
	});

	test("handles non-Error rejection", async () => {
		const mockClient = createMockClient();
		const mockQuery = {
			then: (_: any, onRejected: any) => {
				return Promise.reject("String error").then(null, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("String error");
	});

	test("reset clears query state", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "test" });

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data).not.toBe(null);

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
	});

	test("handles null query from accessor", async () => {
		const mockClient = createMockClient();

		const { result } = renderHook(() => useLazyQuery(() => null, []), {
			wrapper: createWrapper(mockClient),
		});

		let executeResult: any;
		await act(async () => {
			executeResult = await result.current.execute();
		});

		expect(executeResult).toBe(null);
		expect(result.current.data).toBe(null);
	});

	test("handles undefined query from accessor", async () => {
		const mockClient = createMockClient();

		const { result } = renderHook(() => useLazyQuery(() => undefined, []), {
			wrapper: createWrapper(mockClient),
		});

		let executeResult: any;
		await act(async () => {
			executeResult = await result.current.execute();
		});

		expect(executeResult).toBe(null);
		expect(result.current.data).toBe(null);
	});

	test("uses latest query value from accessor on execute", async () => {
		const mockClient = createMockClient();
		const mockQuery1 = createMockQueryResult<{ id: string }>({ id: "query1" });
		const mockQuery2 = createMockQueryResult<{ id: string }>({ id: "query2" });

		let useQuery1 = true;
		const { result, rerender } = renderHook(
			() => useLazyQuery(() => (useQuery1 ? mockQuery1 : mockQuery2), [useQuery1]),
			{ wrapper: createWrapper(mockClient) },
		);

		// Change to query2 before executing
		useQuery1 = false;
		rerender();

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data?.id).toBe("query2");
	});

	test("shows loading state during execution", async () => {
		const mockClient = createMockClient();
		// Create the pending promise upfront so resolvePromise is assigned immediately
		let resolvePromise!: (value: { id: string }) => void;
		const pendingPromise = new Promise<{ id: string }>((resolve) => {
			resolvePromise = resolve;
		});
		const mockQuery = {
			then: (onFulfilled: any, onRejected?: any) => {
				return pendingPromise.then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		let executePromise: Promise<any>;
		act(() => {
			executePromise = result.current.execute();
		});

		expect(result.current.loading).toBe(true);

		await act(async () => {
			resolvePromise({ id: "test" });
			await executePromise;
		});

		expect(result.current.loading).toBe(false);
	});

	test("does not update state after unmount", async () => {
		const mockClient = createMockClient();
		// Create the pending promise upfront so resolvePromise is assigned immediately
		let resolvePromise!: (value: { id: string }) => void;
		const pendingPromise = new Promise<{ id: string }>((resolve) => {
			resolvePromise = resolve;
		});
		const mockQuery = {
			then: (onFulfilled: any, onRejected?: any) => {
				return pendingPromise.then(onFulfilled, onRejected);
			},
		} as unknown as QueryResult<{ id: string }>;

		const { result, unmount } = renderHook(() => useLazyQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		let executePromise: Promise<any>;
		act(() => {
			executePromise = result.current.execute();
		});

		unmount();

		// Resolve after unmount - should not cause errors
		await act(async () => {
			resolvePromise({ id: "test" });
			await executePromise;
		});
	});

	test("can execute multiple times", async () => {
		const mockClient = createMockClient();
		let callCount = 0;
		const mockQuery = {
			then: (onFulfilled: any) => {
				callCount++;
				return Promise.resolve({ count: callCount }).then(onFulfilled);
			},
		} as unknown as QueryResult<{ count: number }>;

		const { result } = renderHook(() => useLazyQuery(() => mockQuery, []), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			await result.current.execute();
		});
		expect(result.current.data?.count).toBe(1);

		await act(async () => {
			await result.current.execute();
		});
		expect(result.current.data?.count).toBe(2);
	});

	test("Route + Params pattern works", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string }>({ id: "user-123" });
		const route = (_params: { id: string }) => mockQuery;

		const { result } = renderHook(() => useLazyQuery(() => route, { id: "123" }), {
			wrapper: createWrapper(mockClient),
		});

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data?.id).toBe("user-123");
	});

	test("Route + Params with null route", async () => {
		const mockClient = createMockClient();

		const { result } = renderHook(() => useLazyQuery(() => null, { id: "123" }), {
			wrapper: createWrapper(mockClient),
		});

		let executeResult: any;
		await act(async () => {
			executeResult = await result.current.execute();
		});

		expect(executeResult).toBe(null);
		expect(result.current.data).toBe(null);
	});

	test("select transforms the data", async () => {
		const mockClient = createMockClient();
		const mockQuery = createMockQueryResult<{ id: string; name: string }>({
			id: "123",
			name: "John",
		});

		const { result } = renderHook(
			() =>
				useLazyQuery(() => mockQuery, [], {
					select: (data) => data.name.toUpperCase(),
				}),
			{ wrapper: createWrapper(mockClient) },
		);

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.data).toBe("JOHN");
	});
});
