/**
 * @sylphx/lens-core - Two-Phase Schema Definition
 *
 * Drizzle-style API that allows direct entity references instead of strings.
 * This eliminates string-based relation targets and provides full type safety.
 *
 * @example
 * ```typescript
 * import { entity, createSchema, hasMany, belongsTo, t } from '@sylphx/lens-core';
 *
 * // Step 1: Define entities (without relations)
 * const User = defineEntity('User', {
 *   id: t.id(),
 *   name: t.string(),
 *   email: t.string(),
 * });
 *
 * const Post = defineEntity('Post', {
 *   id: t.id(),
 *   title: t.string(),
 *   content: t.string(),
 * });
 *
 * // Step 2: Create schema with type-safe relations
 * const schema = createSchema({
 *   User: User.with({
 *     posts: hasMany(Post),  // Direct reference!
 *   }),
 *   Post: Post.with({
 *     author: belongsTo(User),  // Direct reference!
 *   }),
 * });
 * ```
 */

import { Schema } from "./create";
import type { EntityDefinition } from "./types";
import { BelongsToType, HasManyType, HasOneType } from "./types";

// =============================================================================
// Field Accessor Helper (Proxy-based field extraction)
// =============================================================================

/**
 * Extract field name from accessor function using Proxy.
 * Used for type-safe relation definitions.
 *
 * @example
 * extractFieldName((e) => e.authorId) // Returns "authorId"
 */
function extractFieldName<T>(accessor: (entity: T) => unknown): string {
	let fieldName: string | undefined;
	const proxy = new Proxy(
		{},
		{
			get(_, key) {
				fieldName = String(key);
				return fieldName;
			},
		},
	);
	accessor(proxy as T);
	if (!fieldName) {
		throw new Error("Field accessor must access a property (e.g., e => e.authorId)");
	}
	return fieldName;
}

// =============================================================================
// Entity Definition Builder
// =============================================================================

/** Symbol to identify entity definitions */
const ENTITY_SYMBOL: unique symbol = Symbol("lens:entity");

/** Entity definition with name and fields */
export interface EntityDef<
	Name extends string = string,
	Fields extends EntityDefinition = EntityDefinition,
> {
	[ENTITY_SYMBOL]: true;
	/** Entity name (injected from export key if not provided) */
	_name?: Name;
	/** Entity fields (without relations) */
	readonly fields: Fields;
	/** Combine with additional fields (relations) */
	with<R extends EntityDefinition>(relations: R): Fields & R;
	/** Create hasOne relation to this entity */
	hasOne<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): HasOneType<Target["_name"] & string>;
	/** Create hasMany relation to this entity */
	hasMany<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): HasManyType<Target["_name"] & string>;
	/** Create belongsTo relation to this entity */
	belongsTo<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): BelongsToType<Target["_name"] & string>;
}

/**
 * Define an entity with its scalar fields.
 * Relations are added separately using `.with()` method.
 *
 * Name is optional - if not provided, it will be injected from the export key.
 *
 * @example
 * ```typescript
 * // Recommended: name derived from export key
 * const User = entity({
 *   id: t.id(),
 *   name: t.string(),
 * });
 *
 * // Explicit name (backward compatible)
 * const User = entity('User', {
 *   id: t.id(),
 *   name: t.string(),
 * });
 *
 * // Export - key becomes the name
 * export const entities = { User, Post };
 * ```
 */
export function defineEntity<Fields extends EntityDefinition>(
	fields: Fields,
): EntityDef<string, Fields>;
export function defineEntity<Name extends string, Fields extends EntityDefinition>(
	name: Name,
	fields: Fields,
): EntityDef<Name, Fields>;
export function defineEntity<Name extends string, Fields extends EntityDefinition>(
	nameOrFields: Name | Fields,
	maybeFields?: Fields,
): EntityDef<Name, Fields> | EntityDef<string, Fields> {
	// Overload 1: entity({ fields }) - no name
	if (typeof nameOrFields === "object" && maybeFields === undefined) {
		const fields = nameOrFields as Fields;
		return createEntityDef(undefined, fields);
	}

	// Overload 2: entity('Name', { fields }) - with name
	const name = nameOrFields as Name;
	const fields = maybeFields as Fields;
	return createEntityDef(name, fields);
}

function createEntityDef<Name extends string, Fields extends EntityDefinition>(
	name: Name | undefined,
	fields: Fields,
): EntityDef<Name, Fields> {
	return {
		[ENTITY_SYMBOL]: true,
		_name: name,
		fields,
		with<R extends EntityDefinition>(relations: R): Fields & R {
			return { ...this.fields, ...relations } as Fields & R;
		},
		hasOne<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): HasOneType<Target["_name"] & string> {
			return new HasOneType(target._name ?? "");
		},
		hasMany<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): HasManyType<Target["_name"] & string> {
			return new HasManyType(target._name ?? "");
		},
		belongsTo<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): BelongsToType<Target["_name"] & string> {
			return new BelongsToType(target._name ?? "");
		},
	} as EntityDef<Name, Fields>;
}

/**
 * Simplified alias for defineEntity.
 * Recommended API for new projects.
 *
 * @example
 * ```typescript
 * // Name derived from export key (recommended)
 * const User = entity({
 *   id: t.id(),
 *   name: t.string(),
 * });
 *
 * export const entities = { User };  // "User" becomes the entity name
 * ```
 */
export const entity: typeof defineEntity = defineEntity;

/** Check if value is an EntityDef */
export function isEntityDef(value: unknown): value is EntityDef<string, EntityDefinition> {
	return typeof value === "object" && value !== null && ENTITY_SYMBOL in value;
}

// =============================================================================
// Schema Creation from Entity Definitions
// =============================================================================

/** Schema definition using EntityDef or plain EntityDefinition */
type SchemaInput = Record<string, EntityDefinition>;

/**
 * Create a typed schema from entity definitions.
 *
 * @example
 * ```typescript
 * const schema = createSchema({
 *   User: User.with({
 *     posts: hasMany(Post),
 *   }),
 *   Post: Post.with({
 *     author: belongsTo(User),
 *   }),
 * });
 * ```
 */
export function createSchema<S extends SchemaInput>(definition: S): Schema<S> {
	return new Schema(definition);
}

// =============================================================================
// Convenience: Relation Helpers on Entity
// =============================================================================

/** Relation type with foreign key info */
export interface RelationTypeWithForeignKey {
	_type: string;
	target: string;
	foreignKey?: string;
}

/**
 * Create a hasMany relation to a target entity
 *
 * @param target - Target entity definition
 * @param fieldAccessor - Optional field accessor for foreign key (e.g., e => e.authorId)
 *
 * @example
 * ```typescript
 * // Without foreign key (backward compatible)
 * hasMany(Post)
 *
 * // With foreign key (new API)
 * hasMany(Post, e => e.authorId)
 * ```
 */
export function hasMany<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
	fieldAccessor?: (entity: { [K in keyof Target["fields"]]: K }) => keyof Target["fields"],
): HasManyType<Target["_name"] & string> & { foreignKey?: string } {
	const foreignKey = fieldAccessor
		? extractFieldName(fieldAccessor as (entity: unknown) => unknown)
		: undefined;
	return new HasManyType(target._name ?? "", foreignKey);
}

/**
 * Create a hasOne relation to a target entity
 *
 * @param target - Target entity definition
 * @param fieldAccessor - Optional field accessor for foreign key
 */
export function hasOne<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
	fieldAccessor?: (entity: { [K in keyof Target["fields"]]: K }) => keyof Target["fields"],
): HasOneType<Target["_name"] & string> & { foreignKey?: string } {
	const foreignKey = fieldAccessor
		? extractFieldName(fieldAccessor as (entity: unknown) => unknown)
		: undefined;
	return new HasOneType(target._name ?? "", foreignKey);
}

/**
 * Create a belongsTo relation to a target entity
 *
 * @param target - Target entity definition
 * @param fieldAccessor - Optional field accessor for foreign key
 */
export function belongsTo<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
	fieldAccessor?: (entity: { [K in keyof Target["fields"]]: K }) => keyof Target["fields"],
): BelongsToType<Target["_name"] & string> & { foreignKey?: string } {
	const foreignKey = fieldAccessor
		? extractFieldName(fieldAccessor as (entity: unknown) => unknown)
		: undefined;
	return new BelongsToType(target._name ?? "", foreignKey);
}

// =============================================================================
// Relation Definition (Separate from Schema)
// =============================================================================

/** Relation definition for an entity */
export interface RelationDef<
	E extends EntityDef<string, EntityDefinition>,
	R extends Record<string, RelationTypeWithForeignKey>,
> {
	entity: E;
	relations: R;
}

/**
 * Relation builder that provides type-safe foreign key accessors.
 * - many/one: FK accessor receives TARGET entity fields
 * - parent: FK accessor receives SOURCE entity fields
 *
 * Method names are shortened to avoid bundler name collisions with standalone functions.
 */
export interface RelationBuilder<Source extends EntityDef<string, EntityDefinition>> {
	/**
	 * Create a hasMany relation (one-to-many)
	 * FK is on the TARGET entity
	 * @param target - Target entity
	 * @param foreignKey - Accessor for FK field on TARGET entity
	 */
	many<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
		foreignKey?: (targetFields: { [K in keyof Target["fields"]]: K }) => keyof Target["fields"],
	): HasManyType<Target["_name"] & string> & { foreignKey?: string };

	/**
	 * Create a hasOne relation (one-to-one, FK on target)
	 * FK is on the TARGET entity
	 * @param target - Target entity
	 * @param foreignKey - Accessor for FK field on TARGET entity
	 */
	one<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
		foreignKey?: (targetFields: { [K in keyof Target["fields"]]: K }) => keyof Target["fields"],
	): HasOneType<Target["_name"] & string> & { foreignKey?: string };

	/**
	 * Create a belongsTo relation (many-to-one or one-to-one, FK on source)
	 * FK is on the SOURCE entity (this entity)
	 * @param target - Target entity
	 * @param foreignKey - Accessor for FK field on SOURCE entity
	 */
	parent<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
		foreignKey?: (sourceFields: { [K in keyof Source["fields"]]: K }) => keyof Source["fields"],
	): BelongsToType<Target["_name"] & string> & { foreignKey?: string };
}

/**
 * Create a relation builder for a source entity.
 * The builder provides type-safe FK accessors based on where the FK actually lives.
 */
function createRelationBuilder<Source extends EntityDef<string, EntityDefinition>>(
	_source: Source,
): RelationBuilder<Source> {
	return {
		many<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
			foreignKeyAccessor?: (
				targetFields: { [K in keyof Target["fields"]]: K },
			) => keyof Target["fields"],
		): HasManyType<Target["_name"] & string> & { foreignKey?: string } {
			const foreignKey = foreignKeyAccessor
				? extractFieldName(foreignKeyAccessor as (entity: unknown) => unknown)
				: undefined;
			return new HasManyType(target._name ?? "", foreignKey);
		},

		one<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
			foreignKeyAccessor?: (
				targetFields: { [K in keyof Target["fields"]]: K },
			) => keyof Target["fields"],
		): HasOneType<Target["_name"] & string> & { foreignKey?: string } {
			const foreignKey = foreignKeyAccessor
				? extractFieldName(foreignKeyAccessor as (entity: unknown) => unknown)
				: undefined;
			return new HasOneType(target._name ?? "", foreignKey);
		},

		parent<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
			foreignKeyAccessor?: (
				sourceFields: { [K in keyof Source["fields"]]: K },
			) => keyof Source["fields"],
		): BelongsToType<Target["_name"] & string> & { foreignKey?: string } {
			const foreignKey = foreignKeyAccessor
				? extractFieldName(foreignKeyAccessor as (entity: unknown) => unknown)
				: undefined;
			return new BelongsToType(target._name ?? "", foreignKey);
		},
	};
}

/**
 * Define relations for an entity separately from the entity definition.
 * This allows for a cleaner separation of concerns.
 *
 * @param entity - The entity to define relations for
 * @param relationsOrBuilder - Object of relation definitions OR builder function
 *
 * @example
 * ```typescript
 * // Builder function (recommended - fully type-safe)
 * const postRelations = relation(Post, (r) => ({
 *   author: r.parent(User, (post) => post.authorId),  // FK on Post ✅
 *   comments: r.many(Comment, (comment) => comment.postId),  // FK on Comment ✅
 * }));
 *
 * // Plain object (backward compatible)
 * const userRelations = relation(User, {
 *   posts: hasMany(Post, e => e.authorId),
 * });
 *
 * // Collect as array
 * const relations = [userRelations, postRelations];
 * ```
 */
export function relation<
	E extends EntityDef<string, EntityDefinition>,
	R extends Record<string, RelationTypeWithForeignKey>,
>(entity: E, relationsOrBuilder: R | ((builder: RelationBuilder<E>) => R)): RelationDef<E, R> {
	const relations =
		typeof relationsOrBuilder === "function"
			? relationsOrBuilder(createRelationBuilder(entity))
			: relationsOrBuilder;
	return {
		entity,
		relations,
	};
}
