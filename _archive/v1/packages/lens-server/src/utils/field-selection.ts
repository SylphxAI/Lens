/**
 * Server-side field selection
 *
 * Applies field selection to data before sending to client
 */

/**
 * Apply field selection to data
 *
 * Supports:
 * - Array syntax: ['id', 'name', 'email']
 * - Object syntax: { id: true, user: { name: true } }
 */
export function applyFieldSelection(data: any, select?: any): any {
	if (!select) {
		return data;
	}

	// Handle arrays
	if (Array.isArray(data)) {
		return data.map((item) => applyFieldSelection(item, select));
	}

	// Handle primitives
	if (typeof data !== "object" || data === null) {
		return data;
	}

	// Array syntax: ['id', 'name']
	if (Array.isArray(select)) {
		const result: any = {};
		for (const key of select) {
			if (key in data) {
				result[key] = data[key];
			}
		}
		return result;
	}

	// Object syntax: { id: true, user: { name: true } }
	if (typeof select === "object") {
		const result: any = {};
		for (const key in select) {
			if (!(key in data)) continue;

			const value = select[key];

			if (value === true) {
				// Include field
				result[key] = data[key];
			} else if (typeof value === "object" && value !== null) {
				// Nested selection
				result[key] = applyFieldSelection(data[key], value);
			}
		}
		return result;
	}

	return data;
}
