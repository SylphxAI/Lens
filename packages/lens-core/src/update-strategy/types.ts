/**
 * Update strategy types for minimal transfer
 *
 * Strategies:
 * - Value: Send full value (default, safest)
 * - Delta: Send only text differences (for LLM streaming)
 * - Patch: Send JSON Patch operations (for object updates)
 * - Auto: Intelligently select best strategy
 */

import type { UpdateMode } from "../schema/types.js";

/**
 * Update strategy interface
 */
export interface UpdateStrategy {
	readonly mode: UpdateMode;

	/**
	 * Encode the difference between current and next value
	 */
	encode(current: unknown, next: unknown): UpdatePayload;

	/**
	 * Decode update payload and apply to current value
	 */
	decode(current: unknown, payload: UpdatePayload): unknown;
}

/**
 * Update payload with mode information
 */
export interface UpdatePayload {
	mode: UpdateMode;
	data: unknown;
}
