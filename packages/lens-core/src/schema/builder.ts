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
 * Query configuration without input (parameterless)
 *
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.query({
 *   output: z.array(UserSchema),
 *   resolve: async (ctx) => ctx.db.users.findAll()  // ctx auto-inferred!
 * })
 * ```
 */
export interface QueryConfigNoInput<TOutput, TContext> {
	output: z.ZodType<TOutput>;
	resolve: (ctx: TContext) => Promise<TOutput>;
	subscribe?: (ctx: TContext) => Observable<TOutput>;
}

/**
 * Query configuration with input
 *
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.query({
 *   input: z.object({ id: z.string() }),
 *   output: UserSchema,
 *   resolve: async ({ id }, ctx) => ctx.db.users.findOne({ id })
 * })
 * ```
 */
export interface QueryConfigWithInput<TInput, TOutput, TContext> {
	input: z.ZodType<TInput>;
	output: z.ZodType<TOutput>;
	resolve: (input: TInput, ctx: TContext) => Promise<TOutput>;
	subscribe?: (input: TInput, ctx: TContext) => Observable<TOutput>;
}

/**
 * Mutation configuration without input (parameterless)
 *
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.mutation({
 *   output: z.object({ success: z.boolean() }),
 *   resolve: async (ctx) => ctx.performAction()  // ctx auto-inferred!
 * })
 * ```
 */
export interface MutationConfigNoInput<TOutput, TContext> {
	output: z.ZodType<TOutput>;
	resolve: (ctx: TContext) => Promise<TOutput>;
}

/**
 * Mutation configuration with input
 *
 * @example
 * ```ts
 * const lens = createLensBuilder<AppContext>();
 *
 * lens.mutation({
 *   input: z.object({ id: z.string(), data: UpdateSchema }),
 *   output: UserSchema,
 *   resolve: async ({ id, data }, ctx) => ctx.db.users.update({ id }, data)
 * })
 * ```
 */
export interface MutationConfigWithInput<TInput, TOutput, TContext> {
	input: z.ZodType<TInput>;
	output: z.ZodType<TOutput>;
	resolve: (input: TInput, ctx: TContext) => Promise<TOutput>;
}

// Legacy type aliases for backward compatibility
export type QueryConfig<TInput, TOutput, TContext> = TInput extends void
	? QueryConfigNoInput<TOutput, TContext>
	: QueryConfigWithInput<TInput, TOutput, TContext>;

export type MutationConfig<TInput, TOutput, TContext> = TInput extends void
	? MutationConfigNoInput<TOutput, TContext>
	: MutationConfigWithInput<TInput, TOutput, TContext>;

/**
 * Schema builder class with typed context
 * Context type flows through all queries/mutations for auto-inference
 */
class LensBuilder<TContext = any> {
	/**
	 * Define a parameterless query operation with auto-inferred context
	 *
	 * @example
	 * ```ts
	 * const lens = createLensBuilder<AppContext>();
	 *
	 * const listUsers = lens.query({
	 *   output: z.array(UserSchema),
	 *   resolve: async (ctx) => {
	 *     // ctx is AppContext - fully typed!
	 *     return ctx.db.users.findAll();
	 *   }
	 * });
	 * ```
	 */
	query<TOutput>(
		config: QueryConfigNoInput<TOutput, TContext>
	): LensQuery<void, TOutput, TContext>;

	/**
	 * Define a query operation with input and auto-inferred context
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
		config: QueryConfigWithInput<TInput, TOutput, TContext>
	): LensQuery<TInput, TOutput, TContext>;

	// Implementation
	query<TInput, TOutput>(config: any): any {
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
	 * Define a parameterless mutation operation with auto-inferred context
	 *
	 * @example
	 * ```ts
	 * const lens = createLensBuilder<AppContext>();
	 *
	 * const performAction = lens.mutation({
	 *   output: z.object({ success: z.boolean() }),
	 *   resolve: async (ctx) => {
	 *     // ctx is AppContext - fully typed!
	 *     return ctx.performAction();
	 *   }
	 * });
	 * ```
	 */
	mutation<TOutput>(
		config: MutationConfigNoInput<TOutput, TContext>
	): LensMutation<void, TOutput, TContext>;

	/**
	 * Define a mutation operation with input and auto-inferred context
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
		config: MutationConfigWithInput<TInput, TOutput, TContext>
	): LensMutation<TInput, TOutput, TContext>;

	// Implementation
	mutation<TInput, TOutput>(config: any): any {
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
