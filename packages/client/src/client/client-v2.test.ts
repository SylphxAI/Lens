/**
 * @lens/client - Client V2 Tests
 *
 * Tests for the operations-based client API.
 */

import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { entity, t, query, mutation } from "@lens/core";
import { createClientV2 } from "./client-v2";
import type { Link, LinkFn, OperationResult } from "../links/types";

// =============================================================================
// Test Fixtures
// =============================================================================

// Entities
const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
});

const Post = entity("Post", {
	id: t.id(),
	title: t.string(),
	content: t.string(),
	authorId: t.string(),
});

// Mock data
const mockUsers = [
	{ id: "user-1", name: "Alice", email: "alice@example.com" },
	{ id: "user-2", name: "Bob", email: "bob@example.com" },
];

const mockPosts = [
	{ id: "post-1", title: "Hello", content: "World", authorId: "user-1" },
];

// Create mock terminal link for V2 operations
function createMockV2Link(handlers: {
	query?: Record<string, (input: unknown) => Promise<unknown>>;
	mutation?: Record<string, (input: unknown) => Promise<unknown>>;
}): Link {
	return (): LinkFn => {
		return async (op): Promise<OperationResult> => {
			try {
				const handlerMap = op.type === "query" ? handlers.query : handlers.mutation;
				const handler = handlerMap?.[op.op];

				if (!handler) {
					return { error: new Error(`Unknown operation: ${op.op}`) };
				}

				const data = await handler(op.input);
				return { data };
			} catch (error) {
				return { error: error as Error };
			}
		};
	};
}

// Default mock handlers
const createDefaultMockHandlers = () => ({
	query: {
		getUsers: async () => mockUsers,
		getUser: async (input: unknown) => {
			const { id } = input as { id: string };
			return mockUsers.find((u) => u.id === id) ?? null;
		},
		whoami: async () => mockUsers[0],
		searchUsers: async (input: unknown) => {
			const { query } = input as { query: string };
			return mockUsers.filter((u) =>
				u.name.toLowerCase().includes(query.toLowerCase()),
			);
		},
		failingQuery: async () => {
			throw new Error("Query failed");
		},
	},
	mutation: {
		createUser: async (input: unknown) => {
			const { name, email } = input as { name: string; email: string };
			return { id: `user-${Date.now()}`, name, email };
		},
		updateUser: async (input: unknown) => {
			const { id, ...rest } = input as { id: string; name?: string; email?: string };
			const user = mockUsers.find((u) => u.id === id);
			if (!user) throw new Error("User not found");
			return { ...user, ...rest };
		},
		createPost: async (input: unknown) => {
			const { title, content } = input as { title: string; content: string };
			return { id: `post-${Date.now()}`, title, content, authorId: "user-1" };
		},
		failingMutation: async () => {
			throw new Error("Mutation failed");
		},
	},
});

// =============================================================================
// Test: Client Creation
// =============================================================================

describe("createClientV2", () => {
	it("creates a client instance", () => {
		const client = createClientV2({
			queries: {},
			mutations: {},
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		expect(client).toBeDefined();
		expect(client.query).toBeDefined();
		expect(client.mutation).toBeDefined();
		expect(client.$store).toBeDefined();
		expect(typeof client.$execute).toBe("function");
	});

	it("throws without links", () => {
		expect(() =>
			createClientV2({
				queries: {},
				mutations: {},
				links: [],
			}),
		).toThrow("At least one link is required");
	});

	it("exposes query and mutation names", () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", ...input }));

		const client = createClientV2({
			queries: { getUsers },
			mutations: { createUser },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		expect(client.$queryNames()).toEqual(["getUsers"]);
		expect(client.$mutationNames()).toEqual(["createUser"]);
	});
});

// =============================================================================
// Test: Query Execution
// =============================================================================

describe("client.query", () => {
	it("executes query without input", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const client = createClientV2({
			queries: { getUsers },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		const result = await client.query.getUsers();
		expect(result).toEqual(mockUsers);
	});

	it("executes query with input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const client = createClientV2({
			queries: { getUser },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		const result = await client.query.getUser({ id: "user-1" });
		expect(result).toEqual(mockUsers[0]);
	});

	it("executes query with search input", async () => {
		const searchUsers = query()
			.input(z.object({ query: z.string() }))
			.returns([User])
			.resolve(({ input }) =>
				mockUsers.filter((u) =>
					u.name.toLowerCase().includes(input.query.toLowerCase()),
				),
			);

		const client = createClientV2({
			queries: { searchUsers },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		const result = await client.query.searchUsers({ query: "alice" });
		expect(result).toEqual([mockUsers[0]]);
	});

	it("handles query error", async () => {
		const failingQuery = query().resolve(() => {
			throw new Error("Query failed");
		});

		const client = createClientV2({
			queries: { failingQuery },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		await expect(client.query.failingQuery()).rejects.toThrow("Query failed");
	});
});

// =============================================================================
// Test: Mutation Execution
// =============================================================================

describe("client.mutation", () => {
	it("executes mutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", ...input }));

		const client = createClientV2({
			mutations: { createUser },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		const result = await client.mutation.createUser({
			name: "Charlie",
			email: "charlie@example.com",
		});

		expect(result.data).toMatchObject({
			name: "Charlie",
			email: "charlie@example.com",
		});
	});

	it("returns rollback function for mutations", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", ...input }));

		const client = createClientV2({
			mutations: { createUser },
			links: [createMockV2Link(createDefaultMockHandlers())],
			optimistic: true,
		});

		const result = await client.mutation.createUser({
			name: "Charlie",
			email: "charlie@example.com",
		});

		// No optimistic handler, so no rollback
		expect(result.rollback).toBeUndefined();
	});

	it("handles mutation error", async () => {
		const failingMutation = mutation()
			.input(z.object({}))
			.returns(User)
			.resolve(() => {
				throw new Error("Mutation failed");
			});

		const client = createClientV2({
			mutations: { failingMutation },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		await expect(client.mutation.failingMutation({})).rejects.toThrow("Mutation failed");
	});

	it("can disable optimistic updates per mutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const client = createClientV2({
			mutations: { createUser },
			links: [createMockV2Link(createDefaultMockHandlers())],
			optimistic: true,
		});

		const result = await client.mutation.createUser(
			{ name: "Test" },
			{ optimistic: false },
		);

		expect(result.data).toBeDefined();
		expect(result.rollback).toBeUndefined();
	});
});

// =============================================================================
// Test: Raw Execute
// =============================================================================

describe("$execute", () => {
	it("executes raw query", async () => {
		const client = createClientV2({
			queries: {},
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		const result = await client.$execute("query", "getUsers", undefined);
		expect(result.data).toEqual(mockUsers);
	});

	it("executes raw mutation", async () => {
		const client = createClientV2({
			mutations: {},
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		const result = await client.$execute("mutation", "createUser", {
			name: "Test",
			email: "test@example.com",
		});

		expect(result.data).toMatchObject({
			name: "Test",
			email: "test@example.com",
		});
	});
});

// =============================================================================
// Test: Type Safety (compile-time tests)
// =============================================================================

describe("Type Safety", () => {
	it("infers correct query types", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const client = createClientV2({
			queries: { getUser, getUsers },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		// These should type-check correctly
		const user = await client.query.getUser({ id: "user-1" });
		const users = await client.query.getUsers();

		expect(user).toBeDefined();
		expect(users).toBeDefined();
	});

	it("infers correct mutation types", async () => {
		const createPost = mutation()
			.input(z.object({ title: z.string(), content: z.string() }))
			.returns(Post)
			.resolve(({ input }) => ({
				id: "new",
				title: input.title,
				content: input.content,
				authorId: "user-1",
			}));

		const client = createClientV2({
			mutations: { createPost },
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		// This should type-check correctly
		const result = await client.mutation.createPost({
			title: "Test",
			content: "Content",
		});

		expect(result.data.title).toBe("Test");
		expect(result.data.content).toBe("Content");
	});
});

// =============================================================================
// Test: Store Integration
// =============================================================================

describe("Store Integration", () => {
	it("provides access to underlying store", () => {
		const client = createClientV2({
			queries: {},
			mutations: {},
			links: [createMockV2Link(createDefaultMockHandlers())],
		});

		expect(client.$store).toBeDefined();
		expect(typeof client.$store.getEntity).toBe("function");
		expect(typeof client.$store.setEntity).toBe("function");
	});
});
