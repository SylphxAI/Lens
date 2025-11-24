/**
 * @lens/client - In-Process Link V2
 *
 * In-process transport for operations-based API (V2 protocol).
 * Direct execution without network - useful for testing and SSR.
 *
 * @example
 * ```typescript
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [inProcessLinkV2({ server })],
 * });
 * ```
 */

import type { Link, LinkFn, OperationContext, OperationResult } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Server-like interface for in-process execution */
export interface InProcessServerV2 {
	executeQuery<TInput, TOutput>(name: string, input?: TInput): Promise<TOutput>;
	executeMutation<TInput, TOutput>(name: string, input: TInput): Promise<TOutput>;
}

/** In-process link V2 options */
export interface InProcessLinkV2Options {
	/** Server instance or query/mutation handlers */
	server?: InProcessServerV2;
	/** Direct handlers (alternative to server) */
	handlers?: {
		query?: Record<string, (input: unknown) => Promise<unknown>>;
		mutation?: Record<string, (input: unknown) => Promise<unknown>>;
	};
}

// =============================================================================
// In-Process Link V2
// =============================================================================

/**
 * Create in-process link for V2 operations protocol
 *
 * @example Using with LensServerV2
 * ```typescript
 * const server = createServerV2({ ... });
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [inProcessLinkV2({ server })],
 * });
 * ```
 *
 * @example Using with handlers
 * ```typescript
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [inProcessLinkV2({
 *     handlers: {
 *       query: {
 *         getUsers: async () => users,
 *         getUser: async ({ id }) => users.find(u => u.id === id),
 *       },
 *       mutation: {
 *         createUser: async (input) => ({ id: 'new', ...input }),
 *       },
 *     },
 *   })],
 * });
 * ```
 */
export function inProcessLinkV2(options: InProcessLinkV2Options): Link {
	const { server, handlers } = options;

	if (!server && !handlers) {
		throw new Error("inProcessLinkV2 requires either server or handlers");
	}

	return (): LinkFn => {
		return async (op: OperationContext): Promise<OperationResult> => {
			try {
				if (server) {
					// Use server instance
					if (op.type === "query") {
						const data = await server.executeQuery(op.op, op.input);
						return { data };
					}

					if (op.type === "mutation") {
						const data = await server.executeMutation(op.op, op.input);
						return { data };
					}
				} else if (handlers) {
					// Use direct handlers
					const handlerMap = op.type === "query" ? handlers.query : handlers.mutation;
					const handler = handlerMap?.[op.op];

					if (!handler) {
						return { error: new Error(`Handler not found: ${op.type}.${op.op}`) };
					}

					const data = await handler(op.input);
					return { data };
				}

				return { error: new Error(`Unknown operation type: ${op.type}`) };
			} catch (err) {
				return { error: err instanceof Error ? err : new Error(String(err)) };
			}
		};
	};
}

/**
 * Create in-process link from LensServerV2
 */
export function createInProcessLinkV2(server: InProcessServerV2): Link {
	return inProcessLinkV2({ server });
}
