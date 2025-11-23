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
 * Transport interface for queries and mutations
 */
export interface QueryTransport {
	/** Execute a query and return Promise */
	query<T>(request: LensRequest): Promise<T>;

	/** Execute a mutation and return Promise */
	mutate<T>(request: LensRequest): Promise<T>;
}

/**
 * Transport interface for subscriptions
 */
export interface SubscriptionTransport {
	/** Subscribe to real-time updates and return Observable */
	subscribe<T>(request: LensRequest): Observable<T>;
}

/**
 * Complete transport interface
 *
 * Type-safe methods for all operation types.
 * Implementations can choose to support all or subset.
 */
export interface LensTransport
	extends QueryTransport,
		SubscriptionTransport {
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

	query<T>(request: LensRequest): Promise<T> {
		type NextFn = (req: LensRequest) => Promise<any> | Observable<any>;

		const chain = this.middleware.reduceRight<NextFn>(
			(next, middleware) => (req: LensRequest) => middleware(req, next),
			(req: LensRequest) => this.transport.query(req)
		);

		return chain(request) as Promise<T>;
	}

	mutate<T>(request: LensRequest): Promise<T> {
		type NextFn = (req: LensRequest) => Promise<any> | Observable<any>;

		const chain = this.middleware.reduceRight<NextFn>(
			(next, middleware) => (req: LensRequest) => middleware(req, next),
			(req: LensRequest) => this.transport.mutate(req)
		);

		return chain(request) as Promise<T>;
	}

	subscribe<T>(request: LensRequest): Observable<T> {
		type NextFn = (req: LensRequest) => Promise<any> | Observable<any>;

		const chain = this.middleware.reduceRight<NextFn>(
			(next, middleware) => (req: LensRequest) => middleware(req, next),
			(req: LensRequest) => this.transport.subscribe(req)
		);

		return chain(request) as Observable<T>;
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

	query<T>(request: LensRequest): Promise<T> {
		const route = this.routes.find((r) => r.match(request));

		if (!route) {
			throw new Error(
				`No transport found for request: ${request.type} ${request.path.join(".")}`
			);
		}

		return route.transport.query(request);
	}

	mutate<T>(request: LensRequest): Promise<T> {
		const route = this.routes.find((r) => r.match(request));

		if (!route) {
			throw new Error(
				`No transport found for request: ${request.type} ${request.path.join(".")}`
			);
		}

		return route.transport.mutate(request);
	}

	subscribe<T>(request: LensRequest): Observable<T> {
		const route = this.routes.find((r) => r.match(request));

		if (!route) {
			throw new Error(
				`No transport found for request: ${request.type} ${request.path.join(".")}`
			);
		}

		return route.transport.subscribe(request);
	}

	close() {
		for (const route of this.routes) {
			route.transport.close?.();
		}
	}
}
