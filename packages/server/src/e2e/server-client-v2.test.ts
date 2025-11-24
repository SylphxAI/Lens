/**
 * @lens - End-to-End Server-Client V2 Tests
 *
 * Full integration tests for operations-based API:
 * Server V2 → Client V2 → Query/Mutation execution → Response
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { z } from "zod";
import { entity, t, query, mutation, createContext, runWithContext, type ContextValue } from "@lens/core";
import { createServerV2, type LensServerV2 } from "../index";

// =============================================================================
// Test Schema
// =============================================================================

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

// =============================================================================
// Test Data
// =============================================================================

const testUsers = [
	{ id: "user-1", name: "Alice", email: "alice@test.com" },
	{ id: "user-2", name: "Bob", email: "bob@test.com" },
];

const testPosts = [
	{ id: "post-1", title: "Hello World", content: "First post", authorId: "user-1" },
	{ id: "post-2", title: "Second Post", content: "More content", authorId: "user-1" },
];

// =============================================================================
// Context Type
// =============================================================================

interface AppContext extends ContextValue {
	currentUserId: string | null;
}

// =============================================================================
// Operations
// =============================================================================

// Queries
const getUsers = query()
	.returns([User])
	.resolve(() => testUsers);

const getUser = query()
	.input(z.object({ id: z.string() }))
	.returns(User)
	.resolve(({ input }) => testUsers.find((u) => u.id === input.id) ?? null);

const whoami = query()
	.returns(User)
	.resolve(() => {
		// In real app, would use context
		return testUsers[0];
	});

const searchUsers = query()
	.input(z.object({ query: z.string() }))
	.returns([User])
	.resolve(({ input }) =>
		testUsers.filter((u) =>
			u.name.toLowerCase().includes(input.query.toLowerCase()) ||
			u.email.toLowerCase().includes(input.query.toLowerCase()),
		),
	);

const getPosts = query()
	.returns([Post])
	.resolve(() => testPosts);

const getPostsByAuthor = query()
	.input(z.object({ authorId: z.string() }))
	.returns([Post])
	.resolve(({ input }) => testPosts.filter((p) => p.authorId === input.authorId));

// Mutations
const createUser = mutation()
	.input(z.object({ name: z.string(), email: z.string().email() }))
	.returns(User)
	.resolve(({ input }) => ({
		id: `user-${Date.now()}`,
		name: input.name,
		email: input.email,
	}));

const updateUser = mutation()
	.input(z.object({ id: z.string(), name: z.string().optional(), email: z.string().email().optional() }))
	.returns(User)
	.resolve(({ input }) => {
		const user = testUsers.find((u) => u.id === input.id);
		if (!user) throw new Error("User not found");
		return {
			...user,
			...(input.name && { name: input.name }),
			...(input.email && { email: input.email }),
		};
	});

const createPost = mutation()
	.input(z.object({ title: z.string(), content: z.string() }))
	.returns(Post)
	.resolve(({ input }) => ({
		id: `post-${Date.now()}`,
		title: input.title,
		content: input.content,
		authorId: "user-1", // Would use context in real app
	}));

const deletePost = mutation()
	.input(z.object({ id: z.string() }))
	.returns(z.object({ success: z.boolean() }))
	.resolve(({ input }) => {
		const post = testPosts.find((p) => p.id === input.id);
		if (!post) throw new Error("Post not found");
		return { success: true };
	});

// Collect operations
const queries = { getUsers, getUser, whoami, searchUsers, getPosts, getPostsByAuthor };
const mutations = { createUser, updateUser, createPost, deletePost };

// =============================================================================
// Test Suite
// =============================================================================

describe("Server-Client V2 E2E", () => {
	let server: LensServerV2;
	const PORT = 4567;
	const BASE_URL = `http://localhost:${PORT}`;

	beforeAll(async () => {
		server = createServerV2({
			entities: { User, Post },
			queries,
			mutations,
			context: () => ({ currentUserId: "user-1" }),
		});

		await server.listen(PORT);
	});

	afterAll(async () => {
		await server.close();
	});

	// =========================================================================
	// Query Tests
	// =========================================================================

	describe("Queries via HTTP", () => {
		it("executes query without input", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "query", name: "getUsers" }),
			});

			expect(response.ok).toBe(true);
			const result = await response.json();
			expect(result.data).toEqual(testUsers);
		});

		it("executes query with input", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "query",
					name: "getUser",
					input: { id: "user-1" },
				}),
			});

			expect(response.ok).toBe(true);
			const result = await response.json();
			expect(result.data).toEqual(testUsers[0]);
		});

		it("executes search query", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "query",
					name: "searchUsers",
					input: { query: "alice" },
				}),
			});

			expect(response.ok).toBe(true);
			const result = await response.json();
			expect(result.data).toHaveLength(1);
			expect(result.data[0].name).toBe("Alice");
		});

		it("returns null for non-existent entity", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "query",
					name: "getUser",
					input: { id: "non-existent" },
				}),
			});

			expect(response.ok).toBe(true);
			const result = await response.json();
			expect(result.data).toBe(null);
		});

		it("returns error for unknown query", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "query",
					name: "unknownQuery",
				}),
			});

			expect(response.status).toBe(500);
			const result = await response.json();
			expect(result.error).toBeDefined();
		});
	});

	// =========================================================================
	// Mutation Tests
	// =========================================================================

	describe("Mutations via HTTP", () => {
		it("executes create mutation", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "mutation",
					name: "createUser",
					input: { name: "Charlie", email: "charlie@test.com" },
				}),
			});

			expect(response.ok).toBe(true);
			const result = await response.json();
			expect(result.data.name).toBe("Charlie");
			expect(result.data.email).toBe("charlie@test.com");
			expect(result.data.id).toMatch(/^user-/);
		});

		it("executes update mutation", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "mutation",
					name: "updateUser",
					input: { id: "user-1", name: "Alice Updated" },
				}),
			});

			expect(response.ok).toBe(true);
			const result = await response.json();
			expect(result.data.name).toBe("Alice Updated");
			expect(result.data.email).toBe("alice@test.com");
		});

		it("validates mutation input", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "mutation",
					name: "createUser",
					input: { name: "Test", email: "not-an-email" },
				}),
			});

			expect(response.status).toBe(500);
			const result = await response.json();
			expect(result.error).toBeDefined();
		});

		it("returns error for unknown mutation", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "mutation",
					name: "unknownMutation",
					input: {},
				}),
			});

			expect(response.status).toBe(500);
			const result = await response.json();
			expect(result.error).toBeDefined();
		});
	});

	// =========================================================================
	// Server API Tests
	// =========================================================================

	describe("Server API", () => {
		it("rejects non-POST requests", async () => {
			const response = await fetch(BASE_URL, { method: "GET" });
			expect(response.status).toBe(405);
		});

		it("rejects invalid operation type", async () => {
			const response = await fetch(BASE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "invalid", name: "test" }),
			});

			expect(response.status).toBe(400);
		});
	});

	// =========================================================================
	// Direct Server Execution Tests
	// =========================================================================

	describe("Direct Server Execution", () => {
		it("executeQuery works directly", async () => {
			const result = await server.executeQuery("getUsers");
			expect(result).toEqual(testUsers);
		});

		it("executeQuery with input works directly", async () => {
			const result = await server.executeQuery("getUser", { id: "user-2" });
			expect(result).toEqual(testUsers[1]);
		});

		it("executeMutation works directly", async () => {
			const result = await server.executeMutation("createPost", {
				title: "New Post",
				content: "Content here",
			});

			expect(result).toMatchObject({
				title: "New Post",
				content: "Content here",
			});
		});

		it("getQueryNames returns all queries", () => {
			const names = server.getQueryNames();
			expect(names).toContain("getUsers");
			expect(names).toContain("getUser");
			expect(names).toContain("whoami");
			expect(names).toContain("searchUsers");
		});

		it("getMutationNames returns all mutations", () => {
			const names = server.getMutationNames();
			expect(names).toContain("createUser");
			expect(names).toContain("updateUser");
			expect(names).toContain("createPost");
		});
	});
});
