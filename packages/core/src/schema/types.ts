/**
 * @lens/core - Schema Type Builders
 *
 * Type-safe DSL for defining entity schemas.
 * Every type supports full TypeScript inference.
 */

// =============================================================================
// Type Brands (for type discrimination)
// =============================================================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

// =============================================================================
// Base Type Classes
// =============================================================================

/** Base class for all field types */
export abstract class FieldType<T = unknown> {
	abstract readonly _type: string;
	abstract readonly _tsType: T;

	protected _nullable = false;
	protected _default?: T;

	/** Make this field nullable */
	nullable(): NullableType<this> {
		const clone = Object.create(this);
		clone._nullable = true;
		return clone as NullableType<this>;
	}

	/** Set default value */
	default(value: T): DefaultType<this, T> {
		const clone = Object.create(this);
		clone._default = value;
		return clone as DefaultType<this, T>;
	}

	/** Check if field is nullable */
	isNullable(): boolean {
		return this._nullable;
	}

	/** Get default value */
	getDefault(): T | undefined {
		return this._default;
	}
}

/** Wrapper type for nullable fields */
export type NullableType<T extends FieldType> = T & {
	_tsType: T["_tsType"] | null;
};

/** Wrapper type for fields with defaults */
export type DefaultType<T extends FieldType, D> = T & {
	_default: D;
};

// =============================================================================
// Scalar Types
// =============================================================================

/** ID field type (primary key) */
export class IdType extends FieldType<string> {
	readonly _type = "id" as const;
	readonly _tsType!: string;
}

/** String field type */
export class StringType extends FieldType<string> {
	readonly _type = "string" as const;
	readonly _tsType!: string;
}

/** Integer field type */
export class IntType extends FieldType<number> {
	readonly _type = "int" as const;
	readonly _tsType!: number;
}

/** Float field type */
export class FloatType extends FieldType<number> {
	readonly _type = "float" as const;
	readonly _tsType!: number;
}

/** Boolean field type */
export class BooleanType extends FieldType<boolean> {
	readonly _type = "boolean" as const;
	readonly _tsType!: boolean;
}

/** DateTime field type */
export class DateTimeType extends FieldType<Date> {
	readonly _type = "datetime" as const;
	readonly _tsType!: Date;
}

/** Enum field type */
export class EnumType<T extends readonly string[]> extends FieldType<T[number]> {
	readonly _type = "enum" as const;
	readonly _tsType!: T[number];

	constructor(public readonly values: T) {
		super();
	}
}

/** Typed object field type */
export class ObjectType<T> extends FieldType<T> {
	readonly _type = "object" as const;
	readonly _tsType!: T;
}

/** Array field type */
export class ArrayType<T> extends FieldType<T[]> {
	readonly _type = "array" as const;
	readonly _tsType!: T[];

	constructor(public readonly itemType: FieldType<T>) {
		super();
	}
}

// =============================================================================
// Relation Types
// =============================================================================

/** Relation type brand */
export type RelationBrand = Brand<string, "relation">;

/** HasOne relation (1:1, owns the relation) */
export class HasOneType<Target extends string> extends FieldType<RelationBrand> {
	readonly _type = "hasOne" as const;
	readonly _tsType!: RelationBrand;
	readonly _relationKind = "hasOne" as const;

	constructor(public readonly target: Target) {
		super();
	}
}

/** HasMany relation (1:N) */
export class HasManyType<Target extends string> extends FieldType<RelationBrand[]> {
	readonly _type = "hasMany" as const;
	readonly _tsType!: RelationBrand[];
	readonly _relationKind = "hasMany" as const;

	constructor(public readonly target: Target) {
		super();
	}
}

/** BelongsTo relation (N:1, foreign key side) */
export class BelongsToType<Target extends string> extends FieldType<RelationBrand> {
	readonly _type = "belongsTo" as const;
	readonly _tsType!: RelationBrand;
	readonly _relationKind = "belongsTo" as const;

	constructor(public readonly target: Target) {
		super();
	}
}

// =============================================================================
// Type Builders (t.*)
// =============================================================================

/**
 * Type builder DSL
 *
 * @example
 * ```typescript
 * const schema = createSchema({
 *   User: {
 *     id: t.id(),
 *     name: t.string(),
 *     age: t.int().nullable(),
 *     status: t.enum(['active', 'inactive']),
 *     posts: t.hasMany('Post'),
 *   },
 * });
 * ```
 */
export const t = {
	/** Primary key (string UUID/CUID) */
	id: () => new IdType(),

	/** Text field */
	string: () => new StringType(),

	/** Integer number */
	int: () => new IntType(),

	/** Floating point number */
	float: () => new FloatType(),

	/** Boolean value */
	boolean: () => new BooleanType(),

	/** Date/time value */
	datetime: () => new DateTimeType(),

	/** Enum with specific values */
	enum: <const T extends readonly string[]>(values: T) => new EnumType(values),

	/** Typed object/JSON */
	object: <T>() => new ObjectType<T>(),

	/** Array of a type */
	array: <T>(itemType: FieldType<T>) => new ArrayType(itemType),

	// Relations

	/** One-to-one relation (owns) */
	hasOne: <T extends string>(target: T) => new HasOneType(target),

	/** One-to-many relation */
	hasMany: <T extends string>(target: T) => new HasManyType(target),

	/** Many-to-one relation (foreign key) */
	belongsTo: <T extends string>(target: T) => new BelongsToType(target),
} as const;

// =============================================================================
// Type Guards
// =============================================================================

/** Check if field is a relation type */
export function isRelationType(
	field: FieldType,
): field is HasOneType<string> | HasManyType<string> | BelongsToType<string> {
	return field._type === "hasOne" || field._type === "hasMany" || field._type === "belongsTo";
}

/** Check if field is a scalar type */
export function isScalarType(field: FieldType): boolean {
	return !isRelationType(field);
}

/** Check if field is hasMany (array relation) */
export function isHasManyType(field: FieldType): field is HasManyType<string> {
	return field._type === "hasMany";
}

// =============================================================================
// Entity Definition Types
// =============================================================================

/** Field definition (any field type) */
export type FieldDefinition = FieldType;

/** Entity definition (collection of fields) */
export type EntityDefinition = Record<string, FieldDefinition>;

/** Schema definition (collection of entities) */
export type SchemaDefinition = Record<string, EntityDefinition>;
