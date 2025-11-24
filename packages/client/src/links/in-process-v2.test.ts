/**
 * @lens/client - In-Process Link V2 Tests
 */

import { describe, it, expect, mock } from "bun:test";
import { inProcessLinkV2, createInProcessLinkV2, type InProcessServerV2 } from "./in-process-v2";
import { createOperationContext } from "./types";

// =============================================================================
// Mock Data
// =============================================================================

const mockUsers = [
	{ id: "user-1", name: "Alice", email: "alice@test.com" },
	{ id: "user-2", name: "Bob", email: "bob@test.com" },
];

// =============================================================================
// Tests: With Handlers
// =============================================================================

describe("inProcessLinkV2 with handlers", () => {
	it("executes query handler", async () => {
		const link = inProcessLinkV2({
			handlers: {
				query: {
					getUsers: async () => mockUsers,
				},
			},
		});
		const linkFn = link();

		const op = createOperationContext("query", "operation", "getUsers", undefined);
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.data).toEqual(mockUsers);
	});

	it("passes input to query handler", async () => {
		const link = inProcessLinkV2({
			handlers: {
				query: {
					getUser: async (input) => {
						const { id } = input as { id: string };
						return mockUsers.find((u) => u.id === id) ?? null;
					},
				},
			},
		});
		const linkFn = link();

		const op = createOperationContext("query", "operation", "getUser", { id: "user-1" });
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.data).toEqual(mockUsers[0]);
	});

	it("executes mutation handler", async () => {
		const link = inProcessLinkV2({
			handlers: {
				mutation: {
					createUser: async (input) => {
						const { name, email } = input as { name: string; email: string };
						return { id: "user-new", name, email };
					},
				},
			},
		});
		const linkFn = link();

		const op = createOperationContext("mutation", "operation", "createUser", {
			name: "Charlie",
			email: "charlie@test.com",
		});
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.data).toEqual({
			id: "user-new",
			name: "Charlie",
			email: "charlie@test.com",
		});
	});

	it("returns error for unknown handler", async () => {
		const link = inProcessLinkV2({
			handlers: {
				query: {},
			},
		});
		const linkFn = link();

		const op = createOperationContext("query", "operation", "unknownQuery", undefined);
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toContain("Handler not found");
	});

	it("handles handler error", async () => {
		const link = inProcessLinkV2({
			handlers: {
				query: {
					failingQuery: async () => {
						throw new Error("Query failed");
					},
				},
			},
		});
		const linkFn = link();

		const op = createOperationContext("query", "operation", "failingQuery", undefined);
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe("Query failed");
	});
});

// =============================================================================
// Tests: With Server
// =============================================================================

describe("inProcessLinkV2 with server", () => {
	it("executes query via server", async () => {
		const mockServer: InProcessServerV2 = {
			executeQuery: mock(async (name, input) => {
				if (name === "getUsers") return mockUsers;
				return null;
			}),
			executeMutation: mock(async () => null),
		};

		const link = inProcessLinkV2({ server: mockServer });
		const linkFn = link();

		const op = createOperationContext("query", "operation", "getUsers", undefined);
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.data).toEqual(mockUsers);
		expect(mockServer.executeQuery).toHaveBeenCalledWith("getUsers", undefined);
	});

	it("executes mutation via server", async () => {
		const mockServer: InProcessServerV2 = {
			executeQuery: mock(async () => null),
			executeMutation: mock(async (name, input) => {
				if (name === "createUser") {
					const { name: userName, email } = input as { name: string; email: string };
					return { id: "new", name: userName, email };
				}
				return null;
			}),
		};

		const link = inProcessLinkV2({ server: mockServer });
		const linkFn = link();

		const op = createOperationContext("mutation", "operation", "createUser", {
			name: "Test",
			email: "test@test.com",
		});
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.data).toEqual({ id: "new", name: "Test", email: "test@test.com" });
	});

	it("handles server error", async () => {
		const mockServer: InProcessServerV2 = {
			executeQuery: mock(async () => {
				throw new Error("Server error");
			}),
			executeMutation: mock(async () => null),
		};

		const link = inProcessLinkV2({ server: mockServer });
		const linkFn = link();

		const op = createOperationContext("query", "operation", "test", undefined);
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe("Server error");
	});
});

// =============================================================================
// Tests: createInProcessLinkV2
// =============================================================================

describe("createInProcessLinkV2", () => {
	it("creates link from server", async () => {
		const mockServer: InProcessServerV2 = {
			executeQuery: mock(async () => mockUsers),
			executeMutation: mock(async () => null),
		};

		const link = createInProcessLinkV2(mockServer);
		const linkFn = link();

		const op = createOperationContext("query", "operation", "getUsers", undefined);
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.data).toEqual(mockUsers);
	});
});

// =============================================================================
// Tests: Validation
// =============================================================================

describe("inProcessLinkV2 validation", () => {
	it("throws without server or handlers", () => {
		expect(() => inProcessLinkV2({})).toThrow("requires either server or handlers");
	});
});
