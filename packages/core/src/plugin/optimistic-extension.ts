/**
 * @sylphx/lens-core - Optimistic Plugin Extension
 *
 * Type extension for the optimistic updates plugin.
 * Declares the .optimistic() method on mutation builders.
 *
 * @example
 * ```typescript
 * // With optimistic plugin - .optimistic() is available
 * const { mutation } = lens<AppContext>({ plugins: [optimisticPlugin()] });
 * mutation()
 *   .input(z.object({ id: z.string(), name: z.string() }))
 *   .returns(User)
 *   .optimistic('merge')  // ✅ Available
 *   .resolve(({ input }) => db.user.update(input));
 * ```
 */

import type {
	MutationBuilderWithOptimistic,
	MutationDef,
	OptimisticCallback,
	OptimisticDSL,
	ResolverFn,
} from "../operations/index.js";
import type { PluginExtension, RuntimePlugin } from "./types.js";

// =============================================================================
// Module Augmentation - Register Optimistic Methods in Plugin Registry
// =============================================================================

/**
 * Augment the PluginMethodRegistry to add optimistic plugin methods.
 *
 * This is the key mechanism that allows plugins to add type-safe methods
 * to builders. The TInput, TOutput, TContext parameters are bound from
 * the builder's generic context.
 */
declare module "./types.js" {
	// Note: Parameter names must match the original interface exactly
	interface PluginMethodRegistry<_TInput, _TOutput, _TContext> {
		/**
		 * Optimistic plugin methods.
		 * Registered under 'optimistic' key matching the plugin name.
		 */
		optimistic: {
			/**
			 * Methods added after .returns() is called.
			 */
			MutationBuilderWithReturns: {
				/**
				 * Define optimistic update behavior.
				 *
				 * @param spec - Optimistic update specification (sugar or Pipeline)
				 * @returns Builder with .resolve() method
				 */
				optimistic(
					spec: OptimisticDSL,
				): MutationBuilderWithOptimistic<_TInput, _TOutput, _TContext>;

				/**
				 * Define optimistic update with typed input callback.
				 *
				 * @param callback - Function that receives typed input proxy and returns step builders
				 * @returns Builder with .resolve() method
				 */
				optimistic(
					callback: OptimisticCallback<_TInput>,
				): MutationBuilderWithOptimistic<_TInput, _TOutput, _TContext>;
			};
		};
	}
}

// =============================================================================
// Optimistic Plugin Extension Type
// =============================================================================

/**
 * Type extension for optimistic updates plugin.
 *
 * This interface is used by the lens() factory to identify the plugin
 * and compose builder types. The actual methods come from the
 * PluginMethodRegistry augmentation above.
 */
export interface OptimisticPluginExtension extends PluginExtension {
	readonly name: "optimistic";
}

// =============================================================================
// Legacy Types (for backward compatibility)
// =============================================================================

/**
 * Mutation builder state after .optimistic() is called.
 * Only .resolve() is available at this point.
 *
 * @deprecated Use MutationBuilderWithOptimistic from operations/index.ts
 */
export interface MutationBuilderWithOptimisticExt<TInput, TOutput, TContext> {
	resolve(fn: ResolverFn<TInput, TOutput, TContext>): MutationDef<TInput, TOutput>;
}

// =============================================================================
// Runtime Plugin Marker
// =============================================================================

/**
 * Symbol to identify optimistic plugin instances.
 * Used for runtime type checking and plugin detection.
 */
declare const OPTIMISTIC_PLUGIN_BRAND: unique symbol;
export const OPTIMISTIC_PLUGIN_SYMBOL: typeof OPTIMISTIC_PLUGIN_BRAND = Symbol.for(
	"lens:optimistic-plugin",
) as typeof OPTIMISTIC_PLUGIN_BRAND;

/**
 * Marker interface for optimistic plugin instances.
 * Combines RuntimePlugin with a unique symbol for type narrowing.
 */
export interface OptimisticPluginMarker extends RuntimePlugin<OptimisticPluginExtension> {
	readonly [OPTIMISTIC_PLUGIN_SYMBOL]: true;
}

/**
 * Type guard to check if a plugin is an optimistic plugin.
 */
export function isOptimisticPlugin(plugin: unknown): plugin is OptimisticPluginMarker {
	return (
		typeof plugin === "object" &&
		plugin !== null &&
		OPTIMISTIC_PLUGIN_SYMBOL in plugin &&
		(plugin as OptimisticPluginMarker)[OPTIMISTIC_PLUGIN_SYMBOL] === true
	);
}
