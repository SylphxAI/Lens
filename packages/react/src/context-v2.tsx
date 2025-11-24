/**
 * @lens/react - Context Provider V2
 *
 * Provides operations-based Lens client to React component tree.
 *
 * @example
 * ```tsx
 * import { createClientV2 } from '@lens/client';
 * import { LensProviderV2 } from '@lens/react';
 *
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [websocketLink({ url: 'ws://localhost:3000' })],
 * });
 *
 * function App() {
 *   return (
 *     <LensProviderV2 client={client}>
 *       <UserProfile />
 *     </LensProviderV2>
 *   );
 * }
 * ```
 */

import { createContext, useContext, type ReactNode } from "react";
import type { ClientV2, QueriesMap, MutationsMap } from "@lens/client";

// =============================================================================
// Context
// =============================================================================

/**
 * Context for Lens client V2
 */
const LensContextV2 = createContext<ClientV2<QueriesMap, MutationsMap> | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface LensProviderV2Props<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
> {
	/** Lens client V2 instance */
	client: ClientV2<Q, M>;
	/** Children */
	children: ReactNode;
}

/**
 * Provides Lens client V2 to component tree
 *
 * @example
 * ```tsx
 * import { createClientV2 } from '@lens/client';
 * import { LensProviderV2 } from '@lens/react';
 * import { queries, mutations } from './operations';
 *
 * const client = createClientV2({
 *   queries,
 *   mutations,
 *   links: [websocketLink({ url: 'ws://localhost:3000' })],
 * });
 *
 * function App() {
 *   return (
 *     <LensProviderV2 client={client}>
 *       <UserProfile />
 *     </LensProviderV2>
 *   );
 * }
 * ```
 */
export function LensProviderV2<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>({ client, children }: LensProviderV2Props<Q, M>) {
	return (
		<LensContextV2.Provider value={client as ClientV2<QueriesMap, MutationsMap>}>
			{children}
		</LensContextV2.Provider>
	);
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Get Lens client V2 from context
 *
 * @throws Error if used outside LensProviderV2
 */
export function useLensClientV2<
	Q extends QueriesMap = QueriesMap,
	M extends MutationsMap = MutationsMap,
>(): ClientV2<Q, M> {
	const client = useContext(LensContextV2);

	if (!client) {
		throw new Error("useLensClientV2 must be used within a LensProviderV2");
	}

	return client as ClientV2<Q, M>;
}
