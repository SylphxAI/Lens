/**
 * Lens context provider
 */

import type { LensTransport } from "@sylphx/lens-core";
import { createContext, useContext, type ReactNode } from "react";

export interface LensContextValue {
	transport: LensTransport;
}

const LensContext = createContext<LensContextValue | null>(null);

export interface LensProviderProps {
	transport: LensTransport;
	children: ReactNode;
}

/**
 * Lens provider component
 *
 * @example
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
 */
export function LensProvider({ transport, children }: LensProviderProps) {
	return (
		<LensContext.Provider value={{ transport }}>
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
