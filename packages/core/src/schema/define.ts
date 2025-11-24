/**
 * @lens/core - Two-Phase Schema Definition
 *
 * Drizzle-style API that allows direct entity references instead of strings.
 * This eliminates string-based relation targets and provides full type safety.
 *
 * @example
 * ```typescript
 * import { defineEntity, createSchemaFrom, t } from '@lens/core';
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
 * const schema = createSchemaFrom({
 *   User: User.with({
 *     posts: User.hasMany(Post),  // Direct reference!
 *   }),
 *   Post: Post.with({
 *     author: Post.belongsTo(User),  // Direct reference!
 *   }),
 * });
 * ```
 */

import type { EntityDefinition, FieldDefinition } from "./types";
import { HasOneType, HasManyType, BelongsToType } from "./types";
import { Schema } from "./create";

// =============================================================================
// Entity Definition Builder
// =============================================================================

/** Symbol to identify entity definitions */
const ENTITY_SYMBOL = Symbol("lens:entity");

/** Entity definition with name and fields */
export interface EntityDef<Name extends string, Fields extends EntityDefinition> {
	[ENTITY_SYMBOL]: true;
	/** Entity name */
	readonly name: Name;
	/** Entity fields (without relations) */
	readonly fields: Fields;
	/** Combine with additional fields (relations) */
	with<R extends EntityDefinition>(relations: R): Fields & R;
	/** Create hasOne relation to this entity */
	hasOne<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): HasOneType<Target["name"]>;
	/** Create hasMany relation to this entity */
	hasMany<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): HasManyType<Target["name"]>;
	/** Create belongsTo relation to this entity */
	belongsTo<Target extends EntityDef<string, EntityDefinition>>(
		target: Target,
	): BelongsToType<Target["name"]>;
}

/**
 * Define an entity with its scalar fields.
 * Relations are added separately using `.with()` method.
 *
 * @param name - Entity name (used as key in schema)
 * @param fields - Entity fields (without relations)
 *
 * @example
 * ```typescript
 * const User = defineEntity('User', {
 *   id: t.id(),
 *   name: t.string(),
 *   email: t.string(),
 * });
 * ```
 */
export function defineEntity<Name extends string, Fields extends EntityDefinition>(
	name: Name,
	fields: Fields,
): EntityDef<Name, Fields> {
	return {
		[ENTITY_SYMBOL]: true,
		name,
		fields,
		with<R extends EntityDefinition>(relations: R): Fields & R {
			return { ...this.fields, ...relations } as Fields & R;
		},
		hasOne<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): HasOneType<Target["name"]> {
			return new HasOneType(target.name);
		},
		hasMany<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): HasManyType<Target["name"]> {
			return new HasManyType(target.name);
		},
		belongsTo<Target extends EntityDef<string, EntityDefinition>>(
			target: Target,
		): BelongsToType<Target["name"]> {
			return new BelongsToType(target.name);
		},
	};
}

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
 * This is an alternative to createSchema that works with defineEntity.
 *
 * @example
 * ```typescript
 * const schema = createSchemaFrom({
 *   User: User.with({
 *     posts: User.hasMany(Post),
 *   }),
 *   Post: Post.with({
 *     author: Post.belongsTo(User),
 *   }),
 * });
 * ```
 */
export function createSchemaFrom<S extends SchemaInput>(definition: S): Schema<S> {
	return new Schema(definition);
}

// =============================================================================
// Convenience: Relation Helpers on Entity
// =============================================================================

/**
 * Create a hasMany relation to a target entity
 *
 * @example
 * ```typescript
 * const schema = createSchemaFrom({
 *   User: User.with({
 *     posts: hasMany(Post),
 *   }),
 * });
 * ```
 */
export function hasMany<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
): HasManyType<Target["name"]> {
	return new HasManyType(target.name);
}

/**
 * Create a hasOne relation to a target entity
 */
export function hasOne<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
): HasOneType<Target["name"]> {
	return new HasOneType(target.name);
}

/**
 * Create a belongsTo relation to a target entity
 */
export function belongsTo<Target extends EntityDef<string, EntityDefinition>>(
	target: Target,
): BelongsToType<Target["name"]> {
	return new BelongsToType(target.name);
}
