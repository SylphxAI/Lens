/**
 * Optimistic Subscription Wrapper
 *
 * Merges server subscription state with optimistic updates.
 * Provides seamless integration between Lens subscriptions and OptimisticManager.
 */

import { Observable } from "rxjs";
import { combineLatest, merge } from "rxjs";
import { map, startWith, distinctUntilChanged } from "rxjs/operators";
import type { OptimisticManager } from "./manager.js";

/**
 * Options for optimistic subscription
 */
export interface OptimisticSubscriptionOptions {
	/** Entity type (e.g., 'Session', 'Message') */
	entityType: string;
	/** Extract entity ID from subscription data */
	getEntityId: (data: any) => string | number | null;
	/** Enable debug logging */
	debug?: boolean;
}

/**
 * Wrap a Lens subscription with optimistic updates
 *
 * Merges server subscription events with optimistic updates from OptimisticManager.
 * Automatically reconciles when server state arrives.
 *
 * @example
 * ```ts
 * const manager = new OptimisticManager();
 *
 * // Wrap subscription
 * const subscription = wrapSubscriptionWithOptimistic(
 *   lensClient.session.getById.subscribe({ sessionId: 'sess-1' }),
 *   manager,
 *   {
 *     entityType: 'Session',
 *     getEntityId: (data) => data?.id,
 *   }
 * );
 *
 * // Subscribe to merged state (server + optimistic)
 * subscription.subscribe({
 *   next: (session) => {
 *     console.log('Session (with optimistic):', session);
 *   }
 * });
 * ```
 */
export function wrapSubscriptionWithOptimistic<T>(
	serverSubscription: Observable<T>,
	manager: OptimisticManager,
	options: OptimisticSubscriptionOptions,
): Observable<T> {
	const { entityType, getEntityId, debug } = options;

	const log = (...args: any[]) => {
		if (debug) {
			console.log("[OptimisticSubscription]", ...args);
		}
	};

	// Track current entity ID
	let currentEntityId: string | number | null = null;

	// Handle server updates: merge into optimistic manager base
	const serverWithReconciliation = new Observable<T>((subscriber) => {
		const subscription = serverSubscription.subscribe({
			next: (data) => {
				const entityId = getEntityId(data);

				if (entityId != null) {
					currentEntityId = entityId;

					// Reconcile: merge server state into base
					// This preserves optimistic layers but updates the underlying base
					log("Server update received, reconciling", entityType, entityId);
					manager.mergeBase(entityType, entityId, data as any);

					// Emit merged state (base + optimistic)
					const merged = manager.get(entityType, entityId);
					subscriber.next(merged as T);
				} else {
					// No entity ID, just pass through
					subscriber.next(data);
				}
			},
			error: (error) => subscriber.error(error),
			complete: () => subscriber.complete(),
		});

		return () => subscription.unsubscribe();
	});

	return serverWithReconciliation;
}

/**
 * Create a subscription that merges server state with optimistic updates
 *
 * Alternative approach: combines server subscription + optimistic manager subscription.
 * Emits whenever either source emits.
 *
 * @example
 * ```ts
 * const merged = createMergedSubscription(
 *   lensClient.session.getById.subscribe({ sessionId: 'sess-1' }),
 *   manager,
 *   {
 *     entityType: 'Session',
 *     entityId: 'sess-1',
 *   }
 * );
 *
 * merged.subscribe({
 *   next: (session) => console.log(session)
 * });
 * ```
 */
export function createMergedSubscription<T>(
	serverSubscription: Observable<T>,
	manager: OptimisticManager,
	options: {
		entityType: string;
		entityId: string | number;
		debug?: boolean;
	},
): Observable<T> {
	const { entityType, entityId, debug } = options;

	const log = (...args: any[]) => {
		if (debug) {
			console.log("[MergedSubscription]", ...args);
		}
	};

	// Server updates → update base state
	const serverUpdates = new Observable<void>((subscriber) => {
		const subscription = serverSubscription.subscribe({
			next: (data) => {
				log("Server update", data);
				manager.mergeBase(entityType, entityId, data as any);
				subscriber.next(); // Trigger merge
			},
			error: (error) => subscriber.error(error),
			complete: () => subscriber.complete(),
		});

		return () => subscription.unsubscribe();
	});

	// Optimistic updates → from manager
	const optimisticUpdates = manager.subscribe(entityType, entityId).pipe(
		map(() => {
			log("Optimistic update");
			return; // Just trigger, actual data comes from merge
		}),
	);

	// Combine both sources, emit merged state
	return merge(serverUpdates, optimisticUpdates.pipe(startWith(undefined))).pipe(
		map(() => {
			const merged = manager.get(entityType, entityId);
			log("Merged state", merged);
			return merged as T;
		}),
		distinctUntilChanged((a, b) => {
			// Deep equality check (simple version)
			return JSON.stringify(a) === JSON.stringify(b);
		}),
	);
}

/**
 * Subscription helper for React hooks
 *
 * Simplifies integration with React hooks by providing a clean API.
 *
 * @example
 * ```tsx
 * const session = useOptimisticSubscription(
 *   () => lensClient.session.getById.subscribe({ sessionId }),
 *   manager,
 *   {
 *     entityType: 'Session',
 *     entityId: sessionId,
 *   }
 * );
 * ```
 */
export interface UseOptimisticSubscriptionOptions {
	/** Entity type */
	entityType: string;
	/** Entity ID */
	entityId: string | number;
	/** Enable debug logging */
	debug?: boolean;
	/** Called when subscription updates */
	onUpdate?: (data: any) => void;
}

/**
 * Helper to create optimistic subscription for use in React hooks
 *
 * This is a convenience wrapper that can be used with React's useEffect.
 *
 * @example
 * ```tsx
 * useEffect(() => {
 *   const subscription = subscribeWithOptimistic(
 *     lensClient.session.getById.subscribe({ sessionId }),
 *     manager,
 *     {
 *       entityType: 'Session',
 *       entityId: sessionId,
 *       onUpdate: (session) => {
 *         setSession(session);
 *       }
 *     }
 *   );
 *
 *   return () => subscription.unsubscribe();
 * }, [sessionId]);
 * ```
 */
export function subscribeWithOptimistic<T>(
	serverSubscription: Observable<T>,
	manager: OptimisticManager,
	options: UseOptimisticSubscriptionOptions,
): { unsubscribe: () => void } {
	const { entityType, entityId, onUpdate } = options;

	const merged = createMergedSubscription(serverSubscription, manager, {
		entityType,
		entityId,
		debug: options.debug,
	});

	const subscription = merged.subscribe({
		next: (data) => {
			onUpdate?.(data);
		},
		error: (error) => {
			console.error("[subscribeWithOptimistic] Error:", error);
		},
	});

	return subscription;
}
