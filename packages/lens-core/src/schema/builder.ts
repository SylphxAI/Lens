/**
 * Schema builder - The core API for defining Lens APIs
 *
 * Usage:
 * ```ts
 * import { lens } from '@sylphx/lens-core';
 * import { z } from 'zod';
 *
 * export const user = lens.object({
 *   get: lens.query({
 *     input: z.object({ id: z.string() }),
 *     output: UserSchema,
 *     resolve: async ({ id }) => db.users.findOne({ id })
 *   }),
 *   update: lens.mutation({
 *     input: z.object({ id: z.string(), data: UserUpdateSchema }),
 *     output: UserSchema,
 *     resolve: async ({ id, data }) => db.users.update({ id }, data)
 *   })
 * });
 * ```
 */

import type { Observable } from "rxjs";
import type { z } from "zod";
import type {
	LensQuery,
	LensMutation,
	LensObject,
} from "./types.js";

/**
 * Query builder configuration
 *
 * Support void input and typed context with auto-inference:
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.query({
 *   input: void,
 *   output: z.array(UserSchema),
 *   resolve: async (ctx) => ctx.db.users.findAll()  // ctx auto-inferred!
 * })
 * ```
 */
export interface QueryConfig<TInput, TOutput, TContext> {
	input: TInput extends void ? void : z.ZodType<TInput>;
	output: z.ZodType<TOutput>;
	resolve: TInput extends void
		? (ctx: TContext) => Promise<TOutput>
		: (input: TInput, ctx: TContext) => Promise<TOutput>;
	subscribe?: TInput extends void
		? (ctx: TContext) => Observable<TOutput>
		: (input: TInput, ctx: TContext) => Observable<TOutput>;
}

/**
 * Mutation builder configuration
 *
 * Support void input and typed context with auto-inference:
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.mutation({
 *   input: void,
 *   output: z.object({ success: z.boolean() }),
 *   resolve: async (ctx) => ctx.performAction()  // ctx auto-inferred!
 * })
 * ```
 */
export interface MutationConfig<TInput, TOutput, TContext> {
	input: TInput extends void ? void : z.ZodType<TInput>;
	output: z.ZodType<TOutput>;
	resolve: TInput extends void
		? (ctx: TContext) => Promise<TOutput>
		: (input: TInput, ctx: TContext) => Promise<TOutput>;
}

/**
 * Schema builder class with typed context
 * Context type flows through all queries/mutations for auto-inference
 */
class LensBuilder<TContext = any> {
	/**
	 * Define a query operation with auto-inferred context
	 *
	 * @example
	 * ```ts
	 * const lens = createLensBuilder<AppContext>();
	 *
	 * const getUser = lens.query({
	 *   input: z.object({ id: z.string() }),
	 *   output: UserSchema,
	 *   resolve: async ({ id }, ctx) => {
	 *     // ctx is AppContext - fully typed!
	 *     return ctx.db.users.findOne({ id });
	 *   }
	 * });
	 * ```
	 */
	query<TInput, TOutput>(
		config: QueryConfig<TInput, TOutput, TContext>
	): LensQuery<TInput, TOutput, TContext> {
		return {
			type: "query" as const,
			path: [],
			input: config.input,
			output: config.output,
			resolve: config.resolve,
			subscribe: config.subscribe,
		};
	}

	/**
	 * Define a mutation operation with auto-inferred context
	 *
	 * @example
	 * ```ts
	 * const lens = createLensBuilder<AppContext>();
	 *
	 * const updateUser = lens.mutation({
	 *   input: z.object({ id: z.string(), data: UpdateSchema }),
	 *   output: UserSchema,
	 *   resolve: async ({ id, data }, ctx) => {
	 *     // ctx is AppContext - fully typed!
	 *     return ctx.db.users.update({ id }, data);
	 *   }
	 * });
	 * ```
	 */
	mutation<TInput, TOutput>(
		config: MutationConfig<TInput, TOutput, TContext>
	): LensMutation<TInput, TOutput, TContext> {
		return {
			type: "mutation" as const,
			path: [],
			input: config.input,
			output: config.output,
			resolve: config.resolve,
		};
	}

	/**
	 * Group queries and mutations into an object
	 *
	 * @example
	 * ```ts
	 * const api = lens.object({
	 *   user: lens.object({
	 *     get: lens.query({ ... }),
	 *     update: lens.mutation({ ... })
	 *   }),
	 *   post: lens.object({
	 *     get: lens.query({ ... }),
	 *     create: lens.mutation({ ... })
	 *   })
	 * });
	 * ```
	 */
	object<T extends Record<string, any>>(obj: T): LensObject<T> {
		// Set paths for nested queries/mutations
		const setPath = (obj: any, path: string[]): any => {
			if (obj.type === "query" || obj.type === "mutation") {
				obj.path = path;
				return obj;
			}

			if (typeof obj === "object" && obj !== null) {
				const result: any = {};
				for (const [key, value] of Object.entries(obj)) {
					result[key] = setPath(value, [...path, key]);
				}
				return result;
			}

			return obj;
		};

		return setPath(obj, []) as LensObject<T>;
	}
}

/**
 * Create a typed Lens builder with context type inference
 *
 * This is the recommended way to create a Lens API with full type safety.
 * Context type is specified once and auto-inferred everywhere.
 *
 * @example
 * ```ts
 * // Define your context type
 * interface AppContext {
 *   db: Database;
 *   user: User;
 * }
 *
 * // Create typed builder (one-time setup)
 * const lens = createLensBuilder<AppContext>();
 *
 * // All handlers now have auto-inferred context!
 * export const api = lens.object({
 *   users: lens.object({
 *     list: lens.query({
 *       input: void,
 *       output: z.array(UserSchema),
 *       resolve: async (ctx) => {
 *         // ctx is AppContext - fully typed!
 *         return ctx.db.users.findAll();
 *       }
 *     }),
 *     get: lens.query({
 *       input: z.object({ id: z.string() }),
 *       output: UserSchema,
 *       resolve: async ({ id }, ctx) => {
 *         // ctx is AppContext - auto-inferred!
 *         return ctx.db.users.findOne({ id });
 *       }
 *     })
 *   })
 * });
 * ```
 */
export function createLensBuilder<TContext = any>(): LensBuilder<TContext> {
	return new LensBuilder<TContext>();
}

/**
 * Default untyped builder (legacy)
 * @deprecated Use createLensBuilder<YourContext>() for type safety
 */
export const lens = new LensBuilder<any>();
