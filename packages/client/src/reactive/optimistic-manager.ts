/**
 * @lens/client - Optimistic Update Manager
 *
 * Manages optimistic updates for EntitySignals with rollback capability.
 * Works with the reactive subscription system for fine-grained updates.
 */

import { EntitySignal } from "./entity-signal";
import { SubscriptionManager } from "./subscription-manager";

// =============================================================================
// Types
// =============================================================================

/** Optimistic update entry */
export interface OptimisticEntry<T extends Record<string, unknown> = Record<string, unknown>> {
	/** Unique ID for this optimistic update */
	id: string;
	/** Entity type name */
	entityName: string;
	/** Entity ID */
	entityId: string;
	/** Type of operation */
	type: "create" | "update" | "delete";
	/** Original data before optimistic update (for rollback) */
	originalData: T | null;
	/** Optimistic data applied */
	optimisticData: Partial<T>;
	/** Timestamp when created */
	timestamp: number;
	/** Reference to EntitySignal for direct updates */
	signal: EntitySignal<T> | null;
}

/** Optimistic manager configuration */
export interface OptimisticManagerConfig {
	/** Enable optimistic updates (default: true) */
	enabled?: boolean;
	/** Timeout for pending updates in ms (default: 30000) */
	timeout?: number;
}

// =============================================================================
// OptimisticManager
// =============================================================================

/**
 * Manages optimistic updates with EntitySignal integration.
 *
 * @example
 * ```typescript
 * const manager = new OptimisticManager(subscriptionManager);
 *
 * // Apply optimistic update
 * const optId = manager.applyOptimistic("User", "123", "update", { name: "New Name" });
 *
 * try {
 *   const result = await api.updateUser("123", { name: "New Name" });
 *   manager.confirm(optId, result);
 * } catch (error) {
 *   manager.rollback(optId);
 *   throw error;
 * }
 * ```
 */
export class OptimisticManager {
	/** Pending optimistic updates */
	private pendingUpdates = new Map<string, OptimisticEntry>();

	/** Configuration */
	private config: Required<OptimisticManagerConfig>;

	/** Subscription manager reference */
	private subscriptions: SubscriptionManager;

	/** Timeout timers for auto-rollback */
	private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(subscriptions: SubscriptionManager, config: OptimisticManagerConfig = {}) {
		this.subscriptions = subscriptions;
		this.config = {
			enabled: config.enabled ?? true,
			timeout: config.timeout ?? 30000,
		};
	}

	// ===========================================================================
	// Core Operations
	// ===========================================================================

	/**
	 * Apply optimistic update to EntitySignal
	 *
	 * @returns Optimistic update ID for confirmation/rollback
	 */
	applyOptimistic<T extends Record<string, unknown>>(
		entityName: string,
		entityId: string,
		type: "create" | "update" | "delete",
		data: Partial<T>,
	): string {
		if (!this.config.enabled) {
			return "";
		}

		const optId = this.generateId();

		// Get or create signal
		let signal = this.subscriptions.getSignal<T>(entityName, entityId);
		let originalData: T | null = null;

		if (type === "create") {
			// For create, make a new subscription with optimistic data
			if (!signal) {
				const sub = this.subscriptions.getOrCreateSubscription<T>(
					entityName,
					entityId,
					data as T,
				);
				signal = sub.signal;
			}
			originalData = null;
		} else if (signal) {
			// Capture original data for rollback
			originalData = signal.value.value;
		}

		// Apply optimistic update
		if (signal) {
			switch (type) {
				case "create":
				case "update":
					// Apply partial update to fields
					signal.setFields(data as T);
					break;

				case "delete":
					// Mark signal as "deleted" by setting special state
					// We don't remove the signal yet - wait for confirmation
					signal.setFields({ __deleted: true } as unknown as T);
					break;
			}
		}

		// Store entry for rollback
		const entry: OptimisticEntry<T> = {
			id: optId,
			entityName,
			entityId,
			type,
			originalData,
			optimisticData: data,
			timestamp: Date.now(),
			signal,
		};

		this.pendingUpdates.set(optId, entry as OptimisticEntry);

		// Set timeout for auto-rollback
		this.setTimeoutRollback(optId);

		return optId;
	}

	/**
	 * Confirm optimistic update with server response
	 */
	confirm<T extends Record<string, unknown>>(optId: string, serverData?: T): void {
		const entry = this.pendingUpdates.get(optId) as OptimisticEntry<T> | undefined;
		if (!entry) return;

		// Clear timeout
		this.clearTimeout(optId);

		// Update signal with server data if provided
		if (serverData !== undefined && entry.signal && entry.type !== "delete") {
			entry.signal.setFields(serverData);
		}

		// For delete, actually remove the subscription
		if (entry.type === "delete") {
			this.subscriptions.unsubscribeAll(entry.entityName, entry.entityId);
		}

		// Remove from pending
		this.pendingUpdates.delete(optId);
	}

	/**
	 * Rollback optimistic update
	 */
	rollback(optId: string): void {
		const entry = this.pendingUpdates.get(optId);
		if (!entry) return;

		// Clear timeout
		this.clearTimeout(optId);

		// Restore original data
		if (entry.signal) {
			switch (entry.type) {
				case "create":
					// Remove the optimistically created entity
					this.subscriptions.unsubscribeAll(entry.entityName, entry.entityId);
					break;

				case "update":
					// Restore original data
					if (entry.originalData !== null) {
						entry.signal.setFields(entry.originalData);
					}
					break;

				case "delete":
					// Restore original data and remove __deleted marker
					if (entry.originalData !== null) {
						entry.signal.setFields(entry.originalData);
					}
					entry.signal.removeField("__deleted");
					break;
			}
		}

		// Remove from pending
		this.pendingUpdates.delete(optId);
	}

	// ===========================================================================
	// Batch Operations
	// ===========================================================================

	/**
	 * Apply multiple optimistic updates atomically
	 */
	applyBatch<T extends Record<string, unknown>>(
		updates: Array<{
			entityName: string;
			entityId: string;
			type: "create" | "update" | "delete";
			data: Partial<T>;
		}>,
	): string[] {
		return updates.map((u) =>
			this.applyOptimistic(u.entityName, u.entityId, u.type, u.data),
		);
	}

	/**
	 * Confirm multiple optimistic updates
	 */
	confirmBatch(optIds: string[], serverDataMap?: Map<string, unknown>): void {
		for (const optId of optIds) {
			const entry = this.pendingUpdates.get(optId);
			if (entry) {
				const serverData = serverDataMap?.get(`${entry.entityName}:${entry.entityId}`);
				this.confirm(optId, serverData as Record<string, unknown>);
			}
		}
	}

	/**
	 * Rollback multiple optimistic updates
	 */
	rollbackBatch(optIds: string[]): void {
		for (const optId of optIds) {
			this.rollback(optId);
		}
	}

	// ===========================================================================
	// State Queries
	// ===========================================================================

	/**
	 * Get all pending optimistic updates
	 */
	getPending(): OptimisticEntry[] {
		return Array.from(this.pendingUpdates.values());
	}

	/**
	 * Get pending updates for specific entity
	 */
	getPendingForEntity(entityName: string, entityId: string): OptimisticEntry[] {
		return this.getPending().filter(
			(e) => e.entityName === entityName && e.entityId === entityId,
		);
	}

	/**
	 * Check if entity has pending optimistic updates
	 */
	hasPending(entityName: string, entityId: string): boolean {
		return this.getPendingForEntity(entityName, entityId).length > 0;
	}

	/**
	 * Get count of pending updates
	 */
	getPendingCount(): number {
		return this.pendingUpdates.size;
	}

	/**
	 * Clear all pending updates (rollback all)
	 */
	clear(): void {
		for (const optId of this.pendingUpdates.keys()) {
			this.rollback(optId);
		}
	}

	// ===========================================================================
	// Configuration
	// ===========================================================================

	/**
	 * Enable/disable optimistic updates
	 */
	setEnabled(enabled: boolean): void {
		this.config.enabled = enabled;
	}

	/**
	 * Check if optimistic updates are enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}

	// ===========================================================================
	// Private Helpers
	// ===========================================================================

	private generateId(): string {
		return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
	}

	private setTimeoutRollback(optId: string): void {
		const timer = setTimeout(() => {
			const entry = this.pendingUpdates.get(optId);
			if (entry) {
				console.warn(
					`Optimistic update ${optId} timed out after ${this.config.timeout}ms, rolling back`,
				);
				this.rollback(optId);
			}
		}, this.config.timeout);

		this.timeoutTimers.set(optId, timer);
	}

	private clearTimeout(optId: string): void {
		const timer = this.timeoutTimers.get(optId);
		if (timer) {
			clearTimeout(timer);
			this.timeoutTimers.delete(optId);
		}
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create optimistic manager
 */
export function createOptimisticManager(
	subscriptions: SubscriptionManager,
	config?: OptimisticManagerConfig,
): OptimisticManager {
	return new OptimisticManager(subscriptions, config);
}
