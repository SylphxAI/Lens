/**
 * @lens/server - Server V2 Tests
 *
 * Tests for the operations-based server API.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "zod";
import {
	entity,
	t,
	query,
	mutation,
	createContext,
	runWithContext,
	type ContextValue,
} from "@lens/core";
import { createServerV2 } from "./create-v2";

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
	{ id: "post-2", title: "Test", content: "Post", authorId: "user-1" },
];

// Context type
interface AppContext extends ContextValue {
	db: {
		users: typeof mockUsers;
		posts: typeof mockPosts;
	};
	currentUserId: string | null;
}

// =============================================================================
// Test: Server Creation
// =============================================================================

describe("createServerV2", () => {
	it("creates a server instance", () => {
		const server = createServerV2({
			entities: { User, Post },
		});

		expect(server).toBeDefined();
		expect(typeof server.executeQuery).toBe("function");
		expect(typeof server.executeMutation).toBe("function");
		expect(typeof server.handleWebSocket).toBe("function");
		expect(typeof server.handleRequest).toBe("function");
	});

	it("throws for invalid query definition", () => {
		expect(() =>
			createServerV2({
				entities: { User },
				queries: {
					invalidQuery: { notAQuery: true } as never,
				},
			}),
		).toThrow("Invalid query definition: invalidQuery");
	});

	it("throws for invalid mutation definition", () => {
		expect(() =>
			createServerV2({
				entities: { User },
				mutations: {
					invalidMutation: { notAMutation: true } as never,
				},
			}),
		).toThrow("Invalid mutation definition: invalidMutation");
	});
});

// =============================================================================
// Test: Query Execution
// =============================================================================

describe("executeQuery", () => {
	it("executes a simple query", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServerV2({
			entities: { User },
			queries: { getUsers },
		});

		const result = await server.executeQuery("getUsers");
		expect(result).toEqual(mockUsers);
	});

	it("executes a query with input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => {
				return mockUsers.find((u) => u.id === input.id) ?? null;
			});

		const server = createServerV2({
			entities: { User },
			queries: { getUser },
		});

		const result = await server.executeQuery("getUser", { id: "user-1" });
		expect(result).toEqual(mockUsers[0]);
	});

	it("validates query input", async () => {
		const getUser = query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input }) => mockUsers.find((u) => u.id === input.id) ?? null);

		const server = createServerV2({
			entities: { User },
			queries: { getUser },
		});

		await expect(server.executeQuery("getUser", { id: 123 as unknown as string })).rejects.toThrow(
			"Invalid input for query getUser",
		);
	});

	it("throws for unknown query", async () => {
		const server = createServerV2({
			entities: { User },
			queries: {},
		});

		await expect(server.executeQuery("unknownQuery")).rejects.toThrow("Query not found: unknownQuery");
	});

	it("executes query with context", async () => {
		const ctx = createContext<AppContext>();

		const whoami = query()
			.returns(User)
			.resolve(() => {
				// Access context via useContext would work in real usage
				// For this test, we use the context factory
				return mockUsers[0];
			});

		const server = createServerV2({
			entities: { User },
			queries: { whoami },
			context: () => ({
				db: { users: mockUsers, posts: mockPosts },
				currentUserId: "user-1",
			}),
		});

		const result = await server.executeQuery("whoami");
		expect(result).toEqual(mockUsers[0]);
	});
});

// =============================================================================
// Test: Mutation Execution
// =============================================================================

describe("executeMutation", () => {
	it("executes a simple mutation", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({
				id: "user-new",
				name: input.name,
				email: input.email,
			}));

		const server = createServerV2({
			entities: { User },
			mutations: { createUser },
		});

		const result = await server.executeMutation("createUser", {
			name: "Charlie",
			email: "charlie@example.com",
		});

		expect(result).toEqual({
			id: "user-new",
			name: "Charlie",
			email: "charlie@example.com",
		});
	});

	it("validates mutation input", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string(), email: z.string().email() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", ...input }));

		const server = createServerV2({
			entities: { User },
			mutations: { createUser },
		});

		await expect(
			server.executeMutation("createUser", { name: "Test", email: "invalid-email" }),
		).rejects.toThrow("Invalid input for mutation createUser");
	});

	it("throws for unknown mutation", async () => {
		const server = createServerV2({
			entities: { User },
			mutations: {},
		});

		await expect(server.executeMutation("unknownMutation", {})).rejects.toThrow(
			"Mutation not found: unknownMutation",
		);
	});
});

// =============================================================================
// Test: Query/Mutation Accessors
// =============================================================================

describe("Query and Mutation accessors", () => {
	it("getQuery returns query definition", () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServerV2({
			entities: { User },
			queries: { getUsers },
		});

		expect(server.getQuery("getUsers")).toBeDefined();
		expect(server.getQuery("unknown")).toBeUndefined();
	});

	it("getMutation returns mutation definition", () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServerV2({
			entities: { User },
			mutations: { createUser },
		});

		expect(server.getMutation("createUser")).toBeDefined();
		expect(server.getMutation("unknown")).toBeUndefined();
	});

	it("getQueryNames returns all query names", () => {
		const query1 = query().resolve(() => null);
		const query2 = query().resolve(() => null);

		const server = createServerV2({
			entities: { User },
			queries: { query1, query2 },
		});

		expect(server.getQueryNames()).toEqual(["query1", "query2"]);
	});

	it("getMutationNames returns all mutation names", () => {
		const mut1 = mutation()
			.input(z.object({}))
			.resolve(() => null);
		const mut2 = mutation()
			.input(z.object({}))
			.resolve(() => null);

		const server = createServerV2({
			entities: { User },
			mutations: { mut1, mut2 },
		});

		expect(server.getMutationNames()).toEqual(["mut1", "mut2"]);
	});
});

// =============================================================================
// Test: HTTP Handler
// =============================================================================

describe("handleRequest", () => {
	it("handles query request", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServerV2({
			entities: { User },
			queries: { getUsers },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "query", name: "getUsers" }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.data).toEqual(mockUsers);
	});

	it("handles mutation request", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServerV2({
			entities: { User },
			mutations: { createUser },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "mutation", name: "createUser", input: { name: "Test" } }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.data).toEqual({ id: "new", name: "Test", email: "" });
	});

	it("rejects non-POST requests", async () => {
		const server = createServerV2({
			entities: { User },
		});

		const request = new Request("http://localhost/api", { method: "GET" });
		const response = await server.handleRequest(request);

		expect(response.status).toBe(405);
	});

	it("returns error for invalid operation", async () => {
		const server = createServerV2({
			entities: { User },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "invalid", name: "test" }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(400);
	});

	it("returns error for execution failure", async () => {
		const failingQuery = query().resolve(() => {
			throw new Error("Query failed");
		});

		const server = createServerV2({
			entities: { User },
			queries: { failingQuery },
		});

		const request = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "query", name: "failingQuery" }),
		});

		const response = await server.handleRequest(request);
		expect(response.status).toBe(500);

		const body = await response.json();
		expect(body.error.code).toBe("EXECUTION_ERROR");
		expect(body.error.message).toBe("Query failed");
	});
});

// =============================================================================
// Test: WebSocket Handler
// =============================================================================

describe("handleWebSocket", () => {
	it("handles handshake message", () => {
		const server = createServerV2({
			entities: { User },
			queries: {},
			mutations: {},
			version: "2.1.0",
		});

		const messages: string[] = [];
		const mockWs = {
			send: (data: string) => messages.push(data),
			close: () => {},
			onmessage: null as ((event: { data: string }) => void) | null,
			onclose: null as (() => void) | null,
			onerror: null as ((error: unknown) => void) | null,
		};

		server.handleWebSocket(mockWs);

		// Simulate handshake message
		mockWs.onmessage?.({ data: JSON.stringify({ type: "handshake", id: "hs-1" }) });

		expect(messages.length).toBe(1);
		const response = JSON.parse(messages[0]);
		expect(response.type).toBe("handshake");
		expect(response.id).toBe("hs-1");
		expect(response.version).toBe("2.1.0");
		expect(response.queries).toEqual([]);
		expect(response.mutations).toEqual([]);
	});

	it("handles query message", async () => {
		const getUsers = query()
			.returns([User])
			.resolve(() => mockUsers);

		const server = createServerV2({
			entities: { User },
			queries: { getUsers },
		});

		const messages: string[] = [];
		const mockWs = {
			send: (data: string) => messages.push(data),
			close: () => {},
			onmessage: null as ((event: { data: string }) => void) | null,
			onclose: null as (() => void) | null,
			onerror: null as ((error: unknown) => void) | null,
		};

		server.handleWebSocket(mockWs);

		// Simulate query message
		mockWs.onmessage?.({ data: JSON.stringify({ type: "query", id: "q-1", name: "getUsers" }) });

		// Wait for async execution
		await new Promise((r) => setTimeout(r, 10));

		expect(messages.length).toBe(1);
		const response = JSON.parse(messages[0]);
		expect(response.type).toBe("data");
		expect(response.id).toBe("q-1");
		expect(response.data).toEqual(mockUsers);
	});

	it("handles mutation message", async () => {
		const createUser = mutation()
			.input(z.object({ name: z.string() }))
			.returns(User)
			.resolve(({ input }) => ({ id: "new", name: input.name, email: "" }));

		const server = createServerV2({
			entities: { User },
			mutations: { createUser },
		});

		const messages: string[] = [];
		const mockWs = {
			send: (data: string) => messages.push(data),
			close: () => {},
			onmessage: null as ((event: { data: string }) => void) | null,
			onclose: null as (() => void) | null,
			onerror: null as ((error: unknown) => void) | null,
		};

		server.handleWebSocket(mockWs);

		// Simulate mutation message
		mockWs.onmessage?.({
			data: JSON.stringify({ type: "mutation", id: "m-1", name: "createUser", input: { name: "Test" } }),
		});

		// Wait for async execution
		await new Promise((r) => setTimeout(r, 10));

		expect(messages.length).toBe(1);
		const response = JSON.parse(messages[0]);
		expect(response.type).toBe("result");
		expect(response.id).toBe("m-1");
		expect(response.data).toEqual({ id: "new", name: "Test", email: "" });
	});

	it("handles query error", async () => {
		const failingQuery = query().resolve(() => {
			throw new Error("Query failed");
		});

		const server = createServerV2({
			entities: { User },
			queries: { failingQuery },
		});

		const messages: string[] = [];
		const mockWs = {
			send: (data: string) => messages.push(data),
			close: () => {},
			onmessage: null as ((event: { data: string }) => void) | null,
			onclose: null as (() => void) | null,
			onerror: null as ((error: unknown) => void) | null,
		};

		server.handleWebSocket(mockWs);

		mockWs.onmessage?.({ data: JSON.stringify({ type: "query", id: "q-err", name: "failingQuery" }) });

		// Wait for async execution
		await new Promise((r) => setTimeout(r, 10));

		expect(messages.length).toBe(1);
		const response = JSON.parse(messages[0]);
		expect(response.type).toBe("error");
		expect(response.id).toBe("q-err");
		expect(response.error.code).toBe("QUERY_ERROR");
		expect(response.error.message).toBe("Query failed");
	});

	it("handles parse error", () => {
		const server = createServerV2({
			entities: { User },
		});

		const messages: string[] = [];
		const mockWs = {
			send: (data: string) => messages.push(data),
			close: () => {},
			onmessage: null as ((event: { data: string }) => void) | null,
			onclose: null as (() => void) | null,
			onerror: null as ((error: unknown) => void) | null,
		};

		server.handleWebSocket(mockWs);

		// Send invalid JSON
		mockWs.onmessage?.({ data: "invalid json" });

		expect(messages.length).toBe(1);
		const response = JSON.parse(messages[0]);
		expect(response.type).toBe("error");
		expect(response.error.code).toBe("PARSE_ERROR");
	});
});

// =============================================================================
// Test: Async Generator (Streaming) Support
// =============================================================================

describe("Async generator support", () => {
	it("handles async generator query (returns first value)", async () => {
		const streamQuery = query()
			.returns(User)
			.resolve(async function* () {
				yield mockUsers[0];
				yield mockUsers[1];
			});

		const server = createServerV2({
			entities: { User },
			queries: { streamQuery },
		});

		const result = await server.executeQuery("streamQuery");
		expect(result).toEqual(mockUsers[0]);
	});

	it("handles async generator mutation (returns first value)", async () => {
		const streamMutation = mutation()
			.input(z.object({}))
			.returns(User)
			.resolve(async function* () {
				yield mockUsers[0];
				yield mockUsers[1];
			});

		const server = createServerV2({
			entities: { User },
			mutations: { streamMutation },
		});

		const result = await server.executeMutation("streamMutation", {});
		expect(result).toEqual(mockUsers[0]);
	});
});
