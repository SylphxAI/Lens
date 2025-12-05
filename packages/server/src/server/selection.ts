/**
 * @sylphx/lens-server - Selection
 *
 * Field selection logic for query results.
 */

import type { NestedSelection, SelectionObject } from "./types.js";

/**
 * Check if a value is a NestedSelection with input.
 */
function isNestedSelection(value: unknown): value is NestedSelection {
	return (
		typeof value === "object" &&
		value !== null &&
		("input" in value || "select" in value) &&
		!Array.isArray(value)
	);
}

/**
 * Extract the select object from a selection value.
 * Handles: true, SelectionObject, { select: ... }, { input: ..., select: ... }
 */
function extractSelect(value: unknown): SelectionObject | null {
	if (value === true) return null;
	if (typeof value !== "object" || value === null) return null;

	const obj = value as Record<string, unknown>;

	// { input?: ..., select?: ... } pattern
	if ("input" in obj || ("select" in obj && typeof obj.select === "object")) {
		return (obj.select as SelectionObject) ?? null;
	}

	// { select: ... } pattern (without input)
	if ("select" in obj && typeof obj.select === "object") {
		return obj.select as SelectionObject;
	}

	// Direct SelectionObject
	return value as SelectionObject;
}

/**
 * Apply field selection to data.
 * Recursively filters data to only include selected fields.
 *
 * Supports:
 * - `field: true` - Include field as-is
 * - `field: { select: {...} }` - Nested selection
 * - `field: { input: {...}, select: {...} }` - Nested with input (input passed to resolvers)
 *
 * @param data - The data to filter
 * @param select - Selection object specifying which fields to include
 * @returns Filtered data with only selected fields
 */
export function applySelection(data: unknown, select: SelectionObject): unknown {
	if (!data) return data;

	if (Array.isArray(data)) {
		return data.map((item) => applySelection(item, select));
	}

	if (typeof data !== "object") return data;

	const obj = data as Record<string, unknown>;
	const result: Record<string, unknown> = {};

	// Always include id
	if ("id" in obj) result.id = obj.id;

	for (const [key, value] of Object.entries(select)) {
		if (!(key in obj)) continue;

		if (value === true) {
			result[key] = obj[key];
		} else if (typeof value === "object" && value !== null) {
			const nestedSelect = extractSelect(value);
			if (nestedSelect) {
				result[key] = applySelection(obj[key], nestedSelect);
			} else {
				// No nested select means include the whole field
				result[key] = obj[key];
			}
		}
	}

	return result;
}

/**
 * Extract nested inputs from a selection object.
 * Returns a map of field paths to their input params.
 * Used by resolvers to fetch nested data with the right params.
 */
export function extractNestedInputs(
	select: SelectionObject,
	prefix = "",
): Map<string, Record<string, unknown>> {
	const inputs = new Map<string, Record<string, unknown>>();

	for (const [key, value] of Object.entries(select)) {
		const path = prefix ? `${prefix}.${key}` : key;

		if (isNestedSelection(value) && value.input) {
			inputs.set(path, value.input);
		}

		// Recurse into nested selections
		if (typeof value === "object" && value !== null) {
			const nestedSelect = extractSelect(value);
			if (nestedSelect) {
				const nestedInputs = extractNestedInputs(nestedSelect, path);
				for (const [nestedPath, nestedInput] of nestedInputs) {
					inputs.set(nestedPath, nestedInput);
				}
			}
		}
	}

	return inputs;
}
