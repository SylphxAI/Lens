/**
 * @lens/server - Plugin Manager
 *
 * Manages server-side plugin lifecycle and hooks.
 */

import type {
	UnifiedPlugin,
	ServerPluginInstance,
	ServerPluginContext,
	ServerPluginHooks,
	PluginHandshakeInfo,
} from "@lens/core";

// =============================================================================
// Types
// =============================================================================

/** Plugin registration entry */
export interface ServerPluginEntry<T = unknown> {
	plugin: UnifiedPlugin<T>;
	config?: T;
}

/** Server plugin manager */
export interface ServerPluginManager {
	/** Register a plugin */
	register<T>(plugin: UnifiedPlugin<T>, config?: T): void;
	/** Get plugin API */
	get<T = unknown>(name: string): T | undefined;
	/** Check if plugin is registered */
	has(name: string): boolean;
	/** List all registered plugins */
	list(): string[];
	/** Initialize all plugins */
	init(): Promise<void>;
	/** Destroy all plugins */
	destroy(): Promise<void>;
	/** Get handshake info for client */
	getHandshakeInfo(): PluginHandshakeInfo[];
	/** Call hook on all plugins */
	callHook<K extends keyof ServerPluginHooks>(
		hook: K,
		...args: Parameters<NonNullable<ServerPluginHooks[K]>>
	): ReturnType<NonNullable<ServerPluginHooks[K]>> | void;
}

// =============================================================================
// Implementation
// =============================================================================

interface RegisteredPlugin {
	meta: UnifiedPlugin;
	config: unknown;
	instance: ServerPluginInstance | null;
}

/**
 * Create server plugin manager
 */
export function createServerPluginManager(): ServerPluginManager {
	const registeredPlugins = new Map<string, RegisteredPlugin>();
	let initialized = false;

	return {
		register<T>(plugin: UnifiedPlugin<T>, config?: T): void {
			if (registeredPlugins.has(plugin.name)) {
				console.warn(`Plugin "${plugin.name}" is already registered`);
				return;
			}

			// Check dependencies
			if (plugin.dependencies) {
				for (const dep of plugin.dependencies) {
					if (!registeredPlugins.has(dep)) {
						throw new Error(
							`Plugin "${plugin.name}" requires "${dep}" but it's not registered`,
						);
					}
				}
			}

			// Merge config with defaults
			const mergedConfig = {
				...plugin.defaultConfig,
				...config,
			} as T;

			registeredPlugins.set(plugin.name, {
				meta: plugin,
				config: mergedConfig,
				instance: null,
			});

			// If already initialized, create instance now
			if (initialized && plugin.server) {
				const instance = plugin.server(mergedConfig);
				registeredPlugins.get(plugin.name)!.instance = instance;
				instance.onInit?.();
			}
		},

		get<T = unknown>(name: string): T | undefined {
			const registered = registeredPlugins.get(name);
			return registered?.instance?.api as T | undefined;
		},

		has(name: string): boolean {
			return registeredPlugins.has(name);
		},

		list(): string[] {
			return Array.from(registeredPlugins.keys());
		},

		async init(): Promise<void> {
			if (initialized) return;

			// Create instances and call onInit
			for (const [name, registered] of registeredPlugins) {
				if (registered.meta.server) {
					const instance = registered.meta.server(registered.config);
					registered.instance = instance;
					await instance.onInit?.();
				}
			}

			initialized = true;
		},

		async destroy(): Promise<void> {
			// Call onShutdown on all plugins
			for (const registered of registeredPlugins.values()) {
				if (registered.instance) {
					await registered.instance.onShutdown?.();
					registered.instance.destroy?.();
				}
			}

			registeredPlugins.clear();
			initialized = false;
		},

		getHandshakeInfo(): PluginHandshakeInfo[] {
			const info: PluginHandshakeInfo[] = [];

			for (const [name, registered] of registeredPlugins) {
				// Only include plugins that have a client part
				if (registered.meta.client) {
					info.push({
						name,
						version: registered.meta.version,
						config: registered.meta.getClientConfig?.(registered.config) ?? {},
					});
				}
			}

			return info;
		},

		callHook<K extends keyof ServerPluginHooks>(
			hook: K,
			...args: Parameters<NonNullable<ServerPluginHooks[K]>>
		): ReturnType<NonNullable<ServerPluginHooks[K]>> | void {
			for (const registered of registeredPlugins.values()) {
				const instance = registered.instance;
				if (!instance) continue;

				const hookFn = instance[hook] as ((...a: unknown[]) => unknown) | undefined;
				if (hookFn) {
					try {
						const result = hookFn(...args);
						// For hooks that return modified values, use the first non-void result
						if (result !== undefined) {
							return result as ReturnType<NonNullable<ServerPluginHooks[K]>>;
						}
					} catch (error) {
						console.error(`Plugin "${instance.name}" hook "${hook}" failed:`, error);
					}
				}
			}
		},
	};
}
