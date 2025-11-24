/**
 * Tests for React Hooks V2 (Operations-based API)
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { LensProviderV2 } from "./context-v2";
import { useQuery, useLazyQuery, useMutation } from "./hooks-v2";
import type { ClientV2, QueriesMap, MutationsMap, MutationV2Result } from "@lens/client";

// =============================================================================
// Mock Client
// =============================================================================

function createMockClientV2() {
	const mockUsers = [
		{ id: "user-1", name: "Alice", email: "alice@example.com" },
		{ id: "user-2", name: "Bob", email: "bob@example.com" },
	];

	const queryHandlers: Record<string, (input?: unknown) => Promise<unknown>> = {
		getUsers: mock(async () => mockUsers),
		getUser: mock(async (input: unknown) => {
			const { id } = input as { id: string };
			return mockUsers.find((u) => u.id === id) ?? null;
		}),
		whoami: mock(async () => mockUsers[0]),
		searchUsers: mock(async (input: unknown) => {
			const { query } = input as { query: string };
			return mockUsers.filter((u) =>
				u.name.toLowerCase().includes(query.toLowerCase()),
			);
		}),
		failingQuery: mock(async () => {
			throw new Error("Query failed");
		}),
	};

	const mutationHandlers: Record<
		string,
		(input: unknown, options?: { optimistic?: boolean }) => Promise<MutationV2Result<unknown>>
	> = {
		createUser: mock(async (input: unknown) => {
			const { name, email } = input as { name: string; email: string };
			return { data: { id: `user-${Date.now()}`, name, email } };
		}),
		updateUser: mock(async (input: unknown) => {
			const { id, ...rest } = input as { id: string; name?: string };
			const user = mockUsers.find((u) => u.id === id);
			return { data: { ...user, ...rest } };
		}),
		failingMutation: mock(async () => {
			throw new Error("Mutation failed");
		}),
	};

	return {
		query: queryHandlers,
		mutation: mutationHandlers,
		$store: {
			getEntity: mock(() => ({})),
			setEntity: mock(() => {}),
		},
		$execute: mock(async () => ({ data: null })),
		$queryNames: () => Object.keys(queryHandlers),
		$mutationNames: () => Object.keys(mutationHandlers),
		// Expose handlers for test assertions
		_queryHandlers: queryHandlers,
		_mutationHandlers: mutationHandlers,
	} as unknown as ClientV2<QueriesMap, MutationsMap>;
}

// =============================================================================
// Test Wrapper
// =============================================================================

function createWrapper(client: ClientV2<QueriesMap, MutationsMap>) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return createElement(LensProviderV2, { client }, children);
	};
}

// =============================================================================
// useQuery Tests
// =============================================================================

describe("useQuery", () => {
	test("returns loading state initially", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useQuery("getUsers"), { wrapper });

		// Initially loading
		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);

		// Wait for query to complete
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toEqual([
			{ id: "user-1", name: "Alice", email: "alice@example.com" },
			{ id: "user-2", name: "Bob", email: "bob@example.com" },
		]);
	});

	test("passes input to query", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useQuery("getUser", { input: { id: "user-1" } }),
			{ wrapper },
		);

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toEqual({
			id: "user-1",
			name: "Alice",
			email: "alice@example.com",
		});
	});

	test("handles query error", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useQuery("failingQuery"), { wrapper });

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Query failed");
		expect(result.current.data).toBe(null);
	});

	test("skips query when skip is true", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useQuery("getUsers", { skip: true }),
			{ wrapper },
		);

		// Should not be loading since query is skipped
		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);

		// Query should not have been called
		expect((client.query.getUsers as ReturnType<typeof mock>).mock.calls.length).toBe(0);
	});

	test("refetch re-executes query", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useQuery("getUsers"), { wrapper });

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Refetch
		await act(async () => {
			await result.current.refetch();
		});

		// Should have been called twice
		expect((client.query.getUsers as ReturnType<typeof mock>).mock.calls.length).toBe(2);
	});
});

// =============================================================================
// useLazyQuery Tests
// =============================================================================

describe("useLazyQuery", () => {
	test("does not execute on mount", () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useLazyQuery("getUsers"), { wrapper });

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);
		expect((client.query.getUsers as ReturnType<typeof mock>).mock.calls.length).toBe(0);
	});

	test("executes when execute is called", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useLazyQuery("getUsers"), { wrapper });

		let data: unknown;
		await act(async () => {
			data = await result.current.execute();
		});

		expect(data).toEqual([
			{ id: "user-1", name: "Alice", email: "alice@example.com" },
			{ id: "user-2", name: "Bob", email: "bob@example.com" },
		]);
		expect(result.current.data).toEqual(data);
	});

	test("passes input to execute", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useLazyQuery("searchUsers"), { wrapper });

		await act(async () => {
			await result.current.execute({ query: "alice" } as never);
		});

		expect(result.current.data).toEqual([
			{ id: "user-1", name: "Alice", email: "alice@example.com" },
		]);
	});

	test("handles error", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useLazyQuery("failingQuery"), { wrapper });

		await act(async () => {
			try {
				await result.current.execute();
			} catch {
				// Expected
			}
		});

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Query failed");
	});

	test("reset clears state", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useLazyQuery("getUsers"), { wrapper });

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
});

// =============================================================================
// useMutation Tests
// =============================================================================

describe("useMutation (V2)", () => {
	test("returns initial state", () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("createUser"), { wrapper });

		expect(result.current.loading).toBe(false);
		expect(result.current.error).toBe(null);
		expect(result.current.data).toBe(null);
		expect(typeof result.current.mutate).toBe("function");
	});

	test("executes mutation", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("createUser"), { wrapper });

		let mutationResult: MutationV2Result<unknown> | undefined;
		await act(async () => {
			mutationResult = await result.current.mutate({
				name: "Charlie",
				email: "charlie@example.com",
			} as never);
		});

		expect(mutationResult?.data).toMatchObject({
			name: "Charlie",
			email: "charlie@example.com",
		});
		expect(result.current.data).toMatchObject({
			name: "Charlie",
			email: "charlie@example.com",
		});
	});

	test("sets loading to false after mutation completes", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("createUser"), { wrapper });

		// Initially not loading
		expect(result.current.loading).toBe(false);

		await act(async () => {
			await result.current.mutate({
				name: "Test",
				email: "test@example.com",
			} as never);
		});

		// After mutation completes, loading should be false
		expect(result.current.loading).toBe(false);
		// Data should be set
		expect(result.current.data).toMatchObject({ name: "Test" });
	});

	test("handles mutation error", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("failingMutation"), { wrapper });

		await act(async () => {
			try {
				await result.current.mutate({} as never);
			} catch {
				// Expected
			}
		});

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Mutation failed");
		expect(result.current.loading).toBe(false);
	});

	test("reset clears state", async () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useMutation("createUser"), { wrapper });

		await act(async () => {
			await result.current.mutate({ name: "Test", email: "test@test.com" } as never);
		});

		expect(result.current.data).not.toBe(null);

		act(() => {
			result.current.reset();
		});

		expect(result.current.data).toBe(null);
		expect(result.current.error).toBe(null);
		expect(result.current.loading).toBe(false);
	});
});

// =============================================================================
// Context Tests
// =============================================================================

describe("LensProviderV2", () => {
	test("provides client to children", () => {
		const client = createMockClientV2();
		const wrapper = createWrapper(client);

		// If this doesn't throw, the context is working
		const { result } = renderHook(() => useQuery("getUsers"), { wrapper });

		expect(result.current).toBeDefined();
	});

	test("throws when used outside provider", () => {
		// This should throw
		expect(() => {
			renderHook(() => useQuery("getUsers"));
		}).toThrow("useLensClientV2 must be used within a LensProviderV2");
	});
});
