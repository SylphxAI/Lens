/**
 * Transport interface - Pluggable transport layer
 *
 * Users can implement custom transports for any protocol:
 * - HTTP (fetch, axios)
 * - WebSocket (ws, socket.io)
 * - gRPC
 * - Redis Streams
 * - WebRTC
 * - In-process (for TUI/CLI)
 */

import type { Observable } from "rxjs";
import type { LensRequest, LensResponse } from "../schema/types.js";

/**
 * Transport interface
 *
 * Single method: send a request and return Promise or Observable
 */
export interface LensTransport {
	/**
	 * Send a request and return response
	 *
	 * - Queries: Return Promise<T>
	 * - Subscriptions: Return Observable<T>
	 * - Mutations: Return Promise<T>
	 */
	send<T>(request: LensRequest): Promise<T> | Observable<T>;

	/**
	 * Optional: Close transport connection
	 */
	close?: () => void | Promise<void>;
}

/**
 * Transport middleware for interceptors
 *
 * Use cases:
 * - Compression
 * - Authentication
 * - Logging
 * - Retry logic
 */
export interface TransportMiddleware {
	(
		request: LensRequest,
		next: (request: LensRequest) => Promise<any> | Observable<any>
	): Promise<any> | Observable<any>;
}

/**
 * Transport with middleware support
 */
export class MiddlewareTransport implements LensTransport {
	constructor(
		private readonly transport: LensTransport,
		private readonly middleware: TransportMiddleware[]
	) {}

	send<T>(request: LensRequest): Promise<T> | Observable<T> {
		// Build middleware chain
		type NextFn = (req: LensRequest) => Promise<any> | Observable<any>;

		const chain = this.middleware.reduceRight<NextFn>(
			(next, middleware) => (req: LensRequest) => middleware(req, next),
			(req: LensRequest) => this.transport.send(req)
		);

		return chain(request) as Promise<T> | Observable<T>;
	}

	close() {
		return this.transport.close?.();
	}
}

/**
 * Router for composing multiple transports
 *
 * Use case: WebSocket for subscriptions, HTTP for queries/mutations
 *
 * @example
 * ```ts
 * const transport = new TransportRouter([
 *   {
 *     match: (req) => req.type === 'subscription',
 *     transport: new WebSocketTransport({ url: 'ws://localhost:3000' })
 *   },
 *   {
 *     match: () => true,
 *     transport: new HTTPTransport({ url: 'http://localhost:3000' })
 *   }
 * ]);
 * ```
 */
export class TransportRouter implements LensTransport {
	constructor(
		private readonly routes: Array<{
			match: (request: LensRequest) => boolean;
			transport: LensTransport;
		}>
	) {}

	send<T>(request: LensRequest): Promise<T> | Observable<T> {
		const route = this.routes.find((r) => r.match(request));

		if (!route) {
			throw new Error(
				`No transport found for request: ${request.type} ${request.path.join(".")}`
			);
		}

		return route.transport.send(request);
	}

	close() {
		for (const route of this.routes) {
			route.transport.close?.();
		}
	}
}
