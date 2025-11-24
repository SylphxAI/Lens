/**
 * @lens/client - HTTP Link V2 Tests
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { httpLinkV2, type HttpLinkV2Options } from "./http-v2";
import { createOperationContext } from "./types";

// =============================================================================
// Mock Fetch
// =============================================================================

const originalFetch = globalThis.fetch;

function createMockFetch(response: {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
	text: () => Promise<string>;
}) {
	return mock(async () => response);
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

// =============================================================================
// Tests
// =============================================================================

describe("httpLinkV2", () => {
	it("creates a link function", () => {
		const link = httpLinkV2({ url: "http://localhost:3000/api" });
		const linkFn = link();
		expect(typeof linkFn).toBe("function");
	});

	it("sends query request", async () => {
		const mockFetch = createMockFetch({
			ok: true,
			status: 200,
			json: async () => ({ data: [{ id: "user-1", name: "Alice" }] }),
			text: async () => "",
		});
		globalThis.fetch = mockFetch;

		const link = httpLinkV2({ url: "http://localhost:3000/api" });
		const linkFn = link();

		const op = createOperationContext("query", "operation", "getUsers", { limit: 10 });
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(mockFetch).toHaveBeenCalled();
		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe("http://localhost:3000/api");
		expect(options.method).toBe("POST");
		expect(JSON.parse(options.body)).toEqual({
			type: "query",
			name: "getUsers",
			input: { limit: 10 },
		});

		expect(result.data).toEqual([{ id: "user-1", name: "Alice" }]);
	});

	it("sends mutation request", async () => {
		const mockFetch = createMockFetch({
			ok: true,
			status: 200,
			json: async () => ({ data: { id: "user-new", name: "Bob" } }),
			text: async () => "",
		});
		globalThis.fetch = mockFetch;

		const link = httpLinkV2({ url: "http://localhost:3000/api" });
		const linkFn = link();

		const op = createOperationContext("mutation", "operation", "createUser", {
			name: "Bob",
			email: "bob@test.com",
		});
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		const [, options] = mockFetch.mock.calls[0];
		expect(JSON.parse(options.body)).toEqual({
			type: "mutation",
			name: "createUser",
			input: { name: "Bob", email: "bob@test.com" },
		});

		expect(result.data).toEqual({ id: "user-new", name: "Bob" });
	});

	it("handles error response", async () => {
		const mockFetch = createMockFetch({
			ok: false,
			status: 500,
			json: async () => ({ error: { message: "Internal error" } }),
			text: async () => JSON.stringify({ error: { message: "Internal error" } }),
		});
		globalThis.fetch = mockFetch;

		const link = httpLinkV2({ url: "http://localhost:3000/api" });
		const linkFn = link();

		const op = createOperationContext("query", "operation", "failingQuery", {});
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe("Internal error");
	});

	it("handles non-JSON error response", async () => {
		const mockFetch = createMockFetch({
			ok: false,
			status: 500,
			json: async () => { throw new Error("Not JSON"); },
			text: async () => "Internal Server Error",
		});
		globalThis.fetch = mockFetch;

		const link = httpLinkV2({ url: "http://localhost:3000/api" });
		const linkFn = link();

		const op = createOperationContext("query", "operation", "failingQuery", {});
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toContain("500");
	});

	it("includes custom headers", async () => {
		const mockFetch = createMockFetch({
			ok: true,
			status: 200,
			json: async () => ({ data: null }),
			text: async () => "",
		});
		globalThis.fetch = mockFetch;

		const link = httpLinkV2({
			url: "http://localhost:3000/api",
			headers: { Authorization: "Bearer token123" },
		});
		const linkFn = link();

		const op = createOperationContext("query", "operation", "test", {});
		await linkFn(op, async () => ({ error: new Error("No next") }));

		const [, options] = mockFetch.mock.calls[0];
		expect(options.headers.Authorization).toBe("Bearer token123");
		expect(options.headers["Content-Type"]).toBe("application/json");
	});

	it("supports async header function", async () => {
		const mockFetch = createMockFetch({
			ok: true,
			status: 200,
			json: async () => ({ data: null }),
			text: async () => "",
		});
		globalThis.fetch = mockFetch;

		const link = httpLinkV2({
			url: "http://localhost:3000/api",
			headers: async () => ({ Authorization: "Bearer async-token" }),
		});
		const linkFn = link();

		const op = createOperationContext("query", "operation", "test", {});
		await linkFn(op, async () => ({ error: new Error("No next") }));

		const [, options] = mockFetch.mock.calls[0];
		expect(options.headers.Authorization).toBe("Bearer async-token");
	});

	it("handles network error", async () => {
		globalThis.fetch = mock(async () => {
			throw new Error("Network error");
		});

		const link = httpLinkV2({ url: "http://localhost:3000/api" });
		const linkFn = link();

		const op = createOperationContext("query", "operation", "test", {});
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe("Network error");
	});

	it("handles error in response body", async () => {
		const mockFetch = createMockFetch({
			ok: true,
			status: 200,
			json: async () => ({ error: { message: "Validation failed" } }),
			text: async () => "",
		});
		globalThis.fetch = mockFetch;

		const link = httpLinkV2({ url: "http://localhost:3000/api" });
		const linkFn = link();

		const op = createOperationContext("mutation", "operation", "test", {});
		const result = await linkFn(op, async () => ({ error: new Error("No next") }));

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe("Validation failed");
	});
});
