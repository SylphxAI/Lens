/**
 * @sylphx/lens-core - Context Types
 *
 * Type definitions for the context system.
 * Implementation is in @sylphx/lens-server.
 */

/** Context value - can be any object */
export type ContextValue = object;

/** Context store type (opaque - platform specific) */
export type ContextStore<T> = unknown & { __brand: "ContextStore"; __type: T };
