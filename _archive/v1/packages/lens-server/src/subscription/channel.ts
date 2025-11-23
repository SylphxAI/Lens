/**
 * Channel naming conventions for auto-subscription
 *
 * Converts query paths and inputs to channel names for pub/sub
 */

/**
 * Channel naming strategy
 */
export type ChannelNamingStrategy = (path: string[], input: unknown) => string;

/**
 * Default channel naming: path:key:value
 *
 * Examples:
 * - user.get({ id: "123" }) → "user:get:id:123"
 * - post.list({ authorId: "456" }) → "post:list:authorId:456"
 * - user.get({ id: "123", includeDeleted: true }) → "user:get:id:123:includeDeleted:true"
 */
export function defaultChannelNaming(path: string[], input: unknown): string {
	const pathStr = path.join(":");

	if (!input || typeof input !== "object") {
		return pathStr;
	}

	const params: string[] = [];
	for (const [key, value] of Object.entries(input)) {
		// Skip complex objects
		if (typeof value === "object" && value !== null) continue;

		params.push(`${key}:${value}`);
	}

	return params.length > 0 ? `${pathStr}:${params.join(":")}` : pathStr;
}

/**
 * Simple channel naming: just the path
 *
 * Examples:
 * - user.get({ id: "123" }) → "user:get"
 * - post.list() → "post:list"
 */
export function simpleChannelNaming(path: string[], _input: unknown): string {
	return path.join(":");
}

/**
 * ID-based channel naming: path + first ID field
 *
 * Examples:
 * - user.get({ id: "123" }) → "user:get:123"
 * - post.get({ postId: "456" }) → "post:get:456"
 * - comment.get({ id: "789", depth: 2 }) → "comment:get:789"
 */
export function idBasedChannelNaming(path: string[], input: unknown): string {
	const pathStr = path.join(":");

	if (!input || typeof input !== "object") {
		return pathStr;
	}

	// Look for common ID field names
	const idFields = ["id", "userId", "postId", "commentId", "itemId"];

	for (const field of idFields) {
		if (field in input) {
			const value = (input as Record<string, unknown>)[field];
			if (typeof value === "string" || typeof value === "number") {
				return `${pathStr}:${value}`;
			}
		}
	}

	return pathStr;
}
