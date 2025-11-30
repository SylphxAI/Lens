/**
 * @sylphx/lens-core - Optimistic DSL Builder
 *
 * Type-safe builder for optimistic update DSL.
 * Compiles to raw JSON DSL at define-time.
 */

import type {
	EntityOperation,
	MultiEntityDSL,
	OpType,
	RefNow,
	RefTemp,
	V2Operator,
} from "../operations/index";

// =============================================================================
// Symbol for identifying DSL values
// =============================================================================

const DSL_MARKER: unique symbol = Symbol("dsl");

interface DslValue {
	[DSL_MARKER]: true;
	toJSON(): unknown;
}

function isDslValue(value: unknown): value is DslValue {
	return typeof value === "object" && value !== null && DSL_MARKER in value;
}

// =============================================================================
// Input Proxy - input.field → { $input: 'field' }
// =============================================================================

/**
 * Create a proxy that converts property access to $input references
 * input.field → { $input: 'field' }
 * input.user.name → { $input: 'user.name' }
 */
function createInputProxy<T extends object>(basePath = ""): T {
	const handler: ProxyHandler<T> = {
		get(_, prop) {
			if (prop === DSL_MARKER) return true;
			if (prop === "toJSON") {
				return () => ({ $input: basePath });
			}
			if (prop === "$input") return basePath;
			const path = basePath ? `${basePath}.${String(prop)}` : String(prop);
			// Return nested proxy for chaining
			return createInputProxy(path);
		},
	};
	return new Proxy(
		{
			[DSL_MARKER]: true,
			$input: basePath,
			toJSON() {
				return { $input: basePath };
			},
		} as T,
		handler,
	);
}

// =============================================================================
// Ref Proxy - ref.from('session').id → { $ref: 'session.id' }
// =============================================================================

interface RefFrom {
	[key: string]: RefFrom;
}

function createRefFromProxy(basePath: string): RefFrom {
	const handler: ProxyHandler<RefFrom> = {
		get(_, prop) {
			if (prop === DSL_MARKER) return true;
			if (prop === "toJSON") {
				return () => ({ $ref: basePath });
			}
			if (prop === "$ref") return basePath;
			const path = `${basePath}.${String(prop)}`;
			return createRefFromProxy(path);
		},
	};
	return new Proxy(
		{
			[DSL_MARKER]: true,
			$ref: basePath,
			toJSON() {
				return { $ref: basePath };
			},
		} as unknown as RefFrom,
		handler,
	);
}

// =============================================================================
// Ref Namespace - All special values
// =============================================================================

/**
 * Reference helpers for special values in DSL
 */
export const ref = {
	/**
	 * Reference another operation's result
	 * ref.from('session').id → { $ref: 'session.id' }
	 */
	from(operationName: string): RefFrom {
		return createRefFromProxy(operationName);
	},

	/**
	 * Current timestamp
	 * ref.now() → { $now: true }
	 */
	now(): RefNow & DslValue {
		return {
			[DSL_MARKER]: true,
			$now: true,
			toJSON() {
				return { $now: true };
			},
		};
	},

	/**
	 * Generate temporary ID
	 * ref.temp() → { $temp: true }
	 */
	temp(): RefTemp & DslValue {
		return {
			[DSL_MARKER]: true,
			$temp: true,
			toJSON() {
				return { $temp: true };
			},
		};
	},

	/**
	 * Increment numeric field
	 * ref.increment(1) → { $increment: 1 }
	 */
	increment(n: number): V2Operator & DslValue {
		return {
			[DSL_MARKER]: true,
			$increment: n,
			toJSON() {
				return { $increment: n };
			},
		} as V2Operator & DslValue;
	},

	/**
	 * Decrement numeric field
	 * ref.decrement(1) → { $decrement: 1 }
	 */
	decrement(n: number): V2Operator & DslValue {
		return {
			[DSL_MARKER]: true,
			$decrement: n,
			toJSON() {
				return { $decrement: n };
			},
		} as V2Operator & DslValue;
	},

	/**
	 * Push items to array
	 * ref.push('item') → { $push: 'item' }
	 */
	push(...items: unknown[]): V2Operator & DslValue {
		const value = items.length === 1 ? items[0] : items;
		return {
			[DSL_MARKER]: true,
			$push: value,
			toJSON() {
				return { $push: value };
			},
		} as V2Operator & DslValue;
	},

	/**
	 * Pull items from array
	 * ref.pull('item') → { $pull: 'item' }
	 */
	pull(...items: unknown[]): V2Operator & DslValue {
		const value = items.length === 1 ? items[0] : items;
		return {
			[DSL_MARKER]: true,
			$pull: value,
			toJSON() {
				return { $pull: value };
			},
		} as V2Operator & DslValue;
	},

	/**
	 * Add to set (push if not exists)
	 * ref.addToSet('item') → { $addToSet: 'item' }
	 */
	addToSet(...items: unknown[]): V2Operator & DslValue {
		const value = items.length === 1 ? items[0] : items;
		return {
			[DSL_MARKER]: true,
			$addToSet: value,
			toJSON() {
				return { $addToSet: value };
			},
		} as V2Operator & DslValue;
	},

	/**
	 * Default value if undefined
	 * ref.default('fallback') → { $default: 'fallback' }
	 */
	default(value: unknown): V2Operator & DslValue {
		return {
			[DSL_MARKER]: true,
			$default: value,
			toJSON() {
				return { $default: value };
			},
		} as V2Operator & DslValue;
	},

	/**
	 * Conditional value
	 * ref.if(condition, 'yes', 'no') → { $if: { condition, then, else } }
	 */
	if(condition: unknown, thenValue: unknown, elseValue?: unknown): V2Operator & DslValue {
		return {
			[DSL_MARKER]: true,
			$if: {
				condition: serializeValue(condition),
				then: serializeValue(thenValue),
				else: elseValue !== undefined ? serializeValue(elseValue) : undefined,
			},
			toJSON() {
				return {
					$if: {
						condition: serializeValue(condition),
						then: serializeValue(thenValue),
						else: elseValue !== undefined ? serializeValue(elseValue) : undefined,
					},
				};
			},
		} as V2Operator & DslValue;
	},
};

// =============================================================================
// Operation Builders with .as() chaining
// =============================================================================

/** Internal operation representation */
interface BuiltOperation {
	_type: "operation";
	_name?: string;
	_entity: string;
	_op: OpType;
	_id?: unknown;
	_ids?: unknown;
	_where?: Record<string, unknown>;
	_data: Record<string, unknown>;
}

/** Operation with .as() method */
interface OperationWithAs extends BuiltOperation {
	as(name: string): BuiltOperation;
}

function createOperationWithAs(operation: BuiltOperation): OperationWithAs {
	return {
		...operation,
		as(name: string): BuiltOperation {
			return { ...operation, _name: name };
		},
	};
}

/**
 * Operation builders
 */
export const op = {
	/**
	 * Create a new entity
	 * op.create('Session', { title: input.title }).as('session')
	 */
	create<E extends string>(entity: E, data: Record<string, unknown>): OperationWithAs {
		return createOperationWithAs({
			_type: "operation",
			_entity: entity,
			_op: "create",
			_data: data,
		});
	},

	/**
	 * Update an existing entity
	 * op.update('Session', { id: input.id, title: 'new' }).as('session')
	 */
	update<E extends string>(entity: E, data: Record<string, unknown>): OperationWithAs {
		const { id, ...rest } = data;
		return createOperationWithAs({
			_type: "operation",
			_entity: entity,
			_op: "update",
			_id: id,
			_data: rest,
		});
	},

	/**
	 * Delete an entity
	 * op.delete('Post', input.postId).as('deleted')
	 */
	delete<E extends string>(entity: E, id: unknown): OperationWithAs {
		return createOperationWithAs({
			_type: "operation",
			_entity: entity,
			_op: "delete",
			_id: id,
			_data: {},
		});
	},

	/**
	 * Bulk update entities
	 * op.updateMany('Post', { where: { status: 'draft' }, data: { archived: true } })
	 */
	updateMany<E extends string>(
		entity: E,
		opts: { where?: Record<string, unknown>; ids?: unknown; data: Record<string, unknown> },
	): OperationWithAs {
		return createOperationWithAs({
			_type: "operation",
			_entity: entity,
			_op: "update",
			_ids: opts.ids,
			_where: opts.where,
			_data: opts.data,
		});
	},
};

// =============================================================================
// Conditional Flow - when().then().else()
// =============================================================================

/** Conditional operation */
interface ConditionalOperation {
	_type: "conditional";
	_condition: unknown;
	_then: BuiltOperation[];
	_else?: BuiltOperation[];
}

type PipelineOperation = BuiltOperation | OperationWithAs | ConditionalOperation;

interface WhenBuilder {
	then(operations: (BuiltOperation | OperationWithAs)[]): ThenBuilder;
}

interface ThenBuilder extends ConditionalOperation {
	else(operations: (BuiltOperation | OperationWithAs)[]): ConditionalOperation;
}

/**
 * Conditional operation flow
 * when(input.sessionId).then([...]).else([...])
 */
export function when(condition: unknown): WhenBuilder {
	const serializedCondition = serializeValue(condition);

	return {
		then(thenOps: (BuiltOperation | OperationWithAs)[]): ThenBuilder {
			const normalizedThen = thenOps.map((op) => normalizeOperation(op));

			const result: ThenBuilder = {
				_type: "conditional",
				_condition: serializedCondition,
				_then: normalizedThen,
				else(elseOps: (BuiltOperation | OperationWithAs)[]): ConditionalOperation {
					return {
						_type: "conditional",
						_condition: serializedCondition,
						_then: normalizedThen,
						_else: elseOps.map((op) => normalizeOperation(op)),
					};
				},
			};
			return result;
		},
	};
}

function normalizeOperation(op: BuiltOperation | OperationWithAs): BuiltOperation {
	// Remove the .as method if present
	const { as: _, ...rest } = op as OperationWithAs;
	return rest as BuiltOperation;
}

// =============================================================================
// Pipeline - Compile to Raw DSL
// =============================================================================

/** Pipeline context passed to builder function */
interface PipelineContext<TInput> {
	/** Input proxy - access creates $input references */
	input: TInput;
}

/**
 * Serialize a value to raw DSL format
 */
function serializeValue(value: unknown): unknown {
	if (isDslValue(value)) {
		return value.toJSON();
	}
	if (Array.isArray(value)) {
		return value.map(serializeValue);
	}
	if (typeof value === "object" && value !== null) {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			result[k] = serializeValue(v);
		}
		return result;
	}
	return value;
}

/**
 * Compile a built operation to raw EntityOperation
 */
function compileOperation(built: BuiltOperation): EntityOperation {
	const result: EntityOperation = {
		$entity: built._entity,
		$op: built._op,
	};

	if (built._id !== undefined) {
		result.$id = serializeValue(built._id) as string;
	}
	if (built._ids !== undefined) {
		result.$ids = serializeValue(built._ids) as string[];
	}
	if (built._where !== undefined) {
		result.$where = serializeValue(built._where) as Record<string, unknown>;
	}

	// Add data fields
	for (const [key, value] of Object.entries(built._data)) {
		result[key] = serializeValue(value);
	}

	return result;
}

/**
 * Compile a conditional operation to raw EntityOperation(s)
 * Returns operations keyed by their names
 */
function compileConditional(cond: ConditionalOperation): Record<string, EntityOperation> {
	const result: Record<string, EntityOperation> = {};

	// For conditionals with matching .as() names in both branches,
	// we create an operation with conditional $op
	const thenOps = cond._then;
	const elseOps = cond._else || [];

	// Find operations with the same name in both branches
	const thenByName = new Map<string, BuiltOperation>();
	const elseName = new Map<string, BuiltOperation>();

	for (const op of thenOps) {
		if (op._name) thenByName.set(op._name, op);
	}
	for (const op of elseOps) {
		if (op._name) elseName.set(op._name, op);
	}

	// Process matched operations (same name in both branches)
	for (const [name, thenOp] of thenByName) {
		const elseOp = elseName.get(name);
		if (elseOp) {
			// Conditional operation
			const compiled: EntityOperation = {
				$entity: thenOp._entity,
				$op: {
					$if: {
						condition: cond._condition as boolean,
						then: thenOp._op,
						else: elseOp._op,
					},
				},
			};

			// Use $id from the appropriate branch
			if (thenOp._id !== undefined) {
				compiled.$id = serializeValue(thenOp._id) as string;
			} else if (elseOp._id !== undefined) {
				compiled.$id = serializeValue(elseOp._id) as string;
			}

			// Merge data from both branches with $if wrappers where different
			const allKeys = new Set([...Object.keys(thenOp._data), ...Object.keys(elseOp._data)]);
			for (const key of allKeys) {
				const thenVal = thenOp._data[key];
				const elseVal = elseOp._data[key];
				if (thenVal !== undefined && elseVal !== undefined) {
					// Both have the value - use conditional if different
					compiled[key] = serializeValue(thenVal);
				} else if (thenVal !== undefined) {
					compiled[key] = serializeValue(thenVal);
				} else if (elseVal !== undefined) {
					compiled[key] = serializeValue(elseVal);
				}
			}

			result[name] = compiled;
			elseName.delete(name);
		} else {
			// Only in then branch - wrap in conditional
			const compiled = compileOperation(thenOp);
			result[name] = compiled;
		}
	}

	// Process remaining else operations
	for (const [name, elseOp] of elseName) {
		const compiled = compileOperation(elseOp);
		result[name] = compiled;
	}

	// Process unnamed operations (just compile them)
	let unnamedCounter = 0;
	for (const op of [...thenOps, ...elseOps]) {
		if (!op._name) {
			const key = `_unnamed_${unnamedCounter++}`;
			result[key] = compileOperation(op);
		}
	}

	return result;
}

/**
 * Create a type-safe DSL pipeline
 *
 * @param builder - Function that returns array of operations
 * @returns Compiled MultiEntityDSL
 *
 * @example
 * ```typescript
 * const dsl = pipeline(({ input }) => [
 *   when(input.sessionId)
 *     .then([op.update('Session', { id: input.sessionId }).as('session')])
 *     .else([op.create('Session', { title: input.title }).as('session')]),
 *
 *   op.create('Message', { sessionId: ref.from('session').id }).as('message'),
 * ]);
 * ```
 */
export function pipeline<TInput extends object = Record<string, unknown>>(
	builder: (ctx: PipelineContext<TInput>) => PipelineOperation[],
): MultiEntityDSL {
	// Create input proxy
	const input = createInputProxy<TInput>();

	// Execute builder to get operations
	const operations = builder({ input });

	// Compile to raw DSL
	const result: MultiEntityDSL = {};

	for (const operation of operations) {
		if (operation._type === "conditional") {
			const compiled = compileConditional(operation);
			Object.assign(result, compiled);
		} else {
			const normalized = normalizeOperation(operation);
			const compiled = compileOperation(normalized);
			const name = normalized._name || `_op_${Object.keys(result).length}`;
			result[name] = compiled;
		}
	}

	return result;
}

// =============================================================================
// Re-export for convenience
// =============================================================================

export { createInputProxy };
