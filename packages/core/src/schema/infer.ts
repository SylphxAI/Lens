/**
 * @lens/core - Type Inference Utilities
 *
 * Powerful type inference from schema definitions.
 * Enables full end-to-end type safety.
 */

import type {
	ArrayType,
	BelongsToType,
	BooleanType,
	DateTimeType,
	EntityDefinition,
	EnumType,
	FieldDefinition,
	FieldType,
	FloatType,
	HasManyType,
	HasOneType,
	IdType,
	IntType,
	ObjectType,
	SchemaDefinition,
	StringType,
} from "./types";

// =============================================================================
// Scalar Type Inference
// =============================================================================

/** Infer TypeScript type from a scalar field type */
export type InferScalar<T extends FieldType> = T extends IdType
	? string
	: T extends StringType
		? string
		: T extends IntType
			? number
			: T extends FloatType
				? number
				: T extends BooleanType
					? boolean
					: T extends DateTimeType
						? Date
						: T extends EnumType<infer V>
							? V[number]
							: T extends ObjectType<infer O>
								? O
								: T extends ArrayType<infer I>
									? I[]
									: never;

// =============================================================================
// Relation Type Inference
// =============================================================================

/** Infer the target entity name from a relation type */
export type InferRelationTarget<T> = T extends HasOneType<infer Target>
	? Target
	: T extends HasManyType<infer Target>
		? Target
		: T extends BelongsToType<infer Target>
			? Target
			: never;

/** Check if a field is a relation */
export type IsRelation<T> = T extends HasOneType<string>
	? true
	: T extends HasManyType<string>
		? true
		: T extends BelongsToType<string>
			? true
			: false;

/** Check if a field is hasMany */
export type IsHasMany<T> = T extends HasManyType<string> ? true : false;

// =============================================================================
// Field Categorization
// =============================================================================

/** Extract scalar field keys from entity definition */
export type ScalarFields<E extends EntityDefinition> = {
	[K in keyof E]: IsRelation<E[K]> extends true ? never : K;
}[keyof E];

/** Extract relation field keys from entity definition */
export type RelationFields<E extends EntityDefinition> = {
	[K in keyof E]: IsRelation<E[K]> extends true ? K : never;
}[keyof E];

// =============================================================================
// Entity Type Inference
// =============================================================================

/** Infer full entity type from definition, resolving relations within schema */
export type InferEntity<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	// Scalar fields
	[K in ScalarFields<E>]: InferFieldType<E[K], S>;
} & {
	// Relation fields
	[K in RelationFields<E>]: InferRelationType<E[K], S>;
};

/** Infer field type (scalar or relation) */
export type InferFieldType<F extends FieldDefinition, S extends SchemaDefinition> =
	IsRelation<F> extends true ? InferRelationType<F, S> : InferScalarWithNullable<F>;

/** Infer scalar type with nullable support */
export type InferScalarWithNullable<F extends FieldType> = F extends { _nullable: true }
	? InferScalar<F> | null
	: InferScalar<F>;

/** Infer relation type, resolving to target entity if schema provided */
export type InferRelationType<F extends FieldDefinition, S extends SchemaDefinition> = [
	S,
] extends [never]
	? // No schema context - return placeholder
		F extends HasManyType<infer Target>
		? Array<{ __entity: Target }>
		: F extends HasOneType<infer Target>
			? { __entity: Target } | null
			: F extends BelongsToType<infer Target>
				? { __entity: Target }
				: never
	: // With schema context - resolve to actual entity type
		F extends HasManyType<infer Target>
		? Target extends keyof S
			? Array<InferEntity<S[Target], S>>
			: never
		: F extends HasOneType<infer Target>
			? Target extends keyof S
				? InferEntity<S[Target], S> | null
				: never
			: F extends BelongsToType<infer Target>
				? Target extends keyof S
					? InferEntity<S[Target], S>
					: never
				: never;

// =============================================================================
// Field Selection Type Inference
// =============================================================================

/** Selection object type */
export type Select<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	[K in keyof E]?: IsRelation<E[K]> extends true
		? // For relations, allow nested selection or true
			| true
				| {
						select?: InferRelationTarget<E[K]> extends keyof S
							? Select<S[InferRelationTarget<E[K]>], S>
							: never;
						take?: number;
						skip?: number;
						where?: Record<string, unknown>;
						orderBy?: Record<string, "asc" | "desc">;
				  }
		: // For scalars, just true
			true;
};

/** Infer selected type from selection */
export type InferSelected<
	E extends EntityDefinition,
	Sel extends Select<E, S>,
	S extends SchemaDefinition = never,
> = {
	[K in keyof Sel & keyof E]: Sel[K] extends true
		? InferFieldType<E[K], S>
		: Sel[K] extends { select: infer NestedSel }
			? // Nested selection
				E[K] extends HasManyType<infer Target>
				? Target extends keyof S
					? NestedSel extends Select<S[Target], S>
						? Array<InferSelected<S[Target], NestedSel, S>>
						: never
					: never
				: E[K] extends HasOneType<infer Target>
					? Target extends keyof S
						? NestedSel extends Select<S[Target], S>
							? InferSelected<S[Target], NestedSel, S> | null
							: never
						: never
					: E[K] extends BelongsToType<infer Target>
						? Target extends keyof S
							? NestedSel extends Select<S[Target], S>
								? InferSelected<S[Target], NestedSel, S>
								: never
							: never
						: never
			: // Relation without nested select returns full entity
				InferFieldType<E[K], S>;
};

// =============================================================================
// Schema Type Inference
// =============================================================================

/** Infer all entity types from schema */
export type InferSchemaEntities<S extends SchemaDefinition> = {
	[K in keyof S]: InferEntity<S[K], S>;
};

/** Get entity names from schema */
export type EntityNames<S extends SchemaDefinition> = keyof S & string;

/** Get entity type by name */
export type EntityType<S extends SchemaDefinition, Name extends keyof S> = InferEntity<
	S[Name],
	S
>;

// =============================================================================
// Input Types (for mutations)
// =============================================================================

/** Create input type (omit id, relations optional) */
export type CreateInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	[K in ScalarFields<E> as K extends "id" ? never : K]: InferScalarWithNullable<E[K]>;
} & {
	[K in RelationFields<E>]?: E[K] extends BelongsToType<string>
		? string // Foreign key ID
		: never;
};

/** Update input type (id required, all else optional) */
export type UpdateInput<E extends EntityDefinition, S extends SchemaDefinition = never> = {
	id: string;
} & Partial<CreateInput<E, S>>;

/** Delete input type */
export type DeleteInput = {
	id: string;
};

// =============================================================================
// Utility Types
// =============================================================================

/** Make specific keys required */
export type RequireKeys<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/** Make specific keys optional */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] };

/** Deep partial type */
export type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
		}
	: T;
