/**
 * @sylphx/lens-signals - Store Types
 *
 * Type definitions for ReactiveStore.
 */

import type { PipelineResult } from "@sylphx/reify";

/** Entity state with metadata */
export interface EntityState<T = unknown> {
	/** The entity data */
	data: T | null;
	/** Loading state */
	loading: boolean;
	/** Error state */
	error: Error | null;
	/** Whether data is stale */
	stale: boolean;
	/** Subscription reference count */
	refCount: number;
	/** Cache timestamp */
	cachedAt?: number | undefined;
	/** Cache tags for invalidation */
	tags?: string[] | undefined;
}

/** Optimistic update entry */
export interface OptimisticEntry {
	id: string;
	entityName: string;
	entityId: string;
	type: "create" | "update" | "delete";
	originalData: unknown;
	optimisticData: unknown;
	timestamp: number;
}

/** Multi-entity optimistic transaction */
export interface OptimisticTransaction {
	id: string;
	/** Pipeline results from Reify execution */
	results: PipelineResult;
	/** Original data for each entity (for rollback) */
	originalData: Map<string, unknown>;
	timestamp: number;
}

/** Store configuration */
export interface StoreConfig {
	/** Enable optimistic updates (default: true) */
	optimistic?: boolean;
	/** Cache TTL in milliseconds (default: 5 minutes) */
	cacheTTL?: number;
	/** Maximum cache size (default: 1000) */
	maxCacheSize?: number;
	/** Cascade invalidation rules */
	cascadeRules?: CascadeRule[];
}

/** Cascade invalidation rule */
export interface CascadeRule {
	/** Source entity type that triggers invalidation */
	source: string;
	/** Operation types that trigger cascade (default: all) */
	operations?: ("create" | "update" | "delete")[];
	/** Target entities to invalidate */
	targets: string[];
}

/** Invalidation options */
export interface InvalidationOptions {
	/** Invalidate by tag */
	tags?: string[];
	/** Invalidate by entity type pattern (glob-like) */
	pattern?: string;
	/** Cascade to related entities */
	cascade?: boolean;
}
