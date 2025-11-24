/**
 * Tests for the cache plugin
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { cachePlugin, type CacheClientAPI, type CacheServerAPI } from "./cache";

describe("cachePlugin", () => {
	describe("metadata", () => {
		it("has correct name and version", () => {
			expect(cachePlugin.name).toBe("cache");
			expect(cachePlugin.version).toBe("1.0.0");
		});

		it("has default config", () => {
			expect(cachePlugin.defaultConfig).toEqual({
				ttl: 5 * 60 * 1000,
				cascadeRules: [],
				autoInvalidate: true,
				staleWhileRevalidate: true,
			});
		});

		it("has both client and server factories", () => {
			expect(cachePlugin.client).toBeDefined();
			expect(cachePlugin.server).toBeDefined();
		});
	});

	describe("client plugin", () => {
		let clientInstance: ReturnType<NonNullable<typeof cachePlugin.client>>;
		let api: CacheClientAPI;

		beforeEach(() => {
			clientInstance = cachePlugin.client!({});
			api = clientInstance.api as CacheClientAPI;
		});

		it("has correct name", () => {
			expect(clientInstance.name).toBe("cache");
		});

		it("exposes cache API", () => {
			expect(api.invalidate).toBeDefined();
			expect(api.invalidateEntity).toBeDefined();
			expect(api.invalidateByTags).toBeDefined();
			expect(api.invalidateByPattern).toBeDefined();
			expect(api.tagEntity).toBeDefined();
			expect(api.isStale).toBeDefined();
			expect(api.clear).toBeDefined();
		});

		it("isStale returns true for unknown entities", () => {
			expect(api.isStale("User", "unknown")).toBe(true);
		});

		it("invalidateByTags returns count", () => {
			api.tagEntity("User", "1", ["featured"]);
			api.tagEntity("User", "2", ["featured"]);
			api.tagEntity("User", "3", ["other"]);

			// Simulate caching by calling onQuerySuccess
			(clientInstance as { onQuerySuccess?: (e: string, id: string) => void }).onQuerySuccess?.("User", "1");
			(clientInstance as { onQuerySuccess?: (e: string, id: string) => void }).onQuerySuccess?.("User", "2");
			(clientInstance as { onQuerySuccess?: (e: string, id: string) => void }).onQuerySuccess?.("User", "3");

			const count = api.invalidateByTags(["featured"]);
			expect(count).toBe(2);
		});

		it("invalidateByPattern matches glob patterns", () => {
			// Simulate caching
			(clientInstance as { onQuerySuccess?: (e: string, id: string) => void }).onQuerySuccess?.("User", "1");
			(clientInstance as { onQuerySuccess?: (e: string, id: string) => void }).onQuerySuccess?.("User", "2");
			(clientInstance as { onQuerySuccess?: (e: string, id: string) => void }).onQuerySuccess?.("Post", "1");

			const count = api.invalidateByPattern("User:*");
			expect(count).toBe(2);
		});

		it("clear removes all cached data", () => {
			api.tagEntity("User", "1", ["test"]);
			(clientInstance as { onQuerySuccess?: (e: string, id: string) => void }).onQuerySuccess?.("User", "1");

			api.clear();

			expect(api.isStale("User", "1")).toBe(true);
		});
	});

	describe("server plugin", () => {
		let serverInstance: ReturnType<NonNullable<typeof cachePlugin.server>>;
		let api: CacheServerAPI;

		beforeEach(() => {
			serverInstance = cachePlugin.server!({
				cascadeRules: [
					{ source: "User", targets: ["Post", "Comment"] },
					{ source: "Team", operations: ["delete"], targets: ["User"] },
				],
			});
			api = serverInstance.api as CacheServerAPI;
		});

		it("has correct name", () => {
			expect(serverInstance.name).toBe("cache");
		});

		it("exposes server API", () => {
			expect(api.getCascadeRules).toBeDefined();
			expect(api.shouldCascade).toBeDefined();
		});

		it("getCascadeRules returns configured rules", () => {
			const rules = api.getCascadeRules();
			expect(rules).toHaveLength(2);
			expect(rules[0].source).toBe("User");
		});

		it("shouldCascade returns targets for matching entity", () => {
			const targets = api.shouldCascade("User", "update");
			expect(targets).toContain("Post");
			expect(targets).toContain("Comment");
		});

		it("shouldCascade respects operation filter", () => {
			// Team only cascades on delete
			expect(api.shouldCascade("Team", "update")).toEqual([]);
			expect(api.shouldCascade("Team", "delete")).toContain("User");
		});

		it("shouldCascade returns empty for non-matching entity", () => {
			expect(api.shouldCascade("Unknown", "update")).toEqual([]);
		});
	});

	describe("getClientConfig", () => {
		it("returns sanitized config", () => {
			const config = cachePlugin.getClientConfig!({
				ttl: 10000,
				cascadeRules: [{ source: "User", targets: ["Post"] }],
				autoInvalidate: false,
			});

			expect(config).toEqual({
				ttl: 10000,
				cascadeRules: [{ source: "User", targets: ["Post"] }],
				autoInvalidate: false,
				staleWhileRevalidate: true,
			});
		});

		it("uses defaults when config is undefined", () => {
			const config = cachePlugin.getClientConfig!(undefined);

			expect(config.ttl).toBe(5 * 60 * 1000);
			expect(config.cascadeRules).toEqual([]);
			expect(config.autoInvalidate).toBe(true);
		});
	});
});
