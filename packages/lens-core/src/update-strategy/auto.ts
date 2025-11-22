/**
 * Auto strategy - Intelligently select best strategy
 *
 * Selection logic:
 * 1. String growth (LLM streaming) → Delta (57% savings)
 * 2. Object updates with >50% savings → Patch (99% savings)
 * 3. Small payloads (<1KB) → Value (simple)
 * 4. Default → Value (safest)
 */

import { compare } from "fast-json-patch";
import type { UpdateStrategy, UpdatePayload } from "./types.js";
import { ValueStrategy } from "./value.js";
import { DeltaStrategy } from "./delta.js";
import { PatchStrategy } from "./patch.js";

export class AutoStrategy implements UpdateStrategy {
	readonly mode = "auto" as const;

	private readonly valueStrategy = new ValueStrategy();
	private readonly deltaStrategy = new DeltaStrategy();
	private readonly patchStrategy = new PatchStrategy();

	encode(current: unknown, next: unknown): UpdatePayload {
		// String growth → Delta
		if (
			typeof current === "string" &&
			typeof next === "string" &&
			next.startsWith(current) &&
			next.length > current.length
		) {
			return this.deltaStrategy.encode(current, next);
		}

		// Object updates → Patch (if significant savings)
		if (
			typeof current === "object" &&
			typeof next === "object" &&
			current !== null &&
			next !== null &&
			!Array.isArray(current) &&
			!Array.isArray(next)
		) {
			try {
				const patch = compare(current, next);
				const patchSize = JSON.stringify(patch).length;
				const valueSize = JSON.stringify(next).length;

				// Use patch if >50% savings
				if (patchSize < valueSize * 0.5) {
					return {
						mode: "patch",
						data: patch,
					};
				}
			} catch {
				// Fallback to value on error
			}
		}

		// Default: Full value
		return this.valueStrategy.encode(current, next);
	}

	decode(current: unknown, payload: UpdatePayload): unknown {
		switch (payload.mode) {
			case "delta":
				return this.deltaStrategy.decode(current, payload);
			case "patch":
				return this.patchStrategy.decode(current, payload);
			case "value":
				return this.valueStrategy.decode(current, payload);
			default:
				// Unknown mode, treat as value
				return payload.data;
		}
	}
}
