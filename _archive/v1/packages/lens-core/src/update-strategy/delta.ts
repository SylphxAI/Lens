/**
 * Delta strategy - Text delta for string growth
 *
 * Optimized for LLM streaming where strings grow incrementally:
 * "" → "H" → "He" → "Hel" → "Hell" → "Hello"
 *
 * Instead of sending full strings:
 * Value mode: 26 bytes total
 * Delta mode: 11 bytes total (57% savings!)
 */

import type { UpdateStrategy, UpdatePayload } from "./types.js";

export class DeltaStrategy implements UpdateStrategy {
	readonly mode = "delta" as const;

	encode(current: unknown, next: unknown): UpdatePayload {
		if (typeof current !== "string" || typeof next !== "string") {
			throw new Error("Delta strategy only works with strings");
		}

		// If next starts with current, send only the delta
		if (next.startsWith(current)) {
			return {
				mode: "delta",
				data: next.slice(current.length),
			};
		}

		// Fallback to full value if not a simple append
		return {
			mode: "value",
			data: next,
		};
	}

	decode(current: unknown, payload: UpdatePayload): unknown {
		if (payload.mode === "delta") {
			if (typeof current !== "string" || typeof payload.data !== "string") {
				throw new Error("Delta payload expects strings");
			}

			// Append delta to current
			return current + payload.data;
		}

		// Fallback to value mode
		return payload.data;
	}
}
