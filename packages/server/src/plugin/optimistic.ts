/**
 * @sylphx/lens-server - Optimistic Updates Plugin
 *
 * Server-side plugin that enables optimistic update configuration.
 * Processes mutation definitions and adds optimistic config to handshake metadata.
 *
 * Without this plugin, mutations won't have optimistic config in handshake.
 * Client needs a matching optimisticPlugin to execute the pipelines.
 *
 * @example
 * ```typescript
 * const server = createServer({
 *   router,
 *   plugins: [optimisticPlugin()],
 * });
 * ```
 */

import { isPipeline, type Pipeline } from "@sylphx/lens-core";
import type { EnhanceOperationMetaContext, ServerPlugin } from "./types.js";

/**
 * Optimistic plugin configuration.
 */
export interface OptimisticPluginOptions {
	/**
	 * Whether to auto-derive optimistic config from mutation naming.
	 * - `updateX` → "merge"
	 * - `createX` / `addX` → "create"
	 * - `deleteX` / `removeX` → "delete"
	 * @default true
	 */
	autoDerive?: boolean;

	/**
	 * Enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

/**
 * Sugar syntax types for optimistic updates.
 */
type OptimisticSugar = "merge" | "create" | "delete";
type OptimisticMerge = { merge: Record<string, unknown> };
type OptimisticDSL = OptimisticSugar | OptimisticMerge | Pipeline;

/**
 * MutationDef shape for type checking.
 */
interface MutationDefLike {
	_optimistic?: OptimisticDSL;
	_output?: unknown;
	_input?: { shape?: Record<string, unknown> };
}

/**
 * Extract entity type name from return spec.
 */
function getEntityTypeName(returnSpec: unknown): string | undefined {
	if (!returnSpec) return undefined;

	if (typeof returnSpec === "object" && "_tag" in returnSpec) {
		const spec = returnSpec as { _tag: string; entityDef?: { _name?: string }; element?: unknown };
		if (spec._tag === "entity" && spec.entityDef?._name) {
			return spec.entityDef._name;
		}
		if (spec._tag === "array" && spec.element) {
			return getEntityTypeName(spec.element);
		}
	}

	return undefined;
}

/**
 * Get input field names from Zod schema.
 */
function getInputFields(schema: { shape?: Record<string, unknown> } | undefined): string[] {
	if (!schema?.shape) return [];
	return Object.keys(schema.shape);
}

/**
 * Convert sugar syntax to Reify Pipeline.
 *
 * Sugar syntax:
 * - "merge" → merge input fields into entity
 * - "create" → add new entity from output
 * - "delete" → remove entity by input.id
 *
 * Returns the original value if already a Pipeline.
 */
function sugarToPipeline(
	sugar: OptimisticDSL | undefined,
	entityType: string | undefined,
	inputFields: string[],
): Pipeline | undefined {
	if (!sugar) return undefined;
	if (isPipeline(sugar)) return sugar;

	const entity = entityType ?? "Entity";

	switch (sugar) {
		case "merge":
			return [{ type: "merge", target: { entity, id: ["input", "id"] }, fields: inputFields }];
		case "create":
			return [{ type: "add", entity, data: ["output"] }];
		case "delete":
			return [{ type: "remove", entity, id: ["input", "id"] }];
		default:
			// Handle { merge: {...} } sugar
			if (typeof sugar === "object" && "merge" in sugar) {
				return [
					{
						type: "merge",
						target: { entity, id: ["input", "id"] },
						fields: inputFields,
						extra: sugar.merge,
					},
				];
			}
			return undefined;
	}
}

/**
 * Check if a value is optimistic DSL.
 */
function isOptimisticDSL(value: unknown): value is OptimisticDSL {
	if (value === "merge" || value === "create" || value === "delete") return true;
	if (isPipeline(value)) return true;
	if (typeof value === "object" && value !== null && "merge" in value) return true;
	return false;
}

/**
 * Create an optimistic plugin.
 *
 * This plugin processes mutation definitions and adds optimistic config
 * to the handshake metadata, enabling client-side optimistic updates.
 *
 * @example
 * ```typescript
 * const server = createServer({
 *   router: appRouter,
 *   plugins: [optimisticPlugin()],
 * });
 * ```
 */
export function optimisticPlugin(options: OptimisticPluginOptions = {}): ServerPlugin {
	const { autoDerive = true, debug = false } = options;

	const log = (...args: unknown[]) => {
		if (debug) {
			console.log("[optimisticPlugin]", ...args);
		}
	};

	return {
		name: "optimistic",

		/**
		 * Enhance operation metadata with optimistic config.
		 * Called for each operation when building handshake metadata.
		 */
		enhanceOperationMeta(ctx: EnhanceOperationMetaContext): void {
			// Only process mutations
			if (ctx.type !== "mutation") return;

			const def = ctx.definition as MutationDefLike;
			let optimisticSpec = def._optimistic;

			// Auto-derive from naming convention if enabled and not explicitly set
			if (!optimisticSpec && autoDerive) {
				const lastSegment = ctx.path.includes(".") ? ctx.path.split(".").pop()! : ctx.path;

				if (lastSegment.startsWith("update")) {
					optimisticSpec = "merge";
				} else if (lastSegment.startsWith("create") || lastSegment.startsWith("add")) {
					optimisticSpec = "create";
				} else if (lastSegment.startsWith("delete") || lastSegment.startsWith("remove")) {
					optimisticSpec = "delete";
				}

				log(`Auto-derived optimistic for ${ctx.path}:`, optimisticSpec);
			}

			// Convert to pipeline and add to metadata
			if (optimisticSpec && isOptimisticDSL(optimisticSpec)) {
				const entityType = getEntityTypeName(def._output);
				const inputFields = getInputFields(def._input);
				const pipeline = sugarToPipeline(optimisticSpec, entityType, inputFields);

				if (pipeline) {
					ctx.meta.optimistic = pipeline;
					log(`Added optimistic config for ${ctx.path}:`, pipeline);
				}
			}
		},
	};
}

/**
 * Check if a plugin is an optimistic plugin.
 */
export function isOptimisticPlugin(plugin: ServerPlugin): boolean {
	return plugin.name === "optimistic";
}
