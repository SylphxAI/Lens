/**
 * Patch strategy - JSON Patch (RFC 6902) for object updates
 *
 * Optimized for object updates where only small parts change:
 * Update user.name from "John" to "Jane"
 * Value mode: 50KB (entire object)
 * Patch mode: 50 bytes (99.9% savings!)
 */

import { compare, applyPatch, type Operation } from "fast-json-patch";
import type { UpdateStrategy, UpdatePayload } from "./types.js";

export class PatchStrategy implements UpdateStrategy {
	readonly mode = "patch" as const;

	encode(current: unknown, next: unknown): UpdatePayload {
		if (
			typeof current !== "object" ||
			typeof next !== "object" ||
			current === null ||
			next === null
		) {
			throw new Error("Patch strategy only works with objects");
		}

		// Generate JSON Patch
		const patch = compare(current, next);

		return {
			mode: "patch",
			data: patch,
		};
	}

	decode(current: unknown, payload: UpdatePayload): unknown {
		if (payload.mode !== "patch") {
			return payload.data;
		}

		if (typeof current !== "object" || current === null) {
			throw new Error("Cannot apply patch to non-object");
		}

		if (!Array.isArray(payload.data)) {
			throw new Error("Patch data must be an array of operations");
		}

		// Apply JSON Patch
		const result = applyPatch(
			structuredClone(current),
			payload.data as Operation[],
			false,
			false
		);

		if (result.newDocument === undefined) {
			throw new Error("Failed to apply patch");
		}

		return result.newDocument;
	}
}
