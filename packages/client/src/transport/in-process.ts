/**
 * @sylphx/lens-client - In-Process Transport
 *
 * In-process transport for direct server calls without network.
 * Useful for testing and SSR.
 */

import type { Metadata, Observable, Operation, Result, Transport } from "./types";

// =============================================================================
// Types
// =============================================================================

/**
 * Lens server interface for in-process transport.
 */
export interface LensServerInterface {
	/** Get operation metadata */
	getMetadata(): Metadata;
	/** Execute an operation */
	execute(op: Operation): Promise<Result> | Observable<Result>;
}

/**
 * In-process transport options.
 */
export interface InProcessTransportOptions {
	/** Lens server instance */
	server: LensServerInterface;
}

// =============================================================================
// In-Process Transport
// =============================================================================

/**
 * Create in-process transport for direct server calls.
 *
 * No network overhead - direct function calls to server.
 * Useful for:
 * - Unit testing
 * - Integration testing
 * - Server-Side Rendering (SSR)
 * - Same-process communication
 *
 * @example
 * ```typescript
 * // Testing
 * const server = createServer({ router: appRouter })
 * const client = await createClient({
 *   transport: inProcess({ server }),
 * })
 *
 * // SSR
 * export async function getServerSideProps() {
 *   const client = await createClient({
 *     transport: inProcess({ server }),
 *   })
 *   const user = await client.user.get({ id: '123' })
 *   return { props: { user } }
 * }
 * ```
 */
export function inProcess(options: InProcessTransportOptions): Transport {
	const { server } = options;

	return {
		/**
		 * Get metadata directly from server.
		 * No network call needed.
		 */
		async connect(): Promise<Metadata> {
			return server.getMetadata();
		},

		/**
		 * Execute operation directly on server.
		 * No network call needed.
		 */
		execute(op: Operation): Promise<Result> | Observable<Result> {
			return server.execute(op);
		},
	};
}
