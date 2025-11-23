/**
 * SSE handler tests
 */

import { describe, test, expect } from "bun:test";
import { lens } from "@sylphx/lens-core";
import { z } from "zod";
import { createSSEHandler } from "../handlers/sse.js";
import { Observable } from "rxjs";

describe("SSE Handler", () => {
	// Test API with subscription
	const api = lens.object({
		counter: lens.object({
			watch: lens
				.input(z.object({ start: z.number() }))
				.output(z.object({ count: z.number() }))
				.query(
					async ({ input }) => ({ count: input.start }),
					({ input }) => {
						// Subscribe: emit incrementing counter
						return new Observable((subscriber) => {
							let count = input.start;
							const interval = setInterval(() => {
								subscriber.next({ count: count++ });
								if (count > input.start + 2) {
									subscriber.complete();
								}
							}, 10);

							return () => clearInterval(interval);
						});
					}
				),
		}),
	});

	test("handles subscription request", async () => {
		const handler = createSSEHandler(api);

		// Mock request with query parameter
		const request = {
			type: "subscription",
			path: ["counter", "watch"],
			input: { start: 0 },
		};
		const req = createMockRequest(request);
		const res = createMockSSEResponse();

		// Execute
		await handler(req, res);

		// Wait for some events
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Verify SSE headers
		expect(res.statusCode).toBe(200);
		expect(res.headers["Content-Type"]).toBe("text/event-stream");
		expect(res.headers["Cache-Control"]).toBe("no-cache");
		expect(res.headers["Connection"]).toBe("keep-alive");

		// Verify SSE events
		const events = parseSSEEvents(res.body);
		expect(events.length).toBeGreaterThan(0);

		// First event should be connected
		expect(events[0].event).toBe("connected");
		expect(events[0].data).toEqual({ status: "connected" });

		// Should have update events
		const updates = events.filter((e) => e.event === "update");
		expect(updates.length).toBeGreaterThan(0);
		expect(updates[0].data).toHaveProperty("mode");
		expect(updates[0].data).toHaveProperty("data");
	});

	test("applies field selection", async () => {
		const handler = createSSEHandler(api);

		const request = {
			type: "subscription",
			path: ["counter", "watch"],
			input: { start: 10 },
			select: ["count"],
		};
		const req = createMockRequest(request);
		const res = createMockSSEResponse();

		await handler(req, res);
		await new Promise((resolve) => setTimeout(resolve, 50));

		const events = parseSSEEvents(res.body);
		const updates = events.filter((e) => e.event === "update");

		// Verify field selection applied
		expect(updates.length).toBeGreaterThan(0);
		expect(updates[0].data.data).toHaveProperty("count");
	});

	test("rejects non-subscription requests", async () => {
		const handler = createSSEHandler(api);

		const request = {
			type: "query",
			path: ["counter", "watch"],
			input: { start: 0 },
		};
		const req = createMockRequest(request);
		const res = createMockSSEResponse();

		await handler(req, res);

		// Error before SSE setup, should return JSON
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.body);
		expect(body.error.message).toContain("only supports subscriptions");
		expect(body.error.code).toBe("INVALID_REQUEST_TYPE");
	});

	test("handles missing request parameter", async () => {
		const handler = createSSEHandler(api);

		const req = {
			url: "/sse",
			headers: { host: "localhost" },
			on: () => {},
		};
		const res = createMockSSEResponse();

		await handler(req, res);

		// Should return JSON error (not SSE)
		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.body);
		expect(body.error.message).toContain("Missing 'request' query parameter");
	});

	test("handles invalid JSON in request parameter", async () => {
		const handler = createSSEHandler(api);

		const req = {
			url: "/sse?request=invalid-json",
			headers: { host: "localhost" },
			on: () => {},
		};
		const res = createMockSSEResponse();

		await handler(req, res);

		expect(res.statusCode).toBe(400);
		const body = JSON.parse(res.body);
		expect(body.error.message).toContain("Invalid request parameter");
	});
});

// Mock helpers
function createMockRequest(request: any): any {
	const encoded = encodeURIComponent(JSON.stringify(request));
	return {
		url: `/sse?request=${encoded}`,
		headers: { host: "localhost" },
		on: (event: string, handler: () => void) => {
			// Simulate disconnect after 100ms
			if (event === "close") {
				setTimeout(handler, 100);
			}
		},
	};
}

function createMockSSEResponse(): any {
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
		get headersSent() {
			return Object.keys(headers).length > 0;
		},
		writeHead: (code: number, hdrs: Record<string, string>) => {
			statusCode = code;
			Object.assign(headers, hdrs);
		},
		write: (data: string) => {
			body += data;
		},
		end: (data?: string) => {
			if (data) body += data;
		},
	};
}

/**
 * Parse SSE event stream into structured events
 */
function parseSSEEvents(stream: string): Array<{
	id?: string;
	event?: string;
	data: any;
}> {
	const events: Array<{ id?: string; event?: string; data: any }> = [];
	const lines = stream.split("\n");

	let currentEvent: { id?: string; event?: string; data?: string } = {};

	for (const line of lines) {
		if (line.startsWith("id: ")) {
			currentEvent.id = line.substring(4);
		} else if (line.startsWith("event: ")) {
			currentEvent.event = line.substring(7);
		} else if (line.startsWith("data: ")) {
			currentEvent.data = line.substring(6);
		} else if (line === "") {
			// Empty line marks end of event
			if (currentEvent.data) {
				events.push({
					id: currentEvent.id,
					event: currentEvent.event,
					data: JSON.parse(currentEvent.data),
				});
			}
			currentEvent = {};
		}
	}

	return events;
}
