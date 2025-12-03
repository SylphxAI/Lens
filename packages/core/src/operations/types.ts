/**
 * @sylphx/lens-core - Operations Types
 *
 * Type definitions for query and mutation operations.
 */

import type { Emit } from "../emit/index.js";
import type { Pipeline, StepBuilder } from "../optimistic/reify.js";
import { isPipeline } from "../optimistic/reify.js";
import type { EntityDef } from "../schema/define.js";
import type { InferScalar, ScalarFields } from "../schema/infer.js";
import type { EntityDefinition } from "../schema/types.js";
import type { Prettify } from "../utils/types.js";

// =============================================================================
// Schema Types
// =============================================================================

/** Zod-like schema interface (minimal subset we need) */
export interface ZodLikeSchema<T = unknown> {
	parse: (data: unknown) => T;
	safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown };
	_output: T;
}

/**
 * Return type specification
 * - EntityDef: For entity-aware returns (enables normalization, caching)
 * - [EntityDef]: Array of entities
 * - ZodLikeSchema: For simple typed returns (no entity features)
 * - Record: Multiple named returns
 */
export type ReturnSpec =
	| EntityDef<string, EntityDefinition>
	| [EntityDef<string, EntityDefinition>]
	| ZodLikeSchema<unknown>
	| Record<string, EntityDef<string, EntityDefinition> | [EntityDef<string, EntityDefinition>]>;

// =============================================================================
// Type Inference
// =============================================================================

/** Check if a field has the _optional flag */
type IsOptional<F> = F extends { _optional: true } ? true : false;

/**
 * Infer entity type from entity definition fields.
 * Only infers scalar fields (relations require schema context).
 * Handles optional fields properly (makes them optional properties).
 */
type InferEntityFromFields<F extends EntityDefinition> = Prettify<
	{
		[K in ScalarFields<F> as IsOptional<F[K]> extends true ? never : K]: InferScalar<F[K]>;
	} & {
		[K in ScalarFields<F> as IsOptional<F[K]> extends true ? K : never]?: InferScalar<F[K]>;
	}
>;

/** Infer TypeScript type from return spec */
export type InferReturnType<R extends ReturnSpec> =
	R extends ZodLikeSchema<infer T>
		? T
		: R extends EntityDef<string, infer F>
			? InferEntityFromFields<F>
			: R extends [EntityDef<string, infer F>]
				? InferEntityFromFields<F>[]
				: R extends Record<string, unknown>
					? {
							[K in keyof R]: R[K] extends [EntityDef<string, infer F>]
								? InferEntityFromFields<F>[]
								: R[K] extends EntityDef<string, infer F2>
									? InferEntityFromFields<F2>
									: unknown;
						}
					: never;

// =============================================================================
// Context Types
// =============================================================================

/**
 * Lens-provided context extensions.
 * These are automatically injected by the server into the user's context.
 */
export interface LensContextExtensions<TOutput = unknown> {
	/**
	 * Emit state updates to subscribed clients.
	 * Only available in subscription context.
	 */
	emit: Emit<TOutput>;

	/**
	 * Register cleanup function called when client unsubscribes.
	 * Returns a function to manually remove the cleanup.
	 * Only available in subscription context.
	 */
	onCleanup: (fn: () => void) => () => void;
}

/**
 * Full context type combining user context with Lens extensions.
 * This is what resolvers receive as `ctx`.
 */
export type LensContext<TContext, TOutput = unknown> = TContext & LensContextExtensions<TOutput>;

/**
 * Resolver context - passed directly to resolver function (tRPC style)
 */
export interface ResolverContext<TInput = unknown, TOutput = unknown, TContext = unknown> {
	/** Parsed and validated input */
	input: TInput;
	/** Context containing user-defined values plus Lens extensions */
	ctx: LensContext<TContext, TOutput>;
}

/** Resolver function type - can return sync, async, or generator */
export type ResolverFn<TInput, TOutput, TContext = unknown> = (
	ctx: ResolverContext<TInput, TOutput, TContext>,
) => TOutput | Promise<TOutput> | AsyncGenerator<TOutput>;

// =============================================================================
// Optimistic DSL Types
// =============================================================================

/** Sugar syntax for common optimistic update patterns */
export type OptimisticSugar = "merge" | "create" | "delete" | { merge: Record<string, unknown> };

/**
 * OptimisticDSL - Defines optimistic update behavior
 *
 * Can be:
 * - Sugar syntax ("merge", "create", "delete", { merge: {...} }) for common patterns
 * - Reify Pipeline for complex multi-entity operations
 */
export type OptimisticDSL = OptimisticSugar | Pipeline;

/**
 * Check if value is an OptimisticDSL (sugar or Pipeline)
 */
export function isOptimisticDSL(value: unknown): value is OptimisticDSL {
	if (value === "merge" || value === "create" || value === "delete") {
		return true;
	}
	if (value && typeof value === "object" && "merge" in value) {
		return true;
	}
	return isPipeline(value);
}

/** Context passed to optimistic callback for type inference */
export interface OptimisticContext<TInput> {
	/** Typed input - inferred from .input() schema */
	input: TInput;
}

/** Optimistic callback that receives typed input and returns step builders */
export type OptimisticCallback<TInput> = (ctx: OptimisticContext<TInput>) => StepBuilder[];
