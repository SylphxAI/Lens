/**
 * @sylphx/lens-core - Optimistic DSL Evaluator
 *
 * Evaluates multi-entity optimistic DSL to produce entity operations.
 */

import {
	type EntityOperation,
	isV2Operator,
	isValueRef,
	type MultiEntityDSL,
	type OpAddToSet,
	type OpDecrement,
	type OpDefault,
	type OpIf,
	type OpIncrement,
	type OpPull,
	type OpPush,
	type RefInput,
	type RefNow,
	type RefSibling,
	type RefState,
	type RefTemp,
	tempId,
	type V2Operator,
	type ValueRef,
} from "../operations/index";

// =============================================================================
// Types
// =============================================================================

/** V2 operator result - deferred computation that needs current state */
export interface DeferredOperation {
	type: "increment" | "decrement" | "push" | "pull" | "addToSet" | "default" | "if";
	value: unknown;
	/** For $if operator */
	condition?: unknown;
	thenValue?: unknown;
	elseValue?: unknown;
}

/** Result of evaluating an entity operation */
export interface EvaluatedOperation {
	/** Target entity type */
	entity: string;
	/** Operation type */
	op: "create" | "update" | "delete";
	/** Entity ID (generated for create, resolved for update/delete) */
	id: string;
	/** Multiple IDs for bulk operations */
	ids?: string[];
	/** Query filter for bulk operations */
	where?: Record<string, unknown>;
	/** Resolved data fields */
	data: Record<string, unknown>;
	/** Deferred operations that need current state */
	deferred?: Record<string, DeferredOperation>;
}

/** Context for value resolution */
export interface EvaluationContext {
	/** Mutation input */
	input: Record<string, unknown>;
	/** Results from previously executed sibling operations */
	siblingResults: Map<string, EvaluatedOperation>;
	/** Entity state lookup function (for $state) */
	getEntityState?: (entity: string, id: string) => Record<string, unknown> | undefined;
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

	// $state - read current entity state
	if ("$state" in ref) {
		const stateRef = ref as RefState;
		if (!ctx.getEntityState) {
			throw new OptimisticEvaluationError(
				`$state reference requires getEntityState in context`,
				opName,
				"$state",
			);
		}
		// $state: "field" reads from the current entity being operated on
		// We'll resolve this at application time when we have the entity ID
		return { $state: stateRef.$state };
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

/**
 * Process a V2 operator and return deferred operation
 */
function processV2Operator(
	op: V2Operator,
	ctx: EvaluationContext,
	opName: string,
): DeferredOperation {
	if ("$increment" in op) {
		const incOp = op as OpIncrement;
		return { type: "increment", value: incOp.$increment };
	}

	if ("$decrement" in op) {
		const decOp = op as OpDecrement;
		return { type: "decrement", value: decOp.$decrement };
	}

	if ("$push" in op) {
		const pushOp = op as OpPush;
		const items = Array.isArray(pushOp.$push) ? pushOp.$push : [pushOp.$push];
		return { type: "push", value: items.map((v) => resolveValue(v, ctx, opName)) };
	}

	if ("$pull" in op) {
		const pullOp = op as OpPull;
		const items = Array.isArray(pullOp.$pull) ? pullOp.$pull : [pullOp.$pull];
		return { type: "pull", value: items.map((v) => resolveValue(v, ctx, opName)) };
	}

	if ("$addToSet" in op) {
		const addOp = op as OpAddToSet;
		const items = Array.isArray(addOp.$addToSet) ? addOp.$addToSet : [addOp.$addToSet];
		return { type: "addToSet", value: items.map((v) => resolveValue(v, ctx, opName)) };
	}

	if ("$default" in op) {
		const defOp = op as OpDefault;
		return { type: "default", value: resolveValue(defOp.$default, ctx, opName) };
	}

	if ("$if" in op) {
		const ifOp = op as OpIf;
		return {
			type: "if",
			value: null,
			condition: resolveValue(ifOp.$if.condition, ctx, opName),
			thenValue: resolveValue(ifOp.$if.then, ctx, opName),
			elseValue: ifOp.$if.else !== undefined ? resolveValue(ifOp.$if.else, ctx, opName) : undefined,
		};
	}

	throw new OptimisticEvaluationError(`Unknown v2 operator`, opName);
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

	// Handle bulk operations ($ids or $where)
	let id = "";
	let ids: string[] | undefined;
	let where: Record<string, unknown> | undefined;

	if (op.$ids !== undefined) {
		// Bulk by IDs
		const resolvedIds = resolveValue(op.$ids, ctx, name);
		if (!Array.isArray(resolvedIds)) {
			throw new OptimisticEvaluationError(`$ids must resolve to an array`, name, "$ids");
		}
		ids = resolvedIds.map(String);
		id = ids[0] || ""; // First ID as primary (for compatibility)
	} else if (op.$where !== undefined) {
		// Bulk by query filter
		where = {};
		for (const [key, value] of Object.entries(op.$where)) {
			where[key] = resolveValue(value, ctx, name);
		}
		id = `where:${JSON.stringify(where)}`; // Synthetic ID for tracking
	} else if (opType === "create") {
		// For create, generate temp ID unless explicitly provided
		if (op.$id !== undefined) {
			id = String(resolveValue(op.$id, ctx, name));
		} else {
			id = tempId();
		}
	} else {
		// For update/delete, $id is required (unless $ids or $where)
		if (op.$id === undefined) {
			throw new OptimisticEvaluationError(
				`Operation '${name}' requires $id, $ids, or $where for ${opType}`,
				name,
				"$id",
			);
		}
		id = String(resolveValue(op.$id, ctx, name));
	}

	// Resolve data fields (skip $ prefixed meta fields)
	const data: Record<string, unknown> = {};
	const deferred: Record<string, DeferredOperation> = {};

	for (const [key, value] of Object.entries(op)) {
		if (key.startsWith("$")) continue;

		// Check if it's a v2 operator
		if (isV2Operator(value)) {
			deferred[key] = processV2Operator(value, ctx, name);
		} else {
			data[key] = resolveValue(value, ctx, name);
		}
	}

	const result: EvaluatedOperation = { entity, op: opType, id, data };

	if (ids) result.ids = ids;
	if (where) result.where = where;
	if (Object.keys(deferred).length > 0) result.deferred = deferred;

	return result;
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

// =============================================================================
// Deferred Operation Application
// =============================================================================

/**
 * Apply a deferred operation to a field value
 *
 * @param deferred - The deferred operation to apply
 * @param currentValue - The current value of the field
 * @returns The new value after applying the operation
 */
export function applyDeferredOperation(
	deferred: DeferredOperation,
	currentValue: unknown,
): unknown {
	switch (deferred.type) {
		case "increment": {
			const current = typeof currentValue === "number" ? currentValue : 0;
			return current + (deferred.value as number);
		}

		case "decrement": {
			const current = typeof currentValue === "number" ? currentValue : 0;
			return current - (deferred.value as number);
		}

		case "push": {
			const current = Array.isArray(currentValue) ? [...currentValue] : [];
			const items = deferred.value as unknown[];
			return [...current, ...items];
		}

		case "pull": {
			if (!Array.isArray(currentValue)) return currentValue;
			const items = deferred.value as unknown[];
			return currentValue.filter((v) => !items.some((item) => isEqual(v, item)));
		}

		case "addToSet": {
			const current = Array.isArray(currentValue) ? [...currentValue] : [];
			const items = deferred.value as unknown[];
			for (const item of items) {
				if (!current.some((v) => isEqual(v, item))) {
					current.push(item);
				}
			}
			return current;
		}

		case "default": {
			return currentValue === undefined ? deferred.value : currentValue;
		}

		case "if": {
			const condition = Boolean(deferred.condition);
			if (condition) {
				return deferred.thenValue;
			}
			return deferred.elseValue !== undefined ? deferred.elseValue : currentValue;
		}

		default:
			return currentValue;
	}
}

/**
 * Apply all deferred operations to entity data
 *
 * @param operation - The evaluated operation with deferred fields
 * @param currentState - The current entity state
 * @returns Updated data with deferred operations applied
 */
export function applyDeferredOperations(
	operation: EvaluatedOperation,
	currentState: Record<string, unknown> = {},
): Record<string, unknown> {
	const result = { ...operation.data };

	if (operation.deferred) {
		for (const [field, deferred] of Object.entries(operation.deferred)) {
			result[field] = applyDeferredOperation(deferred, currentState[field]);
		}
	}

	return result;
}

/**
 * Simple deep equality check for $pull and $addToSet
 */
function isEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;
	if (typeof a !== "object") return false;

	const aObj = a as Record<string, unknown>;
	const bObj = b as Record<string, unknown>;
	const aKeys = Object.keys(aObj);
	const bKeys = Object.keys(bObj);

	if (aKeys.length !== bKeys.length) return false;

	return aKeys.every((key) => isEqual(aObj[key], bObj[key]));
}
