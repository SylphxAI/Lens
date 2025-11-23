/**
 * Error System
 *
 * Unified error handling for Lens operations.
 * Provides structured, type-safe errors with error codes and context.
 *
 * @module @sylphx/lens-core/errors
 */

/**
 * Error codes for categorization and handling
 */
export enum LensErrorCode {
	// Validation errors (1xxx)
	VALIDATION_FAILED = "LENS_1001",
	INVALID_INPUT = "LENS_1002",
	SCHEMA_MISMATCH = "LENS_1003",

	// Query errors (2xxx)
	QUERY_FAILED = "LENS_2001",
	ENTITY_NOT_FOUND = "LENS_2002",
	INVALID_FILTER = "LENS_2003",
	INVALID_SELECTION = "LENS_2004",

	// Mutation errors (3xxx)
	MUTATION_FAILED = "LENS_3001",
	CREATE_FAILED = "LENS_3002",
	UPDATE_FAILED = "LENS_3003",
	DELETE_FAILED = "LENS_3004",
	OPTIMISTIC_UPDATE_CONFLICT = "LENS_3005",

	// Relationship errors (4xxx)
	RELATIONSHIP_NOT_FOUND = "LENS_4001",
	RELATIONSHIP_LOAD_FAILED = "LENS_4002",
	CIRCULAR_RELATIONSHIP = "LENS_4003",
	INVALID_RELATIONSHIP = "LENS_4004",

	// Resource errors (5xxx)
	RESOURCE_NOT_FOUND = "LENS_5001",
	RESOURCE_ALREADY_EXISTS = "LENS_5002",
	INVALID_RESOURCE_DEFINITION = "LENS_5003",

	// Context errors (6xxx)
	MISSING_CONTEXT = "LENS_6001",
	MISSING_DATABASE = "LENS_6002",
	MISSING_EVENT_STREAM = "LENS_6003",
	UNAUTHORIZED = "LENS_6004",
	FORBIDDEN = "LENS_6005",

	// DataLoader errors (7xxx)
	BATCH_LOAD_FAILED = "LENS_7001",
	CACHE_ERROR = "LENS_7002",

	// Event errors (8xxx)
	EVENT_PUBLISH_FAILED = "LENS_8001",
	SUBSCRIPTION_FAILED = "LENS_8002",

	// Internal errors (9xxx)
	INTERNAL_ERROR = "LENS_9001",
	NOT_IMPLEMENTED = "LENS_9002",
}

/**
 * Error metadata for additional context
 */
export interface LensErrorMeta {
	/** Resource name */
	resource?: string;
	/** Field name */
	field?: string;
	/** Relationship name */
	relationship?: string;
	/** Entity ID */
	entityId?: string;
	/** Original error */
	cause?: Error;
	/** Additional context */
	[key: string]: any;
}

/**
 * Base Lens error class
 *
 * All Lens errors extend this class for consistent error handling.
 */
export class LensError extends Error {
	/** Error code for categorization */
	public readonly code: LensErrorCode;
	/** Additional error metadata */
	public readonly meta: LensErrorMeta;
	/** Timestamp when error occurred */
	public readonly timestamp: number;

	constructor(message: string, code: LensErrorCode, meta: LensErrorMeta = {}) {
		super(message);
		this.name = "LensError";
		this.code = code;
		this.meta = meta;
		this.timestamp = Date.now();

		// Maintain proper stack trace in V8
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Convert error to JSON
	 */
	toJSON() {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			meta: this.meta,
			timestamp: this.timestamp,
			stack: this.stack,
		};
	}

	/**
	 * Check if error is a Lens error
	 */
	static isLensError(error: any): error is LensError {
		return error instanceof LensError;
	}
}

/**
 * Validation error
 *
 * Thrown when input validation fails.
 */
export class ValidationError extends LensError {
	constructor(message: string, meta: LensErrorMeta = {}) {
		super(message, LensErrorCode.VALIDATION_FAILED, meta);
		this.name = "ValidationError";
	}
}

/**
 * Query error
 *
 * Thrown when a query operation fails.
 */
export class QueryError extends LensError {
	constructor(message: string, code: LensErrorCode = LensErrorCode.QUERY_FAILED, meta: LensErrorMeta = {}) {
		super(message, code, meta);
		this.name = "QueryError";
	}
}

/**
 * Entity not found error
 *
 * Thrown when an entity cannot be found.
 */
export class EntityNotFoundError extends QueryError {
	constructor(resource: string, id: string, meta: LensErrorMeta = {}) {
		super(
			`Entity not found: ${resource}#${id}`,
			LensErrorCode.ENTITY_NOT_FOUND,
			{ ...meta, resource, entityId: id },
		);
		this.name = "EntityNotFoundError";
	}
}

/**
 * Mutation error
 *
 * Thrown when a mutation operation fails.
 */
export class MutationError extends LensError {
	constructor(message: string, code: LensErrorCode = LensErrorCode.MUTATION_FAILED, meta: LensErrorMeta = {}) {
		super(message, code, meta);
		this.name = "MutationError";
	}
}

/**
 * Relationship error
 *
 * Thrown when relationship loading fails.
 */
export class RelationshipError extends LensError {
	constructor(message: string, code: LensErrorCode = LensErrorCode.RELATIONSHIP_NOT_FOUND, meta: LensErrorMeta = {}) {
		super(message, code, meta);
		this.name = "RelationshipError";
	}
}

/**
 * Resource error
 *
 * Thrown when resource operations fail.
 */
export class ResourceError extends LensError {
	constructor(message: string, code: LensErrorCode = LensErrorCode.RESOURCE_NOT_FOUND, meta: LensErrorMeta = {}) {
		super(message, code, meta);
		this.name = "ResourceError";
	}
}

/**
 * Context error
 *
 * Thrown when required context is missing.
 */
export class ContextError extends LensError {
	constructor(message: string, code: LensErrorCode = LensErrorCode.MISSING_CONTEXT, meta: LensErrorMeta = {}) {
		super(message, code, meta);
		this.name = "ContextError";
	}
}

/**
 * DataLoader error
 *
 * Thrown when batch loading fails.
 */
export class DataLoaderError extends LensError {
	constructor(message: string, code: LensErrorCode = LensErrorCode.BATCH_LOAD_FAILED, meta: LensErrorMeta = {}) {
		super(message, code, meta);
		this.name = "DataLoaderError";
	}
}

/**
 * Event error
 *
 * Thrown when event operations fail.
 */
export class EventError extends LensError {
	constructor(message: string, code: LensErrorCode = LensErrorCode.EVENT_PUBLISH_FAILED, meta: LensErrorMeta = {}) {
		super(message, code, meta);
		this.name = "EventError";
	}
}

/**
 * Error helper utilities
 */
export const ErrorHelpers = {
	/**
	 * Wrap unknown error as LensError
	 */
	wrap(error: unknown, defaultCode: LensErrorCode = LensErrorCode.INTERNAL_ERROR): LensError {
		if (LensError.isLensError(error)) {
			return error;
		}

		if (error instanceof Error) {
			return new LensError(error.message, defaultCode, { cause: error });
		}

		return new LensError(String(error), defaultCode);
	},

	/**
	 * Create context error for missing database
	 */
	missingDatabase(resource: string): ContextError {
		return new ContextError(
			`Context with database required for ${resource} operations`,
			LensErrorCode.MISSING_DATABASE,
			{ resource },
		);
	},

	/**
	 * Create context error for missing event stream
	 */
	missingEventStream(resource: string, operation: string): ContextError {
		return new ContextError(
			`Context with event stream required for ${resource}.${operation}`,
			LensErrorCode.MISSING_EVENT_STREAM,
			{ resource },
		);
	},

	/**
	 * Create relationship not found error
	 */
	relationshipNotFound(resource: string, relationName: string): RelationshipError {
		return new RelationshipError(
			`Relationship '${relationName}' not found on resource '${resource}'`,
			LensErrorCode.RELATIONSHIP_NOT_FOUND,
			{ resource, relationship: relationName },
		);
	},
};
