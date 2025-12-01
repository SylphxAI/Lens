/**
 * Tests for hydration utilities
 *
 * NOTE: These tests require DOM environment (happy-dom).
 */

// Skip all tests if DOM is not available (when run from root)
const hasDom = typeof document !== "undefined";

import { test as bunTest, describe, expect } from "bun:test";

const test = hasDom ? bunTest : bunTest.skip;

import { renderHook } from "@testing-library/react";
import { createElement } from "react";
import { HydrationBoundary, useHydration } from "./hydration.js";
import type { DehydratedState } from "./index.js";

describe("HydrationBoundary", () => {
	test("renders children", () => {
		const state: DehydratedState = {
			queries: { user: { id: "1", name: "Test" } },
			timestamp: Date.now(),
		};

		const TestChild = () => createElement("div", {}, "Test Child");
		const wrapper = createElement(HydrationBoundary, { state }, createElement(TestChild));

		expect(wrapper).toBeDefined();
		expect(wrapper.type).toBe(HydrationBoundary);
		expect(wrapper.props.state).toBe(state);
	});

	test("passes state to context", () => {
		const state: DehydratedState = {
			queries: { user: { id: "1", name: "Test" } },
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect(result.current).toBe(state);
		expect(result.current?.queries.user).toEqual({ id: "1", name: "Test" });
	});

	test("handles empty queries", () => {
		const state: DehydratedState = {
			queries: {},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect(result.current).toBe(state);
		expect(result.current?.queries).toEqual({});
	});

	test("handles nested queries", () => {
		const state: DehydratedState = {
			queries: {
				user: { id: "1", name: "User 1" },
				posts: [
					{ id: "post-1", title: "Post 1" },
					{ id: "post-2", title: "Post 2" },
				],
				metadata: {
					nested: {
						deeply: {
							value: "deep",
						},
					},
				},
			},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect(result.current?.queries.user).toEqual({ id: "1", name: "User 1" });
		expect(result.current?.queries.posts).toHaveLength(2);
		expect((result.current?.queries.metadata as any).nested.deeply.value).toBe("deep");
	});

	test("supports multiple children", () => {
		const state: DehydratedState = {
			queries: { data: "test" },
			timestamp: Date.now(),
		};

		const Child1 = () => createElement("div", {}, "Child 1");
		const Child2 = () => createElement("div", {}, "Child 2");
		const wrapper = createElement(HydrationBoundary, { state }, createElement(Child1), createElement(Child2));

		expect(wrapper).toBeDefined();
		expect(wrapper.props.children).toHaveLength(2);
	});

	test("handles state updates", () => {
		let currentState: DehydratedState = {
			queries: { version: 1 },
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state: currentState }, children);

		const { result, rerender } = renderHook(() => useHydration(), { wrapper });

		expect(result.current?.queries.version).toBe(1);

		// Update state
		currentState = {
			queries: { version: 2 },
			timestamp: Date.now(),
		};

		rerender();

		expect(result.current?.queries.version).toBe(2);
	});
});

describe("useHydration", () => {
	test("returns null when used outside HydrationBoundary", () => {
		const { result } = renderHook(() => useHydration());

		expect(result.current).toBe(null);
	});

	test("returns hydrated state when used inside HydrationBoundary", () => {
		const state: DehydratedState = {
			queries: { user: { id: "123", name: "John Doe" } },
			timestamp: 1234567890,
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect(result.current).not.toBe(null);
		expect(result.current?.queries).toEqual({ user: { id: "123", name: "John Doe" } });
		expect(result.current?.timestamp).toBe(1234567890);
	});

	test("handles complex nested data structures", () => {
		const state: DehydratedState = {
			queries: {
				user: {
					id: "1",
					profile: {
						name: "John",
						settings: {
							theme: "dark",
							notifications: {
								email: true,
								push: false,
							},
						},
					},
				},
				items: [1, 2, 3],
			},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		const user = result.current?.queries.user as any;
		expect(user.profile.settings.theme).toBe("dark");
		expect(user.profile.settings.notifications.email).toBe(true);
		expect(result.current?.queries.items).toEqual([1, 2, 3]);
	});

	test("returns consistent reference for same state", () => {
		const state: DehydratedState = {
			queries: { data: "test" },
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result, rerender } = renderHook(() => useHydration(), { wrapper });

		const firstResult = result.current;
		rerender();
		const secondResult = result.current;

		expect(firstResult).toBe(secondResult);
	});

	test("handles null values in queries", () => {
		const state: DehydratedState = {
			queries: {
				user: null,
				posts: null,
				active: false,
			},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect(result.current?.queries.user).toBe(null);
		expect(result.current?.queries.posts).toBe(null);
		expect(result.current?.queries.active).toBe(false);
	});

	test("handles undefined values in queries", () => {
		const state: DehydratedState = {
			queries: {
				user: undefined,
				count: 0,
			},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect(result.current?.queries.user).toBe(undefined);
		expect(result.current?.queries.count).toBe(0);
	});

	test("works with nested HydrationBoundary (inner wins)", () => {
		const outerState: DehydratedState = {
			queries: { source: "outer" },
			timestamp: 1000,
		};

		const innerState: DehydratedState = {
			queries: { source: "inner" },
			timestamp: 2000,
		};

		const outerWrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state: outerState }, children);

		const innerWrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state: innerState }, children);

		const { result } = renderHook(() => useHydration(), {
			wrapper: ({ children }) => outerWrapper({ children: innerWrapper({ children }) }),
		});

		// Inner context should take precedence
		expect(result.current?.queries.source).toBe("inner");
		expect(result.current?.timestamp).toBe(2000);
	});

	test("handles array data in queries", () => {
		const state: DehydratedState = {
			queries: {
				users: [
					{ id: "1", name: "User 1" },
					{ id: "2", name: "User 2" },
					{ id: "3", name: "User 3" },
				],
			},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		const users = result.current?.queries.users as any[];
		expect(users).toHaveLength(3);
		expect(users[0].name).toBe("User 1");
		expect(users[2].id).toBe("3");
	});

	test("handles Date objects in queries", () => {
		const now = new Date();
		const state: DehydratedState = {
			queries: {
				createdAt: now,
				metadata: {
					date: now.toISOString(),
				},
			},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect(result.current?.queries.createdAt).toBe(now);
		expect((result.current?.queries.metadata as any).date).toBe(now.toISOString());
	});

	test("handles special characters in query keys", () => {
		const state: DehydratedState = {
			queries: {
				"user:123": { id: "123" },
				"posts/recent": ["post1", "post2"],
				"cache.data": { value: "cached" },
			},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect((result.current?.queries["user:123"] as any).id).toBe("123");
		expect(result.current?.queries["posts/recent"]).toEqual(["post1", "post2"]);
		expect((result.current?.queries["cache.data"] as any).value).toBe("cached");
	});

	test("timestamp is accessible", () => {
		const timestamp = 1234567890123;
		const state: DehydratedState = {
			queries: {},
			timestamp,
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(() => useHydration(), { wrapper });

		expect(result.current?.timestamp).toBe(timestamp);
	});

	test("can be used multiple times in same component", () => {
		const state: DehydratedState = {
			queries: { data: "test" },
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const TestComponent = () => {
			const hydration1 = useHydration();
			const hydration2 = useHydration();
			return { hydration1, hydration2 };
		};

		const { result } = renderHook(() => TestComponent(), { wrapper });

		expect(result.current.hydration1).toBe(result.current.hydration2);
		expect(result.current.hydration1?.queries.data).toBe("test");
	});
});

describe("HydrationBoundary - integration scenarios", () => {
	test("simulates SSR data passing", () => {
		// Simulate server-fetched data
		const serverData = {
			user: { id: "server-1", name: "Server User" },
			posts: [{ id: "post-1", title: "Server Post" }],
		};

		const dehydratedState: DehydratedState = {
			queries: serverData,
			timestamp: Date.now(),
		};

		// Simulate client component receiving server data
		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state: dehydratedState }, children);

		const { result } = renderHook(
			() => {
				const hydration = useHydration();
				// Client component would use this as initial data
				const initialUser = hydration?.queries.user;
				return initialUser;
			},
			{ wrapper },
		);

		expect(result.current).toEqual({ id: "server-1", name: "Server User" });
	});

	test("handles stale data based on timestamp", () => {
		const oldTimestamp = Date.now() - 60000; // 1 minute ago
		const state: DehydratedState = {
			queries: { data: "old" },
			timestamp: oldTimestamp,
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(
			() => {
				const hydration = useHydration();
				const isStale = hydration && Date.now() - hydration.timestamp > 30000; // 30s threshold
				return { isStale, data: hydration?.queries.data };
			},
			{ wrapper },
		);

		expect(result.current.isStale).toBe(true);
		expect(result.current.data).toBe("old");
	});

	test("handles fresh data based on timestamp", () => {
		const freshTimestamp = Date.now();
		const state: DehydratedState = {
			queries: { data: "fresh" },
			timestamp: freshTimestamp,
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(
			() => {
				const hydration = useHydration();
				const isStale = hydration && Date.now() - hydration.timestamp > 30000;
				return { isStale, data: hydration?.queries.data };
			},
			{ wrapper },
		);

		expect(result.current.isStale).toBe(false);
		expect(result.current.data).toBe("fresh");
	});

	test("fallback pattern when hydration is unavailable", () => {
		const { result } = renderHook(() => {
			const hydration = useHydration();
			const data = hydration?.queries.user ?? { id: "default", name: "Default User" };
			return data;
		});

		expect(result.current).toEqual({ id: "default", name: "Default User" });
	});

	test("selective hydration by key", () => {
		const state: DehydratedState = {
			queries: {
				user: { id: "1", name: "User" },
				posts: ["post1", "post2"],
				settings: { theme: "dark" },
			},
			timestamp: Date.now(),
		};

		const wrapper = ({ children }: { children: React.ReactNode }) =>
			createElement(HydrationBoundary, { state }, children);

		const { result } = renderHook(
			() => {
				const hydration = useHydration();
				return {
					user: hydration?.queries.user,
					settings: hydration?.queries.settings,
				};
			},
			{ wrapper },
		);

		expect(result.current.user).toEqual({ id: "1", name: "User" });
		expect(result.current.settings).toEqual({ theme: "dark" });
	});
});
