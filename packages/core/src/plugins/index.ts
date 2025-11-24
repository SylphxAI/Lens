/**
 * @lens/core - Plugin System
 *
 * Unified plugin architecture for client and server.
 */

export {
	// Helper
	defineUnifiedPlugin,
	// Types
	type PluginMeta,
	type BasePluginConfig,
	// Client types
	type ClientPluginContext,
	type ClientPluginHooks,
	type ClientPluginInstance,
	type ClientPluginDef,
	// Server types
	type ServerRequestContext,
	type ServerPluginContext,
	type ServerPluginHooks,
	type ServerPluginInstance,
	type ServerPluginDef,
	// Unified
	type UnifiedPlugin,
	// Handshake
	type PluginHandshakeInfo,
	type ServerHandshake,
	type ClientHandshake,
} from "./types";

// Built-in plugins
export {
	authPlugin,
	type AuthPluginConfig,
	type AuthClientAPI,
	type AuthServerAPI,
} from "./auth";

export {
	cachePlugin,
	type CachePluginConfig,
	type CacheClientAPI,
	type CacheServerAPI,
	type CascadeRule,
} from "./cache";

export {
	paginationPlugin,
	type PaginationPluginConfig,
	type PaginationClientAPI,
	type PaginationServerAPI,
	type PageInfo,
	type PaginatedResult,
	type PaginationInput,
} from "./pagination";
