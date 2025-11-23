/**
 * Lens context provider
 */

import type { LensTransport, QueryContext } from "@sylphx/lens-core";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Lens context value
 *
 * Can provide either:
 * - transport: For low-level hooks (useQuery, useMutation, useSubscription)
 * - ctx: For high-level hooks (useResource, useResourceMutation)
 */
export interface LensContextValue {
	/** Transport for low-level hooks */
	transport?: LensTransport;
	/** Query context for high-level hooks */
	ctx?: QueryContext;
}

const LensContext = createContext<LensContextValue | null>(null);

export interface LensProviderProps {
	/** Transport for low-level hooks */
	transport?: LensTransport;
	/** Query context for high-level hooks */
	ctx?: QueryContext;
	children: ReactNode;
}

/**
 * Lens provider component
 *
 * Provides Lens context to child components.
 * Can provide either transport (for low-level hooks) or ctx (for high-level hooks).
 *
 * @example Low-level hooks (transport layer)
 * ```tsx
 * import { LensProvider } from '@sylphx/lens-react';
 * import { HTTPTransport } from '@sylphx/lens-transport-http';
 *
 * const transport = new HTTPTransport({ url: 'http://localhost:3000/lens' });
 *
 * function App() {
 *   return (
 *     <LensProvider transport={transport}>
 *       <YourApp />
 *     </LensProvider>
 *   );
 * }
 * ```
 *
 * @example High-level hooks (resource API)
 * ```tsx
 * import { LensProvider } from '@sylphx/lens-react';
 * import { createEventStream } from '@sylphx/lens-core';
 *
 * const ctx = {
 *   db: myDatabaseAdapter,
 *   eventStream: createEventStream(),
 *   user: currentUser,
 * };
 *
 * function App() {
 *   return (
 *     <LensProvider ctx={ctx}>
 *       <YourApp />
 *     </LensProvider>
 *   );
 * }
 * ```
 */
export function LensProvider({ transport, ctx, children }: LensProviderProps) {
	if (!transport && !ctx) {
		throw new Error(
			"LensProvider requires either 'transport' or 'ctx' prop",
		);
	}

	return (
		<LensContext.Provider value={{ transport, ctx }}>
			{children}
		</LensContext.Provider>
	);
}

/**
 * Hook to access Lens context
 */
export function useLensContext(): LensContextValue {
	const context = useContext(LensContext);
	if (!context) {
		throw new Error("useLensContext must be used within LensProvider");
	}
	return context;
}
