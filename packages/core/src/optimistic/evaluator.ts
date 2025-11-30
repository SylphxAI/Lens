/**
 * @sylphx/lens-core - Optimistic DSL Evaluator
 *
 * Evaluates multi-entity optimistic DSL to produce entity operations.
 */

import {
	type EntityOperation,
	isValueRef,
	type MultiEntityDSL,
	type RefInput,
	type RefNow,
	type RefSibling,
	type RefTemp,
	tempId,
	type ValueRef,
} from "../operations/index";

// =============================================================================
// Types
// =============================================================================

/** Result of evaluating an entity operation */
export interface EvaluatedOperation {
	/** Target entity type */
	entity: string;
	/** Operation type */
	op: "create" | "update" | "delete";
	/** Entity ID (generated for create, resolved for update/delete) */
	id: string;
	/** Resolved data fields */
	data: Record<string, unknown>;
}

/** Context for value resolution */
export interface EvaluationContext {
	/** Mutation input */
	input: Record<string, unknown>;
	/** Results from previously executed sibling operations */
	siblingResults: Map<string, EvaluatedOperation>;
}

/** Error thrown when DSL evaluation fails */
export class OptimisticEvaluationError extends Error {
	constructor(
		message: string,
		public readonly operation?: string,
		public readonly field?: string,
	) {
		super(message);
		this.name = "OptimisticEvaluationError";
	}
}

// =============================================================================
// Value Resolution
// =============================================================================

/**
 * Resolve a value reference to its concrete value
 */
function resolveValueRef(ref: ValueRef, ctx: EvaluationContext, opName: string): unknown {
	// $input - reference from mutation input
	if ("$input" in ref) {
		const inputRef = ref as RefInput;
		const path = inputRef.$input.split(".");
		let value: unknown = ctx.input;
		for (const key of path) {
			if (value === null || value === undefined) {
				throw new OptimisticEvaluationError(
					`Input path '${inputRef.$input}' not found`,
					opName,
					"$input",
				);
			}
			value = (value as Record<string, unknown>)[key];
		}
		return value;
	}

	// $ref - reference from sibling operation result
	if ("$ref" in ref) {
		const sibRef = ref as RefSibling;
		const [siblingName, ...fieldPath] = sibRef.$ref.split(".");
		const sibling = ctx.siblingResults.get(siblingName);
		if (!sibling) {
			throw new OptimisticEvaluationError(
				`Sibling operation '${siblingName}' not found or not yet executed`,
				opName,
				"$ref",
			);
		}
		// Get field from sibling result
		let value: unknown = siblingName === fieldPath[0] ? sibling : sibling;
		if (fieldPath.length > 0) {
			const field = fieldPath[0];
			if (field === "id") {
				value = sibling.id;
			} else {
				value = sibling.data[field];
			}
			// Handle nested paths
			for (let i = 1; i < fieldPath.length; i++) {
				if (value === null || value === undefined) {
					throw new OptimisticEvaluationError(
						`Sibling path '${sibRef.$ref}' not found`,
						opName,
						"$ref",
					);
				}
				value = (value as Record<string, unknown>)[fieldPath[i]];
			}
		}
		return value;
	}

	// $temp - generate temporary ID
	if ("$temp" in ref) {
		const tempRef = ref as RefTemp;
		if (tempRef.$temp === true) {
			return tempId();
		}
	}

	// $now - current timestamp
	if ("$now" in ref) {
		const nowRef = ref as RefNow;
		if (nowRef.$now === true) {
			return new Date().toISOString();
		}
	}

	throw new OptimisticEvaluationError(`Unknown value reference type`, opName);
}

/**
 * Resolve a value - if it's a reference, resolve it; otherwise return as-is
 */
function resolveValue(value: unknown, ctx: EvaluationContext, opName: string): unknown {
	if (isValueRef(value)) {
		return resolveValueRef(value, ctx, opName);
	}
	return value;
}

// =============================================================================
// Dependency Graph
// =============================================================================

/**
 * Extract dependencies from an entity operation
 * Returns the names of sibling operations this operation depends on
 */
function extractDependencies(op: EntityOperation): string[] {
	const deps: string[] = [];

	for (const [key, value] of Object.entries(op)) {
		// Skip meta fields
		if (key.startsWith("$")) {
			// Check $id for dependencies
			if (key === "$id" && isValueRef(value) && "$ref" in value) {
				const refValue = value as RefSibling;
				const [siblingName] = refValue.$ref.split(".");
				if (!deps.includes(siblingName)) {
					deps.push(siblingName);
				}
			}
			continue;
		}
		// Check data fields for $ref dependencies
		if (isValueRef(value) && "$ref" in value) {
			const refValue = value as RefSibling;
			const [siblingName] = refValue.$ref.split(".");
			if (!deps.includes(siblingName)) {
				deps.push(siblingName);
			}
		}
	}

	return deps;
}

/**
 * Build dependency graph from multi-entity DSL
 * Returns adjacency list: operation name -> dependencies
 */
function buildDependencyGraph(dsl: MultiEntityDSL): Map<string, string[]> {
	const graph = new Map<string, string[]>();

	for (const [name, op] of Object.entries(dsl)) {
		const deps = extractDependencies(op);
		graph.set(name, deps);
	}

	return graph;
}

/**
 * Topological sort of operations based on dependencies
 * Returns operations in execution order (dependencies first)
 * Throws on circular dependencies
 */
function topologicalSort(
	dsl: MultiEntityDSL,
	graph: Map<string, string[]>,
): [string, EntityOperation][] {
	const result: [string, EntityOperation][] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	function visit(name: string): void {
		if (visited.has(name)) return;
		if (visiting.has(name)) {
			throw new OptimisticEvaluationError(`Circular dependency detected at operation '${name}'`);
		}

		visiting.add(name);

		const deps = graph.get(name) || [];
		for (const dep of deps) {
			if (dsl[dep]) {
				visit(dep);
			}
			// If dep doesn't exist in DSL, it might be referencing an external ID (skip)
		}

		visiting.delete(name);
		visited.add(name);
		result.push([name, dsl[name]]);
	}

	for (const name of Object.keys(dsl)) {
		visit(name);
	}

	return result;
}

// =============================================================================
// Main Evaluator
// =============================================================================

/**
 * Evaluate a single entity operation
 */
function evaluateOperation(
	name: string,
	op: EntityOperation,
	ctx: EvaluationContext,
): EvaluatedOperation {
	const entity = op.$entity;
	const opType = op.$op;

	// Resolve ID
	let id: string;
	if (opType === "create") {
		// For create, generate temp ID unless explicitly provided
		if (op.$id !== undefined) {
			id = String(resolveValue(op.$id, ctx, name));
		} else {
			id = tempId();
		}
	} else {
		// For update/delete, $id is required
		if (op.$id === undefined) {
			throw new OptimisticEvaluationError(
				`Operation '${name}' requires $id for ${opType}`,
				name,
				"$id",
			);
		}
		id = String(resolveValue(op.$id, ctx, name));
	}

	// Resolve data fields (skip $ prefixed meta fields)
	const data: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(op)) {
		if (key.startsWith("$")) continue;
		data[key] = resolveValue(value, ctx, name);
	}

	return { entity, op: opType, id, data };
}

/**
 * Evaluate multi-entity optimistic DSL
 *
 * @param dsl - Multi-entity DSL object
 * @param input - Mutation input
 * @returns Array of evaluated operations in execution order
 *
 * @example
 * ```typescript
 * const operations = evaluateMultiEntityDSL({
 *   session: {
 *     $entity: 'Session',
 *     $op: 'create',
 *     title: { $input: 'title' },
 *   },
 *   message: {
 *     $entity: 'Message',
 *     $op: 'create',
 *     sessionId: { $ref: 'session.id' },
 *   },
 * }, { title: 'New Chat' })
 *
 * // Returns:
 * // [
 * //   { entity: 'Session', op: 'create', id: 'temp_0', data: { title: 'New Chat' } },
 * //   { entity: 'Message', op: 'create', id: 'temp_1', data: { sessionId: 'temp_0' } },
 * // ]
 * ```
 */
export function evaluateMultiEntityDSL(
	dsl: MultiEntityDSL,
	input: Record<string, unknown>,
): EvaluatedOperation[] {
	// Build dependency graph
	const graph = buildDependencyGraph(dsl);

	// Topological sort to get execution order
	const sortedOps = topologicalSort(dsl, graph);

	// Evaluate in order
	const ctx: EvaluationContext = {
		input,
		siblingResults: new Map(),
	};

	const results: EvaluatedOperation[] = [];

	for (const [name, op] of sortedOps) {
		const result = evaluateOperation(name, op, ctx);
		ctx.siblingResults.set(name, result);
		results.push(result);
	}

	return results;
}

/**
 * Create a named map of evaluated operations
 * Useful for accessing results by operation name
 */
export function evaluateMultiEntityDSLMap(
	dsl: MultiEntityDSL,
	input: Record<string, unknown>,
): Map<string, EvaluatedOperation> {
	const graph = buildDependencyGraph(dsl);
	const sortedOps = topologicalSort(dsl, graph);

	const ctx: EvaluationContext = {
		input,
		siblingResults: new Map(),
	};

	for (const [name, op] of sortedOps) {
		const result = evaluateOperation(name, op, ctx);
		ctx.siblingResults.set(name, result);
	}

	return ctx.siblingResults;
}
