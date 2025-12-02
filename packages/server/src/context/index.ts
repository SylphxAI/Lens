/**
 * @sylphx/lens-server - Context System
 *
 * AsyncLocalStorage-based context for implicit dependency injection.
 * Server-side implementation of the context pattern.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { ContextStore, ContextValue } from "@sylphx/lens-core";

// =============================================================================
// Global Context Store
// =============================================================================

/** Global context store - single AsyncLocalStorage instance */
const globalContextStore = new AsyncLocalStorage<ContextValue>();

// =============================================================================
// Context Functions
// =============================================================================

/**
 * Create a typed context reference.
 * This doesn't create a new AsyncLocalStorage, but provides type information.
 */
export function createContext<T extends ContextValue>(): ContextStore<T> {
	return globalContextStore as unknown as ContextStore<T>;
}

/**
 * Get the current context value.
 * Throws if called outside of runWithContext.
 */
export function useContext<T extends ContextValue = ContextValue>(): T {
	const ctx = globalContextStore.getStore();
	if (!ctx) {
		throw new Error(
			"useContext() called outside of context. " +
				"Make sure to wrap your code with runWithContext() or use explicit ctx parameter.",
		);
	}
	return ctx as T;
}

/**
 * Try to get the current context value.
 * Returns undefined if called outside of runWithContext.
 */
export function tryUseContext<T extends ContextValue = ContextValue>(): T | undefined {
	return globalContextStore.getStore() as T | undefined;
}

/**
 * Run a function with the given context.
 */
export function runWithContext<T extends ContextValue, R>(
	_context: ContextStore<T>,
	value: T,
	fn: () => R,
): R {
	return globalContextStore.run(value, fn);
}

/**
 * Run an async function with the given context.
 */
export async function runWithContextAsync<T extends ContextValue, R>(
	context: ContextStore<T>,
	value: T,
	fn: () => Promise<R>,
): Promise<R> {
	return runWithContext(context, value, fn);
}

/**
 * Check if currently running within a context.
 */
export function hasContext(): boolean {
	return globalContextStore.getStore() !== undefined;
}

/**
 * Extend the current context with additional values.
 */
export function extendContext<T extends ContextValue, E extends ContextValue>(
	current: T,
	extension: E,
): T & E {
	return { ...current, ...extension };
}
