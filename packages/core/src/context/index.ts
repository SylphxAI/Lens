/**
 * @sylphx/lens-core - Context Types
 *
 * Type-only exports for the context system.
 * Implementation is in @sylphx/lens-server.
 *
 * @example
 * ```typescript
 * import type { ContextStore, ContextValue } from '@sylphx/lens-core';
 *
 * // Define context type
 * interface AppContext extends ContextValue {
 *   db: Database;
 *   currentUser: User | null;
 * }
 *
 * // Implementation functions are in @sylphx/lens-server
 * import { createContext, runWithContext, useContext } from '@sylphx/lens-server';
 * ```
 */

export type { ContextStore, ContextValue } from "./types.js";
