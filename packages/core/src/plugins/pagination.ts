/**
 * @lens/core - Pagination Plugin
 *
 * Unified cursor-based pagination plugin providing:
 * - Cursor-based pagination
 * - Page info (hasNextPage, hasPreviousPage)
 * - Configurable page size
 * - Relay-style connections
 */

import { defineUnifiedPlugin } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Page info for cursor-based pagination */
export interface PageInfo {
	/** Cursor of first item */
	startCursor: string | null;
	/** Cursor of last item */
	endCursor: string | null;
	/** Whether there are more items before */
	hasPreviousPage: boolean;
	/** Whether there are more items after */
	hasNextPage: boolean;
}

/** Paginated result */
export interface PaginatedResult<T> {
	/** The data items */
	data: T[];
	/** Pagination metadata */
	pageInfo: PageInfo;
	/** Total count (if requested) */
	totalCount?: number;
}

/** Pagination input */
export interface PaginationInput {
	/** Number of items to fetch */
	first?: number;
	/** Fetch items after this cursor */
	after?: string;
	/** Number of items to fetch from end */
	last?: number;
	/** Fetch items before this cursor */
	before?: string;
	/** Include total count (may be expensive) */
	includeTotalCount?: boolean;
}

/** Pagination plugin configuration */
export interface PaginationPluginConfig {
	/** Default page size (default: 20) */
	defaultPageSize?: number;
	/** Maximum page size (default: 100) */
	maxPageSize?: number;
	/** Include total count by default (default: false) */
	includeTotalCount?: boolean;
	/** Cursor field name (default: id) */
	cursorField?: string;
}

/** Pagination API exposed to client */
export interface PaginationClientAPI {
	/** Create pagination input for first page */
	first: (count?: number) => PaginationInput;
	/** Create pagination input for next page */
	next: (cursor: string, count?: number) => PaginationInput;
	/** Create pagination input for previous page */
	prev: (cursor: string, count?: number) => PaginationInput;
	/** Get default page size */
	getDefaultPageSize: () => number;
}

/** Pagination API exposed to server */
export interface PaginationServerAPI {
	/** Apply pagination to results */
	paginate: <T extends { id: string }>(
		items: T[],
		input: PaginationInput,
		totalCount?: number,
	) => PaginatedResult<T>;
	/** Get cursor from item */
	getCursor: (item: unknown) => string;
	/** Validate pagination input */
	validateInput: (input: PaginationInput) => PaginationInput;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Unified pagination plugin
 *
 * @example
 * ```typescript
 * // Client
 * import { paginationPlugin } from "@lens/core";
 *
 * const client = createClient({
 *   plugins: [{
 *     plugin: paginationPlugin,
 *     config: { defaultPageSize: 25 },
 *   }],
 * });
 *
 * // Use pagination API
 * const pagination = client.$plugins.get<PaginationClientAPI>("pagination");
 *
 * // First page
 * const users = await client.User.list(pagination?.first());
 *
 * // Next page
 * const nextUsers = await client.User.list(
 *   pagination?.next(users.pageInfo.endCursor!)
 * );
 *
 * // Server
 * const server = createServer({
 *   plugins: [{
 *     plugin: paginationPlugin,
 *     config: { maxPageSize: 50 },
 *   }],
 * });
 * ```
 */
export const paginationPlugin = defineUnifiedPlugin<PaginationPluginConfig>({
	name: "pagination",
	version: "1.0.0",

	defaultConfig: {
		defaultPageSize: 20,
		maxPageSize: 100,
		includeTotalCount: false,
		cursorField: "id",
	},

	// Client-side implementation
	client: (config) => {
		const defaultPageSize = config?.defaultPageSize ?? 20;
		const maxPageSize = config?.maxPageSize ?? 100;

		const api: PaginationClientAPI = {
			first: (count) => ({
				first: Math.min(count ?? defaultPageSize, maxPageSize),
			}),

			next: (cursor, count) => ({
				first: Math.min(count ?? defaultPageSize, maxPageSize),
				after: cursor,
			}),

			prev: (cursor, count) => ({
				last: Math.min(count ?? defaultPageSize, maxPageSize),
				before: cursor,
			}),

			getDefaultPageSize: () => defaultPageSize,
		};

		return {
			name: "pagination",
			api,

			// Transform list input to include pagination
			transformListInput: (input: Record<string, unknown>) => {
				// If already has pagination params, use them
				if (input.first || input.last || input.after || input.before) {
					return input;
				}

				// If has take/skip (offset pagination), convert
				if (input.take !== undefined) {
					return {
						...input,
						first: Math.min(input.take as number, maxPageSize),
					};
				}

				// Default: add first
				return {
					...input,
					first: defaultPageSize,
				};
			},
		};
	},

	// Server-side implementation
	server: (config) => {
		const defaultPageSize = config?.defaultPageSize ?? 20;
		const maxPageSize = config?.maxPageSize ?? 100;
		const cursorField = config?.cursorField ?? "id";

		const getCursor = (item: unknown): string => {
			if (item && typeof item === "object" && cursorField in item) {
				return String((item as Record<string, unknown>)[cursorField]);
			}
			return "";
		};

		const api: PaginationServerAPI = {
			paginate: <T extends { id: string }>(
				items: T[],
				input: PaginationInput,
				totalCount?: number,
			): PaginatedResult<T> => {
				const first = input.first;
				const after = input.after;
				const last = input.last;
				const before = input.before;

				let data = [...items];
				let hasNextPage = false;
				let hasPreviousPage = false;

				// Forward pagination (first/after)
				if (first !== undefined) {
					if (after) {
						const afterIndex = data.findIndex((item) => getCursor(item) === after);
						if (afterIndex >= 0) {
							data = data.slice(afterIndex + 1);
							hasPreviousPage = true;
						}
					}

					if (data.length > first) {
						data = data.slice(0, first);
						hasNextPage = true;
					}
				}

				// Backward pagination (last/before)
				if (last !== undefined) {
					if (before) {
						const beforeIndex = data.findIndex((item) => getCursor(item) === before);
						if (beforeIndex >= 0) {
							data = data.slice(0, beforeIndex);
							hasNextPage = true;
						}
					}

					if (data.length > last) {
						data = data.slice(-last);
						hasPreviousPage = true;
					}
				}

				return {
					data,
					pageInfo: {
						startCursor: data.length > 0 ? getCursor(data[0]) : null,
						endCursor: data.length > 0 ? getCursor(data[data.length - 1]) : null,
						hasPreviousPage,
						hasNextPage,
					},
					totalCount,
				};
			},

			getCursor,

			validateInput: (input) => {
				const validated = { ...input };

				if (validated.first !== undefined) {
					validated.first = Math.min(Math.max(1, validated.first), maxPageSize);
				}

				if (validated.last !== undefined) {
					validated.last = Math.min(Math.max(1, validated.last), maxPageSize);
				}

				// Can't have both first and last
				if (validated.first !== undefined && validated.last !== undefined) {
					delete validated.last;
					delete validated.before;
				}

				return validated;
			},
		};

		return {
			name: "pagination",
			api,

			// Hook: transform list resolver results
			onAfterResolve: (ctx, entity, operation, result, input) => {
				if (operation !== "list") return result;
				if (!Array.isArray(result)) return result;

				// Check if pagination was requested
				const paginationInput = input as PaginationInput | undefined;
				if (!paginationInput?.first && !paginationInput?.last) {
					// No pagination requested, return as-is but wrapped
					return {
						data: result,
						pageInfo: {
							startCursor: result.length > 0 ? getCursor(result[0]) : null,
							endCursor: result.length > 0 ? getCursor(result[result.length - 1]) : null,
							hasPreviousPage: false,
							hasNextPage: false,
						},
					};
				}

				// Apply pagination
				return api.paginate(result as { id: string }[], paginationInput);
			},
		};
	},

	// Sanitize config for client handshake
	getClientConfig: (config) => ({
		defaultPageSize: config?.defaultPageSize ?? 20,
		maxPageSize: config?.maxPageSize ?? 100,
		cursorField: config?.cursorField ?? "id",
	}),
});
