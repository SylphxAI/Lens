/**
 * @sylphx/lens-server - Storage
 *
 * Storage adapters for opLog plugin.
 *
 * Built-in:
 * - `memoryStorage()` - In-memory (default, for long-running servers)
 *
 * External packages (install separately):
 * - `@sylphx/lens-storage-redis` - Redis via ioredis
 * - `@sylphx/lens-storage-upstash` - Upstash Redis HTTP (serverless/edge)
 * - `@sylphx/lens-storage-vercel-kv` - Vercel KV (Next.js/Vercel)
 */

// In-memory (default)
export { memoryStorage } from "./memory.js";

// Types (for implementing custom storage adapters)
export {
	DEFAULT_STORAGE_CONFIG,
	type EmitResult,
	type OpLogStorage,
	type OpLogStorageConfig,
	type StoredEntityState,
	type StoredPatchEntry,
} from "./types.js";
