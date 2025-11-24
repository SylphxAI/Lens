/**
 * Tests for Reactive Hooks
 * Tests fine-grained reactivity with field-level signals
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { signal, type Signal } from "@lens/client";
import { ReactiveLensProvider } from "./reactive-context";
import {
	useReactiveEntity,
	useReactiveList,
	useFieldSignal,
	useReactiveMutation,
} from "./reactive-hooks";

// =============================================================================
// Mock ReactiveClient
// =============================================================================

function createMockReactiveClient() {
	// Create field-level signals
	const nameSignal = signal("John");
	const emailSignal = signal("john@test.com");
	const loadingSignal = signal(true);
	const errorSignal = signal<Error | null>(null);

	// Create computed value signal
	const valueSignal = signal({ id: "123", name: "John", email: "john@test.com" });

	// Create list signals
	const listLoadingSignal = signal(true);
	const listErrorSignal = signal<Error | null>(null);
	const listSignal = signal<Array<{ id: string; name: string; email: string }>>([]);

	let disposeCount = 0;

	const mockEntityResult = {
		$: {
			id: signal("123"),
			name: nameSignal,
			email: emailSignal,
		},
		value: valueSignal,
		loading: loadingSignal,
		error: errorSignal,
		dispose: mock(() => {
			disposeCount++;
		}),
	};

	const mockListResult = {
		items: [] as typeof mockEntityResult[],
		list: listSignal,
		loading: listLoadingSignal,
		error: listErrorSignal,
		dispose: mock(() => {
			disposeCount++;
		}),
	};

	const createResult = {
		data: { id: "new-id", name: "Created", email: "created@test.com" },
		rollback: mock(() => {}),
	};

	const updateResult = {
		data: { id: "123", name: "Updated", email: "updated@test.com" },
		rollback: mock(() => {}),
	};

	return {
		User: {
			get: mock((_id: string, _options?: unknown) => mockEntityResult),
			list: mock((_options?: unknown) => mockListResult),
			create: mock(async (_data: unknown) => createResult),
			update: mock(async (_id: string, _data: unknown) => updateResult),
			delete: mock(async (_id: string) => {}),
		},
		$subscriptions: {},
		$resolver: {},
		$optimistic: {},
		$plugins: {},
		$setSubscriptionTransport: mock(() => {}),
		$execute: mock(async () => ({ data: {} })),
		$destroy: mock(() => {}),
		// Test helpers
		_mockEntityResult: mockEntityResult,
		_mockListResult: mockListResult,
		_setLoading: (loading: boolean) => {
			loadingSignal.value = loading;
		},
		_setError: (error: Error | null) => {
			errorSignal.value = error;
		},
		_setName: (name: string) => {
			nameSignal.value = name;
			valueSignal.value = { ...valueSignal.value, name };
		},
		_setEmail: (email: string) => {
			emailSignal.value = email;
			valueSignal.value = { ...valueSignal.value, email };
		},
		_setListData: (data: Array<{ id: string; name: string; email: string }>) => {
			listSignal.value = data;
			listLoadingSignal.value = false;
		},
		_getDisposeCount: () => disposeCount,
	};
}

type MockReactiveClient = ReturnType<typeof createMockReactiveClient>;

// =============================================================================
// Test Wrapper
// =============================================================================

function createWrapper(client: MockReactiveClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return createElement(
			ReactiveLensProvider,
			{ client: client as unknown as Parameters<typeof ReactiveLensProvider>[0]["client"] },
			children,
		);
	};
}

// =============================================================================
// useReactiveEntity Tests
// =============================================================================

describe("useReactiveEntity", () => {
	test("returns loading state initially", () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveEntity("User", { id: "123" }),
			{ wrapper },
		);

		expect(result.current.loading).toBe(true);
		// Value may be non-null if there's cached data
		expect(result.current.error).toBe(null);
	});

	test("returns data when loaded", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveEntity("User", { id: "123" }),
			{ wrapper },
		);

		// Simulate loading complete
		act(() => {
			client._setLoading(false);
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.value).toEqual({
			id: "123",
			name: "John",
			email: "john@test.com",
		});
	});

	test("exposes field-level signals through $", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveEntity("User", { id: "123" }),
			{ wrapper },
		);

		act(() => {
			client._setLoading(false);
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Access field signals
		expect(result.current.$.name.value).toBe("John");
		expect(result.current.$.email.value).toBe("john@test.com");
	});

	test("field signal updates trigger re-render", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveEntity("User", { id: "123" }),
			{ wrapper },
		);

		act(() => {
			client._setLoading(false);
		});

		await waitFor(() => {
			expect(result.current.value?.name).toBe("John");
		});

		// Update field signal
		act(() => {
			client._setName("Jane");
		});

		await waitFor(() => {
			expect(result.current.value?.name).toBe("Jane");
		});
	});

	test("returns error when failed", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveEntity("User", { id: "123" }),
			{ wrapper },
		);

		act(() => {
			client._setLoading(false);
			client._setError(new Error("Not found"));
		});

		await waitFor(() => {
			expect(result.current.error?.message).toBe("Not found");
		});
	});

	test("calls client.get with select options", () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		renderHook(
			() => useReactiveEntity("User", { id: "123" }, { select: { name: true } }),
			{ wrapper },
		);

		expect(client.User.get).toHaveBeenCalledWith("123", { select: { name: true } });
	});
});

// =============================================================================
// useReactiveList Tests
// =============================================================================

describe("useReactiveList", () => {
	test("returns loading state initially", () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useReactiveList("User"), { wrapper });

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toEqual([]);
	});

	test("returns data when loaded", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(() => useReactiveList("User"), { wrapper });

		act(() => {
			client._setListData([
				{ id: "1", name: "John", email: "john@test.com" },
				{ id: "2", name: "Jane", email: "jane@test.com" },
			]);
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toHaveLength(2);
		expect(result.current.data[0].name).toBe("John");
		expect(result.current.data[1].name).toBe("Jane");
	});

	test("calls client.list with options", () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		renderHook(
			() => useReactiveList("User", { where: { isActive: true }, take: 10 }),
			{ wrapper },
		);

		expect(client.User.list).toHaveBeenCalledWith({
			where: { isActive: true },
			take: 10,
		});
	});
});

// =============================================================================
// useFieldSignal Tests
// =============================================================================

describe("useFieldSignal", () => {
	test("returns initial signal value", () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);
		const testSignal = signal("test value");

		const { result } = renderHook(() => useFieldSignal(testSignal), { wrapper });

		expect(result.current).toBe("test value");
	});

	test("updates when signal changes", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);
		const testSignal = signal(42);

		const { result } = renderHook(() => useFieldSignal(testSignal), { wrapper });

		expect(result.current).toBe(42);

		act(() => {
			testSignal.value = 100;
		});

		await waitFor(() => {
			expect(result.current).toBe(100);
		});
	});

	test("works with object signals", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);
		const testSignal = signal({ count: 0, label: "test" });

		const { result } = renderHook(() => useFieldSignal(testSignal), { wrapper });

		expect(result.current).toEqual({ count: 0, label: "test" });

		act(() => {
			testSignal.value = { count: 5, label: "updated" };
		});

		await waitFor(() => {
			expect(result.current).toEqual({ count: 5, label: "updated" });
		});
	});
});

// =============================================================================
// useReactiveMutation Tests
// =============================================================================

describe("useReactiveMutation", () => {
	test("create mutation executes correctly", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveMutation("User", "create"),
			{ wrapper },
		);

		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBe(null);

		let createResult: unknown;
		await act(async () => {
			createResult = await result.current.mutate({
				name: "New User",
				email: "new@test.com",
			});
		});

		expect(client.User.create).toHaveBeenCalledWith({
			name: "New User",
			email: "new@test.com",
		});
		expect(createResult).toEqual({
			id: "new-id",
			name: "Created",
			email: "created@test.com",
		});
	});

	test("update mutation executes correctly", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveMutation("User", "update"),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutate({ id: "123", data: { name: "Updated Name" } });
		});

		expect(client.User.update).toHaveBeenCalledWith("123", { name: "Updated Name" });
	});

	test("delete mutation executes correctly", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveMutation("User", "delete"),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutate({ id: "123" });
		});

		expect(client.User.delete).toHaveBeenCalledWith("123");
	});

	test("handles mutation error", async () => {
		const client = createMockReactiveClient();
		client.User.create = mock(async () => {
			throw new Error("Creation failed");
		});
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveMutation("User", "create"),
			{ wrapper },
		);

		await act(async () => {
			try {
				await result.current.mutate({ name: "New User" });
			} catch {
				// Expected
			}
		});

		expect(result.current.error?.message).toBe("Creation failed");
		expect(result.current.loading).toBe(false);
	});

	test("reset clears mutation state", async () => {
		const client = createMockReactiveClient();
		const wrapper = createWrapper(client);

		const { result } = renderHook(
			() => useReactiveMutation("User", "create"),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutate({ name: "New User", email: "new@test.com" });
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
