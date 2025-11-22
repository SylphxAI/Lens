/**
 * Value strategy - Send full value every time
 *
 * Safest strategy, used when:
 * - Small payloads (<1KB)
 * - First update (no previous value)
 * - Fallback when other strategies fail
 */

import type { UpdateStrategy, UpdatePayload } from "./types.js";

export class ValueStrategy implements UpdateStrategy {
	readonly mode = "value" as const;

	encode(current: unknown, next: unknown): UpdatePayload {
		return {
			mode: "value",
			data: next,
		};
	}

	decode(current: unknown, payload: UpdatePayload): unknown {
		return payload.data;
	}
}
