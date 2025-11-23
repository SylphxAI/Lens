/**
 * Field selection tests
 */

import { describe, test, expect } from "bun:test";
import { applyFieldSelection } from "../utils/field-selection.js";

describe("Field Selection", () => {
	test("returns full data when no selection", () => {
		const data = { id: "1", name: "John", email: "john@example.com" };
		const result = applyFieldSelection(data, undefined);
		expect(result).toEqual(data);
	});

	test("array syntax selects specific fields", () => {
		const data = { id: "1", name: "John", email: "john@example.com" };
		const result = applyFieldSelection(data, ["id", "name"]);
		expect(result).toEqual({ id: "1", name: "John" });
	});

	test("object syntax selects specific fields", () => {
		const data = { id: "1", name: "John", email: "john@example.com" };
		const result = applyFieldSelection(data, { id: true, name: true });
		expect(result).toEqual({ id: "1", name: "John" });
	});

	test("nested object selection", () => {
		const data = {
			id: "1",
			name: "John",
			profile: {
				bio: "Engineer",
				avatar: "url",
			},
		};
		const result = applyFieldSelection(data, {
			id: true,
			profile: { bio: true },
		});
		expect(result).toEqual({
			id: "1",
			profile: { bio: "Engineer" },
		});
	});

	test("array of objects", () => {
		const data = [
			{ id: "1", name: "John", email: "john@example.com" },
			{ id: "2", name: "Jane", email: "jane@example.com" },
		];
		const result = applyFieldSelection(data, ["id", "name"]);
		expect(result).toEqual([
			{ id: "1", name: "John" },
			{ id: "2", name: "Jane" },
		]);
	});

	test("handles missing fields gracefully", () => {
		const data = { id: "1", name: "John" };
		const result = applyFieldSelection(data, ["id", "name", "email"]);
		expect(result).toEqual({ id: "1", name: "John" });
	});

	test("handles primitives", () => {
		expect(applyFieldSelection("hello", ["x"])).toBe("hello");
		expect(applyFieldSelection(123, ["x"])).toBe(123);
		expect(applyFieldSelection(null, ["x"])).toBe(null);
	});
});
