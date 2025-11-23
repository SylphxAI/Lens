/**
 * Update Strategy Integration
 *
 * Automatically selects and applies update strategies based on field types.
 * Integrates Delta/Patch/Value strategies into Resource API.
 *
 * @module @sylphx/lens-core/resource
 */

import type { ZodType } from "zod";
import type { Resource, InferEntity } from "./types";
import { AutoStrategy } from "../update-strategy/auto";
import { DeltaStrategy } from "../update-strategy/delta";
import { PatchStrategy } from "../update-strategy/patch";
import { ValueStrategy } from "../update-strategy/value";
import type { UpdateStrategy } from "../update-strategy/types";

/**
 * Strategy selection configuration
 */
export interface StrategyConfig {
	/**
	 * Strategy selection mode
	 * - 'auto': Automatically select based on field types
	 * - 'delta': Use Delta strategy for all string fields
	 * - 'patch': Use Patch strategy for all object fields
	 * - 'value': Use Value strategy for all fields
	 */
	mode: "auto" | "delta" | "patch" | "value";

	/**
	 * Custom strategy mapping per field
	 */
	fieldStrategies?: Record<string, "delta" | "patch" | "value">;

	/**
	 * Streaming fields configuration
	 * Fields that emit start/delta/end events
	 */
	streamingFields?: string[];
}

/**
 * Default strategy config
 */
export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
	mode: "auto",
	fieldStrategies: {},
	streamingFields: [],
};

/**
 * Update strategy selector
 *
 * Analyzes resource fields and selects optimal strategy for each field.
 */
export class UpdateStrategySelector {
	/**
	 * Select strategy for a field based on its Zod type
	 */
	static selectStrategyForField(
		fieldName: string,
		zodType: ZodType,
		config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
	): UpdateStrategy {
		// Custom strategy override
		if (config.fieldStrategies?.[fieldName]) {
			return this.createStrategy(config.fieldStrategies[fieldName]);
		}

		// Auto selection based on Zod type
		if (config.mode === "auto") {
			const typeName = (zodType as any)._def.typeName;

			switch (typeName) {
				case "ZodString":
					// String fields use Delta strategy (optimal for streaming)
					return new DeltaStrategy();

				case "ZodObject":
					// Object fields use Patch strategy (optimal for partial updates)
					return new PatchStrategy();

				case "ZodArray":
					// Array fields use Patch strategy
					return new PatchStrategy();

				case "ZodNumber":
				case "ZodBoolean":
				case "ZodEnum":
				case "ZodDate":
					// Primitive fields use Value strategy
					return new ValueStrategy();

				default:
					// Unknown types default to Value strategy
					return new ValueStrategy();
			}
		}

		// Manual mode selection
		return this.createStrategy(config.mode);
	}

	/**
	 * Create strategy instance from mode
	 */
	private static createStrategy(mode: string): UpdateStrategy {
		switch (mode) {
			case "delta":
				return new DeltaStrategy();
			case "patch":
				return new PatchStrategy();
			case "value":
				return new ValueStrategy();
			case "auto":
				return new AutoStrategy();
			default:
				return new ValueStrategy();
		}
	}

	/**
	 * Select strategies for all fields in a resource
	 */
	static selectStrategiesForResource(
		resource: Resource,
		config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
	): Map<string, UpdateStrategy> {
		const strategies = new Map<string, UpdateStrategy>();
		const fields = resource.definition.fields;

		// Get field names from Zod schema
		const fieldNames = this.extractFieldNames(fields);

		for (const fieldName of fieldNames) {
			const fieldSchema = this.getFieldSchema(fields, fieldName);
			if (fieldSchema) {
				const strategy = this.selectStrategyForField(
					fieldName,
					fieldSchema,
					config,
				);
				strategies.set(fieldName, strategy);
			}
		}

		return strategies;
	}

	/**
	 * Extract field names from Zod schema
	 */
	private static extractFieldNames(schema: ZodType): string[] {
		const def = (schema as any)._def;

		if (def.typeName === "ZodObject") {
			return Object.keys(def.shape());
		}

		return [];
	}

	/**
	 * Get field schema from Zod object schema
	 */
	private static getFieldSchema(schema: ZodType, fieldName: string): ZodType | null {
		const def = (schema as any)._def;

		if (def.typeName === "ZodObject") {
			const shape = def.shape();
			return shape[fieldName] || null;
		}

		return null;
	}
}

/**
 * Apply update strategy to compute optimistic value
 */
export function applyUpdateStrategy<T>(
	currentValue: T,
	mutation: Partial<T>,
	fieldName: string,
	strategy: UpdateStrategy,
): T {
	// Extract field values
	const current = (currentValue as any)[fieldName];
	const next = (mutation as any)[fieldName];

	if (next === undefined) {
		// No update for this field
		return currentValue;
	}

	// Create optimistic value - just apply the mutation directly
	// (optimistic means assuming the mutation succeeds)
	return {
		...currentValue,
		[fieldName]: next,
	};
}

/**
 * Apply multiple strategies to entire entity
 */
export function applyUpdateStrategies<T>(
	currentValue: T,
	mutation: Partial<T>,
	strategies: Map<string, UpdateStrategy>,
): T {
	let result = currentValue;

	for (const [fieldName, strategy] of strategies.entries()) {
		result = applyUpdateStrategy(result, mutation, fieldName, strategy);
	}

	return result;
}

/**
 * Create optimistic update using strategies
 *
 * This is the main function used by mutations and subscriptions.
 */
export function createOptimisticUpdate<T>(
	resource: Resource,
	currentValue: T,
	mutation: Partial<T>,
	config?: StrategyConfig,
): T {
	const strategies = UpdateStrategySelector.selectStrategiesForResource(
		resource,
		config,
	);

	return applyUpdateStrategies(currentValue, mutation, strategies);
}

/**
 * Encode update for transmission
 *
 * Converts mutation to minimal payload using strategies.
 */
export function encodeUpdate<T>(
	resource: Resource,
	oldValue: T,
	newValue: T,
	config?: StrategyConfig,
): Record<string, any> {
	const strategies = UpdateStrategySelector.selectStrategiesForResource(
		resource,
		config,
	);

	const encoded: Record<string, any> = {};

	for (const [fieldName, strategy] of strategies.entries()) {
		const oldFieldValue = (oldValue as any)[fieldName];
		const newFieldValue = (newValue as any)[fieldName];

		// Only encode changed fields
		if (oldFieldValue !== newFieldValue) {
			const payload = strategy.encode(oldFieldValue, newFieldValue);
			encoded[fieldName] = payload.data;
		}
	}

	return encoded;
}

/**
 * Decode update from transmission
 *
 * Converts minimal payload back to full mutation using strategies.
 */
export function decodeUpdate<T>(
	resource: Resource,
	currentValue: T,
	encoded: Record<string, any>,
	config?: StrategyConfig,
): Partial<T> {
	const strategies = UpdateStrategySelector.selectStrategiesForResource(
		resource,
		config,
	);

	const decoded: any = {};

	for (const [fieldName, encodedValue] of Object.entries(encoded)) {
		const strategy = strategies.get(fieldName);
		if (strategy) {
			const currentFieldValue = (currentValue as any)[fieldName];
			const payload = { mode: strategy.mode, data: encodedValue };
			decoded[fieldName] = strategy.decode(currentFieldValue, payload);
		} else {
			// No strategy, use value as-is
			decoded[fieldName] = encodedValue;
		}
	}

	return decoded;
}

/**
 * Get strategy metadata for a resource
 *
 * Returns information about which strategy is used for each field.
 * Useful for debugging and documentation.
 */
export function getStrategyMetadata(
	resource: Resource,
	config?: StrategyConfig,
): Record<string, { strategy: string; streaming: boolean }> {
	const strategies = UpdateStrategySelector.selectStrategiesForResource(
		resource,
		config,
	);

	const metadata: Record<string, { strategy: string; streaming: boolean }> = {};
	const streamingFields = config?.streamingFields || [];

	for (const [fieldName, strategy] of strategies.entries()) {
		metadata[fieldName] = {
			strategy: strategy.constructor.name.replace("Strategy", "").toLowerCase(),
			streaming: streamingFields.includes(fieldName),
		};
	}

	return metadata;
}
