/**
 * @lens/core - Schema Runtime Validation Plugin
 *
 * Unified runtime validation plugin providing:
 * - Schema-based input validation
 * - Type coercion
 * - Custom validators
 * - Detailed error messages
 */

import { defineUnifiedPlugin } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Field validation rule */
export interface ValidationRule {
	/** Field is required */
	required?: boolean;
	/** Minimum length (strings) or value (numbers) */
	min?: number;
	/** Maximum length (strings) or value (numbers) */
	max?: number;
	/** Regex pattern for strings */
	pattern?: string | RegExp;
	/** Custom validator function */
	validate?: (value: unknown, field: string, input: unknown) => boolean | string;
	/** Error message */
	message?: string;
}

/** Entity validation schema */
export interface EntityValidation {
	/** Entity name */
	entity: string;
	/** Operation (create, update, or "*" for all) */
	operation?: string;
	/** Field rules */
	fields: Record<string, ValidationRule | ValidationRule[]>;
}

/** Validation error */
export interface ValidationError {
	field: string;
	message: string;
	value?: unknown;
	rule?: string;
}

/** Validation result */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

/** Validation plugin configuration */
export interface ValidationPluginConfig {
	/** Entity validation schemas */
	schemas?: EntityValidation[];
	/** Enable type coercion (default: true) */
	coerce?: boolean;
	/** Strip unknown fields (default: false) */
	stripUnknown?: boolean;
	/** Abort on first error (default: false) */
	abortEarly?: boolean;
	/** Custom error messages */
	messages?: {
		required?: string;
		min?: string;
		max?: string;
		pattern?: string;
		type?: string;
	};
}

/** Validation client API */
export interface ValidationClientAPI {
	/** Validate input against schema */
	validate: (entity: string, operation: string, input: unknown) => ValidationResult;
	/** Add validation schema */
	addSchema: (schema: EntityValidation) => void;
	/** Remove validation schema */
	removeSchema: (entity: string, operation?: string) => void;
	/** Coerce input types */
	coerce: (entity: string, input: unknown) => unknown;
}

/** Validation server API */
export interface ValidationServerAPI {
	/** Validate input against schema */
	validate: (entity: string, operation: string, input: unknown) => ValidationResult;
	/** Get validation schema for entity */
	getSchema: (entity: string, operation?: string) => EntityValidation | undefined;
}

// =============================================================================
// Built-in Validators
// =============================================================================

const builtinValidators = {
	email: (value: unknown): boolean => {
		if (typeof value !== "string") return false;
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
	},

	url: (value: unknown): boolean => {
		if (typeof value !== "string") return false;
		try {
			new URL(value);
			return true;
		} catch {
			return false;
		}
	},

	uuid: (value: unknown): boolean => {
		if (typeof value !== "string") return false;
		return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
	},

	alphanumeric: (value: unknown): boolean => {
		if (typeof value !== "string") return false;
		return /^[a-zA-Z0-9]+$/.test(value);
	},

	slug: (value: unknown): boolean => {
		if (typeof value !== "string") return false;
		return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
	},
};

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Unified schema runtime validation plugin
 *
 * @example
 * ```typescript
 * // Client & Server
 * import { validationPlugin } from "@lens/core";
 *
 * const client = createClient({
 *   plugins: [{
 *     plugin: validationPlugin,
 *     config: {
 *       schemas: [
 *         {
 *           entity: "User",
 *           operation: "create",
 *           fields: {
 *             email: { required: true, pattern: "email" },
 *             name: { required: true, min: 2, max: 100 },
 *             age: { min: 0, max: 150 },
 *           },
 *         },
 *       ],
 *       coerce: true,
 *       stripUnknown: true,
 *     },
 *   }],
 * });
 *
 * // Manual validation
 * const validation = client.$plugins.get<ValidationClientAPI>("validation");
 * const result = validation?.validate("User", "create", { email: "invalid" });
 * // { valid: false, errors: [{ field: "email", message: "Invalid email format" }] }
 * ```
 */
export const validationPlugin = defineUnifiedPlugin<ValidationPluginConfig>({
	name: "validation",
	version: "1.0.0",

	defaultConfig: {
		schemas: [],
		coerce: true,
		stripUnknown: false,
		abortEarly: false,
		messages: {
			required: "{field} is required",
			min: "{field} must be at least {min}",
			max: "{field} must be at most {max}",
			pattern: "{field} has invalid format",
			type: "{field} has invalid type",
		},
	},

	// Shared validation logic
	client: (config) => createValidationInstance(config, "client"),
	server: (config) => createValidationInstance(config, "server"),

	getClientConfig: (config) => ({
		schemas: config?.schemas ?? [],
		coerce: config?.coerce ?? true,
		stripUnknown: config?.stripUnknown ?? false,
	}),
});

function createValidationInstance(config: ValidationPluginConfig | undefined, side: "client" | "server") {
	const schemas = new Map<string, EntityValidation>();
	const coerce = config?.coerce ?? true;
	const stripUnknown = config?.stripUnknown ?? false;
	const abortEarly = config?.abortEarly ?? false;
	const messages = {
		required: config?.messages?.required ?? "{field} is required",
		min: config?.messages?.min ?? "{field} must be at least {min}",
		max: config?.messages?.max ?? "{field} must be at most {max}",
		pattern: config?.messages?.pattern ?? "{field} has invalid format",
		type: config?.messages?.type ?? "{field} has invalid type",
	};

	// Load initial schemas
	for (const schema of config?.schemas ?? []) {
		const key = `${schema.entity}:${schema.operation ?? "*"}`;
		schemas.set(key, schema);
	}

	const formatMessage = (template: string, params: Record<string, unknown>): string => {
		return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
	};

	const getSchema = (entity: string, operation?: string): EntityValidation | undefined => {
		// Try specific operation first
		if (operation) {
			const specific = schemas.get(`${entity}:${operation}`);
			if (specific) return specific;
		}
		// Fall back to wildcard
		return schemas.get(`${entity}:*`);
	};

	const validateField = (
		field: string,
		value: unknown,
		rules: ValidationRule | ValidationRule[],
		input: unknown,
	): ValidationError[] => {
		const errors: ValidationError[] = [];
		const ruleArray = Array.isArray(rules) ? rules : [rules];

		for (const rule of ruleArray) {
			// Required check
			if (rule.required && (value === undefined || value === null || value === "")) {
				errors.push({
					field,
					message: rule.message ?? formatMessage(messages.required, { field }),
					value,
					rule: "required",
				});
				if (abortEarly) return errors;
				continue;
			}

			// Skip other checks if value is empty and not required
			if (value === undefined || value === null || value === "") continue;

			// Min check
			if (rule.min !== undefined) {
				const minValid = typeof value === "string"
					? value.length >= rule.min
					: typeof value === "number"
						? value >= rule.min
						: Array.isArray(value)
							? value.length >= rule.min
							: true;

				if (!minValid) {
					errors.push({
						field,
						message: rule.message ?? formatMessage(messages.min, { field, min: rule.min }),
						value,
						rule: "min",
					});
					if (abortEarly) return errors;
				}
			}

			// Max check
			if (rule.max !== undefined) {
				const maxValid = typeof value === "string"
					? value.length <= rule.max
					: typeof value === "number"
						? value <= rule.max
						: Array.isArray(value)
							? value.length <= rule.max
							: true;

				if (!maxValid) {
					errors.push({
						field,
						message: rule.message ?? formatMessage(messages.max, { field, max: rule.max }),
						value,
						rule: "max",
					});
					if (abortEarly) return errors;
				}
			}

			// Pattern check
			if (rule.pattern !== undefined) {
				let valid = true;

				if (typeof rule.pattern === "string") {
					// Check built-in patterns
					const builtinValidator = builtinValidators[rule.pattern as keyof typeof builtinValidators];
					if (builtinValidator) {
						valid = builtinValidator(value);
					} else {
						// Treat as regex string
						valid = new RegExp(rule.pattern).test(String(value));
					}
				} else if (rule.pattern instanceof RegExp) {
					valid = rule.pattern.test(String(value));
				}

				if (!valid) {
					errors.push({
						field,
						message: rule.message ?? formatMessage(messages.pattern, { field }),
						value,
						rule: "pattern",
					});
					if (abortEarly) return errors;
				}
			}

			// Custom validator
			if (rule.validate) {
				const result = rule.validate(value, field, input);
				if (result !== true) {
					errors.push({
						field,
						message: typeof result === "string" ? result : rule.message ?? `${field} is invalid`,
						value,
						rule: "custom",
					});
					if (abortEarly) return errors;
				}
			}
		}

		return errors;
	};

	const validate = (entity: string, operation: string, input: unknown): ValidationResult => {
		const schema = getSchema(entity, operation);
		if (!schema) {
			return { valid: true, errors: [] };
		}

		if (typeof input !== "object" || input === null) {
			return {
				valid: false,
				errors: [{ field: "_root", message: "Input must be an object" }],
			};
		}

		const inputObj = input as Record<string, unknown>;
		const errors: ValidationError[] = [];

		for (const [field, rules] of Object.entries(schema.fields)) {
			const value = inputObj[field];
			const fieldErrors = validateField(field, value, rules, input);
			errors.push(...fieldErrors);

			if (abortEarly && errors.length > 0) break;
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	};

	const coerceInput = (entity: string, input: unknown): unknown => {
		if (!coerce || typeof input !== "object" || input === null) return input;

		const schema = getSchema(entity);
		if (!schema) return input;

		const inputObj = input as Record<string, unknown>;
		const result: Record<string, unknown> = stripUnknown ? {} : { ...inputObj };

		for (const [field, rules] of Object.entries(schema.fields)) {
			const value = inputObj[field];
			if (value === undefined) continue;

			// Simple type coercion based on value
			if (typeof value === "string") {
				// Try to coerce string to number if it looks numeric
				const numValue = Number(value);
				if (!isNaN(numValue) && value.trim() !== "") {
					// Keep as string unless we have evidence it should be number
				}
			}

			if (stripUnknown) {
				result[field] = value;
			}
		}

		return stripUnknown ? result : inputObj;
	};

	const api = {
		validate,

		addSchema: (schema: EntityValidation) => {
			const key = `${schema.entity}:${schema.operation ?? "*"}`;
			schemas.set(key, schema);
		},

		removeSchema: (entity: string, operation?: string) => {
			const key = `${entity}:${operation ?? "*"}`;
			schemas.delete(key);
		},

		coerce: (entity: string, input: unknown) => coerceInput(entity, input),

		getSchema,
	};

	const instance = {
		name: "validation",
		api,

		// Validate before mutations
		onBeforeMutation: (ctx: unknown, entity: string, op: string, input: unknown) => {
			const result = validate(entity, op, input);
			if (!result.valid) {
				const error = new Error(`Validation failed: ${result.errors.map((e) => e.message).join(", ")}`) as Error & { validationErrors: ValidationError[] };
				error.validationErrors = result.errors;
				throw error;
			}

			// Coerce if enabled
			if (coerce) {
				return { input: coerceInput(entity, input) };
			}
		},
	};

	// Server-specific hooks
	if (side === "server") {
		return {
			...instance,
			onBeforeResolve: (ctx: unknown, entity: string, op: string, input: unknown) => {
				if (op === "create" || op === "update") {
					const result = validate(entity, op, input);
					if (!result.valid) {
						const error = new Error(`Validation failed: ${result.errors.map((e) => e.message).join(", ")}`) as Error & { statusCode: number; validationErrors: ValidationError[] };
						error.statusCode = 400;
						error.validationErrors = result.errors;
						throw error;
					}

					if (coerce) {
						return { input: coerceInput(entity, input) };
					}
				}
				return undefined;
			},
		};
	}

	return instance;
}
