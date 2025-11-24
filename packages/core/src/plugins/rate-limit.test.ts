/**
 * Tests for Rate Limiting Plugin
 */

import { describe, expect, test } from "bun:test";
import { rateLimitPlugin } from "./rate-limit";

describe("rateLimitPlugin", () => {
	describe("client", () => {
		test("creates client instance with API", () => {
			const instance = rateLimitPlugin.client!({});

			expect(instance.name).toBe("rate-limit");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.getRemaining).toBe("function");
			expect(typeof instance.api!.isLimited).toBe("function");
		});

		test("getRemaining returns global limit initially", () => {
			const instance = rateLimitPlugin.client!({ globalLimit: 50 });
			const api = instance.api as { getRemaining: (entity?: string, op?: string) => number };

			expect(api.getRemaining()).toBe(50);
		});

		test("isLimited returns false when under limit", () => {
			const instance = rateLimitPlugin.client!({ globalLimit: 100 });
			const api = instance.api as { isLimited: (entity?: string, op?: string) => boolean };

			expect(api.isLimited()).toBe(false);
		});

		test("getStats returns initial stats", () => {
			const instance = rateLimitPlugin.client!({});
			const api = instance.api as {
				getStats: () => { total: number; limited: number; retried: number };
			};

			const stats = api.getStats();
			expect(stats.total).toBe(0);
			expect(stats.limited).toBe(0);
			expect(stats.retried).toBe(0);
		});

		test("respects per-entity rules", () => {
			const instance = rateLimitPlugin.client!({
				globalLimit: 100,
				rules: [{ entity: "User", operation: "create", limit: 5, window: 60000 }],
			});
			const api = instance.api as { getRemaining: (entity?: string, op?: string) => number };

			// Specific rule should return 5
			expect(api.getRemaining("User", "create")).toBe(5);
			// Global should return 100
			expect(api.getRemaining()).toBe(100);
		});
	});

	describe("server", () => {
		test("creates server instance with API", () => {
			const instance = rateLimitPlugin.server!({});

			expect(instance.name).toBe("rate-limit");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.checkLimit).toBe("function");
			expect(typeof instance.api!.getLimit).toBe("function");
		});

		test("checkLimit allows requests under limit", () => {
			const instance = rateLimitPlugin.server!({});
			const api = instance.api as {
				checkLimit: (key: string, limit: number, window: number) => {
					allowed: boolean;
					remaining: number;
					resetAt: number;
				};
			};

			const result = api.checkLimit("test", 10, 60000);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(9);
		});

		test("getLimit returns rule for entity/operation", () => {
			const instance = rateLimitPlugin.server!({
				rules: [{ entity: "User", operation: "create", limit: 10, window: 60000 }],
			});
			const api = instance.api as {
				getLimit: (entity: string, op: string) => { limit: number; window: number } | null;
			};

			const limit = api.getLimit("User", "create");
			expect(limit).toEqual({ limit: 10, window: 60000 });

			// No rule for this
			expect(api.getLimit("Post", "delete")).toBeNull();
		});
	});

	describe("config", () => {
		test("getClientConfig returns sanitized config", () => {
			const config = {
				globalLimit: 200,
				globalWindow: 30000,
				rules: [{ entity: "User", limit: 10, window: 60000 }],
			};

			const clientConfig = rateLimitPlugin.getClientConfig!(config);

			expect(clientConfig.globalLimit).toBe(200);
			expect(clientConfig.globalWindow).toBe(30000);
			expect(clientConfig.rules).toHaveLength(1);
		});
	});
});
