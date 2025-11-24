/**
 * Tests for the pagination plugin
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { paginationPlugin, type PaginationClientAPI, type PaginationServerAPI } from "./pagination";

describe("paginationPlugin", () => {
	describe("metadata", () => {
		it("has correct name and version", () => {
			expect(paginationPlugin.name).toBe("pagination");
			expect(paginationPlugin.version).toBe("1.0.0");
		});

		it("has default config", () => {
			expect(paginationPlugin.defaultConfig).toEqual({
				defaultPageSize: 20,
				maxPageSize: 100,
				includeTotalCount: false,
				cursorField: "id",
			});
		});

		it("has both client and server factories", () => {
			expect(paginationPlugin.client).toBeDefined();
			expect(paginationPlugin.server).toBeDefined();
		});
	});

	describe("client plugin", () => {
		let clientInstance: ReturnType<NonNullable<typeof paginationPlugin.client>>;
		let api: PaginationClientAPI;

		beforeEach(() => {
			clientInstance = paginationPlugin.client!({ defaultPageSize: 25 });
			api = clientInstance.api as PaginationClientAPI;
		});

		it("has correct name", () => {
			expect(clientInstance.name).toBe("pagination");
		});

		it("exposes pagination API", () => {
			expect(api.first).toBeDefined();
			expect(api.next).toBeDefined();
			expect(api.prev).toBeDefined();
			expect(api.getDefaultPageSize).toBeDefined();
		});

		it("first() creates correct input", () => {
			const input = api.first();
			expect(input).toEqual({ first: 25 });
		});

		it("first(count) uses specified count", () => {
			const input = api.first(10);
			expect(input).toEqual({ first: 10 });
		});

		it("first() respects maxPageSize", () => {
			const input = api.first(200);
			expect(input).toEqual({ first: 100 }); // capped at max
		});

		it("next() creates correct input with cursor", () => {
			const input = api.next("cursor-123");
			expect(input).toEqual({ first: 25, after: "cursor-123" });
		});

		it("prev() creates correct input with cursor", () => {
			const input = api.prev("cursor-123");
			expect(input).toEqual({ last: 25, before: "cursor-123" });
		});

		it("getDefaultPageSize returns configured size", () => {
			expect(api.getDefaultPageSize()).toBe(25);
		});
	});

	describe("server plugin", () => {
		let serverInstance: ReturnType<NonNullable<typeof paginationPlugin.server>>;
		let api: PaginationServerAPI;

		const testData = [
			{ id: "1", name: "Alice" },
			{ id: "2", name: "Bob" },
			{ id: "3", name: "Charlie" },
			{ id: "4", name: "Diana" },
			{ id: "5", name: "Eve" },
		];

		beforeEach(() => {
			serverInstance = paginationPlugin.server!({});
			api = serverInstance.api as PaginationServerAPI;
		});

		it("has correct name", () => {
			expect(serverInstance.name).toBe("pagination");
		});

		it("exposes server API", () => {
			expect(api.paginate).toBeDefined();
			expect(api.getCursor).toBeDefined();
			expect(api.validateInput).toBeDefined();
		});

		it("getCursor extracts id from item", () => {
			expect(api.getCursor({ id: "123", name: "Test" })).toBe("123");
		});

		it("paginate returns first N items", () => {
			const result = api.paginate(testData, { first: 2 });

			expect(result.data).toHaveLength(2);
			expect(result.data[0].id).toBe("1");
			expect(result.data[1].id).toBe("2");
			expect(result.pageInfo.hasNextPage).toBe(true);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
			expect(result.pageInfo.startCursor).toBe("1");
			expect(result.pageInfo.endCursor).toBe("2");
		});

		it("paginate handles after cursor", () => {
			const result = api.paginate(testData, { first: 2, after: "2" });

			expect(result.data).toHaveLength(2);
			expect(result.data[0].id).toBe("3");
			expect(result.data[1].id).toBe("4");
			expect(result.pageInfo.hasPreviousPage).toBe(true);
			expect(result.pageInfo.hasNextPage).toBe(true);
		});

		it("paginate handles last N items", () => {
			const result = api.paginate(testData, { last: 2 });

			expect(result.data).toHaveLength(2);
			expect(result.data[0].id).toBe("4");
			expect(result.data[1].id).toBe("5");
			expect(result.pageInfo.hasPreviousPage).toBe(true);
			expect(result.pageInfo.hasNextPage).toBe(false);
		});

		it("paginate handles before cursor", () => {
			const result = api.paginate(testData, { last: 2, before: "4" });

			expect(result.data).toHaveLength(2);
			expect(result.data[0].id).toBe("2");
			expect(result.data[1].id).toBe("3");
			expect(result.pageInfo.hasNextPage).toBe(true);
		});

		it("paginate returns empty pageInfo for empty results", () => {
			const result = api.paginate([], { first: 10 });

			expect(result.data).toHaveLength(0);
			expect(result.pageInfo.startCursor).toBeNull();
			expect(result.pageInfo.endCursor).toBeNull();
			expect(result.pageInfo.hasNextPage).toBe(false);
			expect(result.pageInfo.hasPreviousPage).toBe(false);
		});

		it("validateInput caps first at maxPageSize", () => {
			const input = api.validateInput({ first: 200 });
			expect(input.first).toBe(100);
		});

		it("validateInput removes last when first is present", () => {
			const input = api.validateInput({ first: 10, last: 10 });
			expect(input.first).toBe(10);
			expect(input.last).toBeUndefined();
		});
	});

	describe("getClientConfig", () => {
		it("returns sanitized config", () => {
			const config = paginationPlugin.getClientConfig!({
				defaultPageSize: 30,
				maxPageSize: 50,
			});

			expect(config).toEqual({
				defaultPageSize: 30,
				maxPageSize: 50,
				cursorField: "id",
			});
		});

		it("uses defaults when config is undefined", () => {
			const config = paginationPlugin.getClientConfig!(undefined);

			expect(config.defaultPageSize).toBe(20);
			expect(config.maxPageSize).toBe(100);
		});
	});
});
