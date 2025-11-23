/**
 * Relationship Helper Functions
 *
 * Declarative helpers for defining relationships between resources.
 *
 * @module @sylphx/lens-core/resource/relationships
 */

import type {
	HasManyRelationship,
	BelongsToRelationship,
	HasOneRelationship,
	ManyToManyRelationship,
} from "./types";

/**
 * Options for hasMany relationship
 */
export interface HasManyOptions {
	/** Foreign key field in target resource */
	foreignKey: string;

	/** Optional ordering for related entities */
	orderBy?: Record<string, "asc" | "desc">;
}

/**
 * Options for belongsTo relationship
 */
export interface BelongsToOptions {
	/** Foreign key field in current resource */
	foreignKey: string;
}

/**
 * Options for hasOne relationship
 */
export interface HasOneOptions {
	/** Foreign key field in target resource */
	foreignKey: string;
}

/**
 * Options for manyToMany relationship
 */
export interface ManyToManyOptions {
	/** Join table name */
	through: string;

	/** Foreign key field in join table for current resource */
	foreignKey: string;

	/** Foreign key field in join table for target resource */
	targetForeignKey: string;
}

/**
 * Define a one-to-many relationship
 *
 * @example
 * ```ts
 * relationships: {
 *   steps: hasMany('step', {
 *     foreignKey: 'message_id',
 *     orderBy: { created_at: 'asc' }
 *   })
 * }
 * ```
 *
 * @param target - Target resource name
 * @param options - Relationship options
 * @returns HasManyRelationship definition
 */
export function hasMany(target: string, options: HasManyOptions): HasManyRelationship {
	return {
		type: "hasMany",
		target,
		foreignKey: options.foreignKey,
		orderBy: options.orderBy,
	};
}

/**
 * Define a many-to-one relationship
 *
 * @example
 * ```ts
 * relationships: {
 *   session: belongsTo('session', {
 *     foreignKey: 'session_id'
 *   })
 * }
 * ```
 *
 * @param target - Target resource name
 * @param options - Relationship options
 * @returns BelongsToRelationship definition
 */
export function belongsTo(target: string, options: BelongsToOptions): BelongsToRelationship {
	return {
		type: "belongsTo",
		target,
		foreignKey: options.foreignKey,
	};
}

/**
 * Define a one-to-one relationship
 *
 * @example
 * ```ts
 * relationships: {
 *   profile: hasOne('profile', {
 *     foreignKey: 'user_id'
 *   })
 * }
 * ```
 *
 * @param target - Target resource name
 * @param options - Relationship options
 * @returns HasOneRelationship definition
 */
export function hasOne(target: string, options: HasOneOptions): HasOneRelationship {
	return {
		type: "hasOne",
		target,
		foreignKey: options.foreignKey,
	};
}

/**
 * Define a many-to-many relationship
 *
 * @example
 * ```ts
 * relationships: {
 *   tags: manyToMany('tag', {
 *     through: 'message_tags',
 *     foreignKey: 'message_id',
 *     targetForeignKey: 'tag_id'
 *   })
 * }
 * ```
 *
 * @param target - Target resource name
 * @param options - Relationship options
 * @returns ManyToManyRelationship definition
 */
export function manyToMany(target: string, options: ManyToManyOptions): ManyToManyRelationship {
	return {
		type: "manyToMany",
		target,
		foreignKey: options.foreignKey,
		through: options.through,
		targetForeignKey: options.targetForeignKey,
	};
}
