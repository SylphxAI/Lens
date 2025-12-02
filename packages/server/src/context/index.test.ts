/**
 * @sylphx/lens-core - Context System Tests
 *
 * Tests for AsyncLocalStorage-based context.
 */

import { describe, expect, it } from "bun:test";
import {
	createContext,
	extendContext,
	hasContext,
	runWithContext,
	runWithContextAsync,
	tryUseContext,
	useContext,
} from "./index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

interface TestContext {
	db: { query: (sql: string) => string[] };
	currentUser: { id: string; name: string } | null;
	requestId: string;
}

const mockDb = {
	query: (sql: string) => [`result for: ${sql}`],
};

const mockUser = { id: "user-1", name: "John" };

// =============================================================================
// Test: createContext & useContext
// =============================================================================

describe("createContext & useContext", () => {
	it("creates a context and accesses it", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			const context = useContext<TestContext>();
			expect(context.db).toBe(mockDb);
			expect(context.currentUser).toBe(mockUser);
			expect(context.requestId).toBe("req-1");
		});
	});

	it("useContext throws outside of context", () => {
		expect(() => useContext()).toThrow("useContext() called outside of context");
	});

	it("useContext throws with correct error message", () => {
		expect(() => useContext()).toThrow(
			"useContext() called outside of context. Make sure to wrap your code with runWithContext() or use explicit ctx parameter.",
		);
	});

	it("tryUseContext returns undefined outside of context", () => {
		const ctx = tryUseContext<TestContext>();
		expect(ctx).toBeUndefined();
	});

	it("tryUseContext returns context when available", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			const context = tryUseContext<TestContext>();
			expect(context).toBeDefined();
			expect(context?.currentUser).toBe(mockUser);
		});
	});

	it("useContext without type parameter uses default ContextValue type", () => {
		const ctx = createContext<{ value: string }>();

		runWithContext(ctx, { value: "test" }, () => {
			const context = useContext();
			expect(context).toHaveProperty("value");
			expect((context as { value: string }).value).toBe("test");
		});
	});

	it("tryUseContext without type parameter uses default ContextValue type", () => {
		const ctx = createContext<{ value: string }>();

		runWithContext(ctx, { value: "test" }, () => {
			const context = tryUseContext();
			expect(context).toBeDefined();
			expect((context as { value: string }).value).toBe("test");
		});
	});

	it("createContext returns a ContextStore", () => {
		const ctx = createContext<TestContext>();
		expect(ctx).toBeDefined();
		expect(typeof ctx.run).toBe("function");
		expect(typeof ctx.getStore).toBe("function");
	});

	it("multiple contexts share the same underlying store", () => {
		const ctx1 = createContext<TestContext>();
		const ctx2 = createContext<TestContext>();

		// Both should be the same store instance (type-casted)
		expect(ctx1).toBe(ctx2);
	});
});

// =============================================================================
// Test: runWithContext
// =============================================================================

describe("runWithContext", () => {
	it("runs synchronous function with context", () => {
		const ctx = createContext<TestContext>();

		const result = runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			const context = useContext<TestContext>();
			return context.currentUser?.name;
		});

		expect(result).toBe("John");
	});

	it("runs async function with context", async () => {
		const ctx = createContext<TestContext>();

		const result = await runWithContextAsync(
			ctx,
			{ db: mockDb, currentUser: mockUser, requestId: "req-1" },
			async () => {
				await new Promise((r) => setTimeout(r, 1));
				const context = useContext<TestContext>();
				return context.currentUser?.name;
			},
		);

		expect(result).toBe("John");
	});

	it("context is isolated between runs", () => {
		const ctx = createContext<TestContext>();

		const results: string[] = [];

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			results.push(useContext<TestContext>().requestId);
		});

		runWithContext(ctx, { db: mockDb, currentUser: null, requestId: "req-2" }, () => {
			results.push(useContext<TestContext>().requestId);
		});

		expect(results).toEqual(["req-1", "req-2"]);
	});

	it("nested contexts work correctly", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "outer" }, () => {
			expect(useContext<TestContext>().requestId).toBe("outer");

			runWithContext(ctx, { db: mockDb, currentUser: null, requestId: "inner" }, () => {
				expect(useContext<TestContext>().requestId).toBe("inner");
			});

			// After inner context, outer is restored
			expect(useContext<TestContext>().requestId).toBe("outer");
		});
	});

	it("returns the function result", () => {
		const ctx = createContext<TestContext>();

		const result = runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			return 42;
		});

		expect(result).toBe(42);
	});

	it("propagates errors thrown in function", () => {
		const ctx = createContext<TestContext>();

		expect(() => {
			runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
				throw new Error("Test error");
			});
		}).toThrow("Test error");
	});

	it("propagates errors in async function", async () => {
		const ctx = createContext<TestContext>();

		await expect(
			runWithContextAsync(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, async () => {
				throw new Error("Async test error");
			}),
		).rejects.toThrow("Async test error");
	});

	it("cleans up context after error", () => {
		const ctx = createContext<TestContext>();

		try {
			runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
				throw new Error("Error");
			});
		} catch {
			// Error expected
		}

		// Context should be cleaned up after error
		expect(() => useContext()).toThrow("useContext() called outside of context");
	});

	it("works with different context types", () => {
		interface OtherContext {
			config: { apiUrl: string };
			logger: { log: (msg: string) => void };
		}

		const ctx = createContext<OtherContext>();
		const config = { apiUrl: "https://api.example.com" };
		const logger = { log: (msg: string) => msg };

		const result = runWithContext(ctx, { config, logger }, () => {
			const context = useContext<OtherContext>();
			return context.config.apiUrl;
		});

		expect(result).toBe("https://api.example.com");
	});

	it("runWithContextAsync is an alias for runWithContext with async", async () => {
		const ctx = createContext<TestContext>();

		const result1 = await runWithContextAsync(
			ctx,
			{ db: mockDb, currentUser: mockUser, requestId: "req-1" },
			async () => {
				return "async result";
			},
		);

		const result2 = await runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-2" }, async () => {
			return "async result";
		});

		expect(result1).toBe(result2);
	});
});

// =============================================================================
// Test: Utilities
// =============================================================================

describe("hasContext", () => {
	it("returns false outside context", () => {
		expect(hasContext()).toBe(false);
	});

	it("returns true inside context", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			expect(hasContext()).toBe(true);
		});
	});

	it("returns false after context exits", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			expect(hasContext()).toBe(true);
		});

		// After context exits, should return false
		expect(hasContext()).toBe(false);
	});
});

describe("extendContext", () => {
	it("extends context with additional values", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			const current = useContext<TestContext>();
			const extended = extendContext(current, { extra: "value" });

			expect(extended.db).toBe(mockDb);
			expect(extended.currentUser).toBe(mockUser);
			expect(extended.extra).toBe("value");
		});
	});

	it("can be used with nested runWithContext", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			const current = useContext<TestContext>();
			const extended = extendContext(current, { requestId: "req-extended" });

			runWithContext(ctx, extended, () => {
				const inner = useContext<TestContext>();
				expect(inner.db).toBe(mockDb);
				expect(inner.requestId).toBe("req-extended");
			});
		});
	});

	it("overrides properties with same keys", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "original" }, () => {
			const current = useContext<TestContext>();
			const extended = extendContext(current, { requestId: "overridden", currentUser: null });

			expect(extended.requestId).toBe("overridden");
			expect(extended.currentUser).toBeNull();
			expect(extended.db).toBe(mockDb); // unchanged
		});
	});

	it("does not mutate original context", () => {
		const original = { db: mockDb, currentUser: mockUser, requestId: "req-1" };
		const extension = { extra: "value" };

		const extended = extendContext(original, extension);

		expect(original).not.toHaveProperty("extra");
		expect(extended).toHaveProperty("extra");
		expect(original.db).toBe(mockDb);
		expect(extended.db).toBe(mockDb);
	});

	it("works with empty extension object", () => {
		const ctx = createContext<TestContext>();

		runWithContext(ctx, { db: mockDb, currentUser: mockUser, requestId: "req-1" }, () => {
			const current = useContext<TestContext>();
			const extended = extendContext(current, {});

			expect(extended.db).toBe(mockDb);
			expect(extended.currentUser).toBe(mockUser);
			expect(extended.requestId).toBe("req-1");
		});
	});
});

// =============================================================================
// Test: Real-world Usage Pattern
// =============================================================================

describe("Real-world usage pattern", () => {
	interface AppContext {
		db: typeof mockDb;
		currentUser: { id: string; name: string } | null;
	}

	// Define composables like in real app
	const useDB = () => useContext<AppContext>().db;
	const useCurrentUser = () => useContext<AppContext>().currentUser;

	// Simulate a resolver function
	async function getUserPosts() {
		const db = useDB();
		const user = useCurrentUser();
		if (!user) throw new Error("Not authenticated");
		return db.query(`SELECT * FROM posts WHERE authorId = '${user.id}'`);
	}

	it("works with resolver pattern", async () => {
		const ctx = createContext<AppContext>();

		const posts = await runWithContextAsync(ctx, { db: mockDb, currentUser: mockUser }, async () => {
			return getUserPosts();
		});

		expect(posts).toEqual(["result for: SELECT * FROM posts WHERE authorId = 'user-1'"]);
	});

	it("throws when not authenticated", async () => {
		const ctx = createContext<AppContext>();

		await expect(
			runWithContextAsync(ctx, { db: mockDb, currentUser: null }, async () => {
				return getUserPosts();
			}),
		).rejects.toThrow("Not authenticated");
	});
});

// =============================================================================
// Test: Concurrent Requests
// =============================================================================

describe("Concurrent requests", () => {
	it("maintains isolation between concurrent async operations", async () => {
		const ctx = createContext<TestContext>();
		const results: string[] = [];

		const task1 = runWithContextAsync(ctx, { db: mockDb, currentUser: mockUser, requestId: "task-1" }, async () => {
			await new Promise((r) => setTimeout(r, 10));
			results.push(`1: ${useContext<TestContext>().requestId}`);
			await new Promise((r) => setTimeout(r, 10));
			results.push(`1: ${useContext<TestContext>().requestId}`);
		});

		const task2 = runWithContextAsync(ctx, { db: mockDb, currentUser: null, requestId: "task-2" }, async () => {
			await new Promise((r) => setTimeout(r, 5));
			results.push(`2: ${useContext<TestContext>().requestId}`);
			await new Promise((r) => setTimeout(r, 15));
			results.push(`2: ${useContext<TestContext>().requestId}`);
		});

		await Promise.all([task1, task2]);

		// Each task should see its own context throughout
		expect(results.filter((r) => r.startsWith("1:"))).toEqual(["1: task-1", "1: task-1"]);
		expect(results.filter((r) => r.startsWith("2:"))).toEqual(["2: task-2", "2: task-2"]);
	});
});
