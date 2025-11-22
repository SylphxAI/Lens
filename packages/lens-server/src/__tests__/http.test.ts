/**
 * HTTP handler tests
 */

import { describe, test, expect } from "bun:test";
import { lens } from "@sylphx/lens-core";
import { z } from "zod";
import { createHTTPHandler } from "../handlers/http.js";

describe("HTTP Handler", () => {
	// Test API
	const api = lens.object({
		user: lens.object({
			get: lens.query({
				input: z.object({ id: z.string() }),
				output: z.object({
					id: z.string(),
					name: z.string(),
					email: z.string(),
				}),
				resolve: async ({ id }) => ({
					id,
					name: "John Doe",
					email: "john@example.com",
				}),
			}),
		}),
	});

	test("handles query request", async () => {
		const handler = createHTTPHandler(api);

		// Mock request
		const req = createMockRequest({
			method: "POST",
			body: {
				type: "query",
				path: ["user", "get"],
				input: { id: "123" },
			},
		});

		// Mock response
		const res = createMockResponse();

		// Execute
		await handler(req, res);

		// Verify
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body);
		expect(body).toEqual({
			id: "123",
			name: "John Doe",
			email: "john@example.com",
		});
	});

	test("applies field selection", async () => {
		const handler = createHTTPHandler(api);

		const req = createMockRequest({
			method: "POST",
			body: {
				type: "query",
				path: ["user", "get"],
				input: { id: "123" },
				select: ["id", "name"],
			},
		});

		const res = createMockResponse();
		await handler(req, res);

		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body);
		expect(body).toEqual({
			id: "123",
			name: "John Doe",
		});
	});

	test("handles validation errors", async () => {
		const handler = createHTTPHandler(api);

		const req = createMockRequest({
			method: "POST",
			body: {
				type: "query",
				path: ["user", "get"],
				input: { id: 123 }, // Should be string
			},
		});

		const res = createMockResponse();
		await handler(req, res);

		expect(res.statusCode).toBe(500);
		const body = JSON.parse(res.body);
		expect(body.error).toBeDefined();
	});

	test("handles not found", async () => {
		const handler = createHTTPHandler(api);

		const req = createMockRequest({
			method: "POST",
			body: {
				type: "query",
				path: ["user", "unknown"],
				input: {},
			},
		});

		const res = createMockResponse();
		await handler(req, res);

		expect(res.statusCode).toBe(404);
	});
});

// Mock helpers
function createMockRequest(options: {
	method: string;
	body?: any;
}): any {
	const bodyStr = options.body ? JSON.stringify(options.body) : "";

	return {
		method: options.method,
		on: (event: string, handler: (data: any) => void) => {
			if (event === "data") {
				setTimeout(() => handler(Buffer.from(bodyStr)), 0);
			} else if (event === "end") {
				setTimeout(() => handler(null), 10);
			}
		},
	};
}

function createMockResponse(): any {
	const headers: Record<string, string> = {};
	let statusCode = 200;
	let body = "";

	return {
		get statusCode() {
			return statusCode;
		},
		get headers() {
			return headers;
		},
		get body() {
			return body;
		},
		writeHead: (code: number, hdrs: Record<string, string>) => {
			statusCode = code;
			Object.assign(headers, hdrs);
		},
		end: (data: string) => {
			body = data;
		},
	};
}
