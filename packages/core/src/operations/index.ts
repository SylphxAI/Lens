/**
 * @lens/core - Operations API
 *
 * Builder pattern for defining queries and mutations.
 * Inspired by tRPC but with entity-aware features.
 *
 * @example
 * ```typescript
 * import { query, mutation, tempId } from '@lens/core';
 * import { z } from 'zod';
 *
 * // Query without input
 * export const whoami = query()
 *   .returns(User)
 *   .resolve(() => useCurrentUser());
 *
 * // Query with input
 * export const user = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input }) => useDB().user.findUnique({ where: { id: input.id } }));
 *
 * // Mutation with optimistic updates
 * export const createPost = mutation()
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .optimistic(({ input }) => ({ id: tempId(), ...input }))
 *   .resolve(({ input }) => useDB().post.create({ data: input }));
 * ```
 */

import type { EntityDef, EntityDefinition } from "../schema/define";

// =============================================================================
// Type Definitions
// =============================================================================

/** Zod-like schema interface (minimal subset we need) */
export interface ZodLikeSchema<T = unknown> {
	parse: (data: unknown) => T;
	safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown };
	_output: T;
}

/** Return type specification - can be entity, array, or object of entities */
export type ReturnSpec =
	| EntityDef<string, EntityDefinition>
	| [EntityDef<string, EntityDefinition>]
	| Record<string, EntityDef<string, EntityDefinition> | [EntityDef<string, EntityDefinition>]>;

/** Infer TypeScript type from return spec */
export type InferReturnType<R extends ReturnSpec> = R extends EntityDef<string, infer F>
	? { [K in keyof F]: unknown } // Simplified - actual inference would be more complex
	: R extends [EntityDef<string, infer F>]
		? { [K in keyof F]: unknown }[]
		: R extends Record<string, unknown>
			? { [K in keyof R]: R[K] extends [EntityDef<string, unknown>] ? unknown[] : unknown }
			: never;

/** Resolver context */
export interface ResolverContext<TInput = unknown> {
	input: TInput;
	emit?: (data: unknown) => void;
	onCleanup?: (fn: () => void) => () => void;
}

/** Resolver function type */
export type ResolverFn<TInput, TOutput> =
	| ((ctx: ResolverContext<TInput>) => Promise<TOutput>)
	| ((ctx: ResolverContext<TInput>) => TOutput)
	| ((ctx: ResolverContext<TInput>) => AsyncGenerator<TOutput>);

/** Optimistic function type */
export type OptimisticFn<TInput, TOutput> = (ctx: { input: TInput }) => Partial<TOutput>;

// =============================================================================
// Query Builder
// =============================================================================

/** Query definition */
export interface QueryDef<TInput = void, TOutput = unknown> {
	_type: "query";
	_input?: ZodLikeSchema<TInput>;
	_output?: ReturnSpec;
	_resolve?: ResolverFn<TInput, TOutput>;
}

/** Query builder - fluent interface */
export interface QueryBuilder<TInput = void, TOutput = unknown> {
	/** Define input validation schema (optional for queries) */
	input<T>(schema: ZodLikeSchema<T>): QueryBuilder<T, TOutput>;

	/** Define return type */
	returns<R extends ReturnSpec>(spec: R): QueryBuilder<TInput, InferReturnType<R>>;

	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput>): QueryDef<TInput, TOutput>;
}

class QueryBuilderImpl<TInput = void, TOutput = unknown> implements QueryBuilder<TInput, TOutput> {
	private _inputSchema?: ZodLikeSchema<TInput>;
	private _outputSpec?: ReturnSpec;

	input<T>(schema: ZodLikeSchema<T>): QueryBuilder<T, TOutput> {
		const builder = new QueryBuilderImpl<T, TOutput>();
		builder._inputSchema = schema;
		builder._outputSpec = this._outputSpec;
		return builder;
	}

	returns<R extends ReturnSpec>(spec: R): QueryBuilder<TInput, InferReturnType<R>> {
		const builder = new QueryBuilderImpl<TInput, InferReturnType<R>>();
		builder._inputSchema = this._inputSchema as ZodLikeSchema<TInput> | undefined;
		builder._outputSpec = spec;
		return builder;
	}

	resolve(fn: ResolverFn<TInput, TOutput>): QueryDef<TInput, TOutput> {
		return {
			_type: "query",
			_input: this._inputSchema,
			_output: this._outputSpec,
			_resolve: fn,
		};
	}
}

/**
 * Create a query builder
 *
 * @example
 * ```typescript
 * // No input
 * const whoami = query()
 *   .returns(User)
 *   .resolve(() => useCurrentUser());
 *
 * // With input
 * const user = query()
 *   .input(z.object({ id: z.string() }))
 *   .returns(User)
 *   .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } }));
 * ```
 */
export function query(): QueryBuilder<void, unknown> {
	return new QueryBuilderImpl();
}

// =============================================================================
// Mutation Builder
// =============================================================================

/** Mutation definition */
export interface MutationDef<TInput = unknown, TOutput = unknown> {
	_type: "mutation";
	_input: ZodLikeSchema<TInput>;
	_output?: ReturnSpec;
	_optimistic?: OptimisticFn<TInput, TOutput>;
	_resolve: ResolverFn<TInput, TOutput>;
}

/** Mutation builder - fluent interface */
export interface MutationBuilder<TInput = unknown, TOutput = unknown> {
	/** Define input validation schema (required for mutations) */
	input<T>(schema: ZodLikeSchema<T>): MutationBuilderWithInput<T, TOutput>;
}

/** Mutation builder after input is defined */
export interface MutationBuilderWithInput<TInput, TOutput = unknown> {
	/** Define return type */
	returns<R extends ReturnSpec>(spec: R): MutationBuilderWithReturns<TInput, InferReturnType<R>>;
}

/** Mutation builder after returns is defined */
export interface MutationBuilderWithReturns<TInput, TOutput> {
	/** Define optimistic update function (optional) */
	optimistic(fn: OptimisticFn<TInput, TOutput>): MutationBuilderWithOptimistic<TInput, TOutput>;

	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput>): MutationDef<TInput, TOutput>;
}

/** Mutation builder after optimistic is defined */
export interface MutationBuilderWithOptimistic<TInput, TOutput> {
	/** Define resolver function */
	resolve(fn: ResolverFn<TInput, TOutput>): MutationDef<TInput, TOutput>;
}

class MutationBuilderImpl<TInput = unknown, TOutput = unknown>
	implements
		MutationBuilder<TInput, TOutput>,
		MutationBuilderWithInput<TInput, TOutput>,
		MutationBuilderWithReturns<TInput, TOutput>,
		MutationBuilderWithOptimistic<TInput, TOutput>
{
	private _inputSchema?: ZodLikeSchema<TInput>;
	private _outputSpec?: ReturnSpec;
	private _optimisticFn?: OptimisticFn<TInput, TOutput>;

	input<T>(schema: ZodLikeSchema<T>): MutationBuilderWithInput<T, TOutput> {
		const builder = new MutationBuilderImpl<T, TOutput>();
		builder._inputSchema = schema;
		return builder;
	}

	returns<R extends ReturnSpec>(spec: R): MutationBuilderWithReturns<TInput, InferReturnType<R>> {
		const builder = new MutationBuilderImpl<TInput, InferReturnType<R>>();
		builder._inputSchema = this._inputSchema as ZodLikeSchema<TInput> | undefined;
		builder._outputSpec = spec;
		return builder;
	}

	optimistic(fn: OptimisticFn<TInput, TOutput>): MutationBuilderWithOptimistic<TInput, TOutput> {
		const builder = new MutationBuilderImpl<TInput, TOutput>();
		builder._inputSchema = this._inputSchema;
		builder._outputSpec = this._outputSpec;
		builder._optimisticFn = fn;
		return builder;
	}

	resolve(fn: ResolverFn<TInput, TOutput>): MutationDef<TInput, TOutput> {
		if (!this._inputSchema) {
			throw new Error("Mutation requires input schema. Use .input(schema) first.");
		}
		return {
			_type: "mutation",
			_input: this._inputSchema,
			_output: this._outputSpec,
			_optimistic: this._optimisticFn,
			_resolve: fn,
		};
	}
}

/**
 * Create a mutation builder
 *
 * @example
 * ```typescript
 * const createPost = mutation()
 *   .input(z.object({ title: z.string(), content: z.string() }))
 *   .returns(Post)
 *   .optimistic(({ input }) => ({ id: tempId(), ...input }))
 *   .resolve(({ input }) => db.post.create({ data: input }));
 * ```
 */
export function mutation(): MutationBuilder<unknown, unknown> {
	return new MutationBuilderImpl();
}

// =============================================================================
// Helpers
// =============================================================================

let tempIdCounter = 0;

/**
 * Generate a temporary ID for optimistic updates.
 * The server will replace this with the real ID.
 *
 * @example
 * ```typescript
 * .optimistic(({ input }) => ({
 *   id: tempId(),  // Will be "temp_0", "temp_1", etc.
 *   title: input.title,
 * }))
 * ```
 */
export function tempId(): string {
	return `temp_${tempIdCounter++}`;
}

/**
 * Reset temp ID counter (for testing)
 */
export function resetTempIdCounter(): void {
	tempIdCounter = 0;
}

/**
 * Check if an ID is a temporary ID
 */
export function isTempId(id: string): boolean {
	return id.startsWith("temp_");
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if value is a query definition */
export function isQueryDef(value: unknown): value is QueryDef {
	return typeof value === "object" && value !== null && (value as QueryDef)._type === "query";
}

/** Check if value is a mutation definition */
export function isMutationDef(value: unknown): value is MutationDef {
	return typeof value === "object" && value !== null && (value as MutationDef)._type === "mutation";
}

/** Check if value is any operation definition */
export function isOperationDef(value: unknown): value is QueryDef | MutationDef {
	return isQueryDef(value) || isMutationDef(value);
}
