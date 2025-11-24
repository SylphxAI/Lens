/**
 * @lens/server - Server V2 (New Architecture)
 *
 * Server creation with support for:
 * - Operations (query/mutation definitions)
 * - Entity Resolvers (nested data handling)
 * - AsyncLocalStorage context
 *
 * @example
 * ```typescript
 * import { createServerV2 } from '@lens/server';
 * import * as entities from './schema/entities';
 * import { relations } from './schema/relations';
 * import * as queries from './operations/queries';
 * import * as mutations from './operations/mutations';
 * import { resolvers } from './resolvers';
 *
 * const server = createServerV2({
 *   entities,
 *   relations,
 *   queries,
 *   mutations,
 *   resolvers,
 *   context: async (req) => ({
 *     db: prisma,
 *     currentUser: await getUserFromRequest(req),
 *   }),
 * });
 *
 * server.listen(3000);
 * ```
 */

import {
	type QueryDef,
	type MutationDef,
	type EntityResolvers,
	type EntityResolversDefinition,
	type EntityDef,
	type EntityDefinition,
	type RelationDef,
	type RelationTypeWithForeignKey,
	type ContextValue,
	isQueryDef,
	isMutationDef,
	createContext,
	runWithContext,
} from "@lens/core";

// =============================================================================
// Types
// =============================================================================

/** Entity definitions map */
export type EntitiesMap = Record<string, EntityDef<string, EntityDefinition>>;

/** Relations array */
export type RelationsArray = RelationDef<EntityDef<string, EntityDefinition>, Record<string, RelationTypeWithForeignKey>>[];

/** Queries map */
export type QueriesMap = Record<string, QueryDef<unknown, unknown>>;

/** Mutations map */
export type MutationsMap = Record<string, MutationDef<unknown, unknown>>;

/** Server V2 configuration */
export interface ServerV2Config<
	TContext extends ContextValue = ContextValue,
> {
	/** Entity definitions */
	entities: EntitiesMap;

	/** Relation definitions */
	relations?: RelationsArray;

	/** Query operations */
	queries?: QueriesMap;

	/** Mutation operations */
	mutations?: MutationsMap;

	/** Entity resolvers for nested data */
	resolvers?: EntityResolvers<EntityResolversDefinition>;

	/** Context factory */
	context?: (req?: unknown) => TContext | Promise<TContext>;

	/** Server version */
	version?: string;
}

/** Server V2 instance */
export interface LensServerV2 {
	/** Execute a query by name */
	executeQuery<TInput, TOutput>(
		name: string,
		input?: TInput,
	): Promise<TOutput>;

	/** Execute a mutation by name */
	executeMutation<TInput, TOutput>(
		name: string,
		input: TInput,
	): Promise<TOutput>;

	/** Get query definition by name */
	getQuery(name: string): QueryDef<unknown, unknown> | undefined;

	/** Get mutation definition by name */
	getMutation(name: string): MutationDef<unknown, unknown> | undefined;

	/** Get all query names */
	getQueryNames(): string[];

	/** Get all mutation names */
	getMutationNames(): string[];

	/** Handle WebSocket connection */
	handleWebSocket(ws: WebSocketLike): void;

	/** Handle HTTP request */
	handleRequest(req: Request): Promise<Response>;

	/** Start listening on a port */
	listen(port: number): Promise<void>;

	/** Close the server */
	close(): Promise<void>;
}

/** WebSocket-like interface */
export interface WebSocketLike {
	send(data: string): void;
	close(): void;
	onmessage?: ((event: { data: string }) => void) | null;
	onclose?: (() => void) | null;
	onerror?: ((error: unknown) => void) | null;
}

// =============================================================================
// Message Types
// =============================================================================

interface QueryMessage {
	type: "query";
	id: string;
	name: string;
	input?: unknown;
}

interface MutationMessage {
	type: "mutation";
	id: string;
	name: string;
	input: unknown;
}

interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

type ClientMessage = QueryMessage | MutationMessage | HandshakeMessage;

// =============================================================================
// Server Implementation
// =============================================================================

class LensServerV2Impl<TContext extends ContextValue> implements LensServerV2 {
	private queries: QueriesMap;
	private mutations: MutationsMap;
	private resolvers?: EntityResolvers<EntityResolversDefinition>;
	private contextFactory: (req?: unknown) => TContext | Promise<TContext>;
	private version: string;
	private server: unknown = null;
	private ctx = createContext<TContext>();

	constructor(config: ServerV2Config<TContext>) {
		this.queries = config.queries ?? {};
		this.mutations = config.mutations ?? {};
		this.resolvers = config.resolvers;
		this.contextFactory = config.context ?? (() => ({} as TContext));
		this.version = config.version ?? "2.0.0";

		// Validate queries and mutations
		for (const [name, def] of Object.entries(this.queries)) {
			if (!isQueryDef(def)) {
				throw new Error(`Invalid query definition: ${name}`);
			}
		}
		for (const [name, def] of Object.entries(this.mutations)) {
			if (!isMutationDef(def)) {
				throw new Error(`Invalid mutation definition: ${name}`);
			}
		}
	}

	async executeQuery<TInput, TOutput>(
		name: string,
		input?: TInput,
	): Promise<TOutput> {
		const queryDef = this.queries[name];
		if (!queryDef) {
			throw new Error(`Query not found: ${name}`);
		}

		// Validate input if schema provided
		if (queryDef._input && input !== undefined) {
			const result = queryDef._input.safeParse(input);
			if (!result.success) {
				throw new Error(`Invalid input for query ${name}: ${JSON.stringify(result.error)}`);
			}
		}

		// Execute resolver with context
		const context = await this.contextFactory();
		return runWithContext(this.ctx, context, async () => {
			const resolver = queryDef._resolve;
			if (!resolver) {
				throw new Error(`Query ${name} has no resolver`);
			}

			const result = resolver({ input: input as TInput });

			// Handle async generator (streaming)
			if (result && typeof result === "object" && Symbol.asyncIterator in result) {
				// For now, just get the first value
				// TODO: Proper streaming support
				const iterator = result as AsyncGenerator<TOutput>;
				const first = await iterator.next();
				return first.value;
			}

			return result as TOutput;
		});
	}

	async executeMutation<TInput, TOutput>(
		name: string,
		input: TInput,
	): Promise<TOutput> {
		const mutationDef = this.mutations[name];
		if (!mutationDef) {
			throw new Error(`Mutation not found: ${name}`);
		}

		// Validate input
		const result = mutationDef._input.safeParse(input);
		if (!result.success) {
			throw new Error(`Invalid input for mutation ${name}: ${JSON.stringify(result.error)}`);
		}

		// Execute resolver with context
		const context = await this.contextFactory();
		return runWithContext(this.ctx, context, async () => {
			const resolver = mutationDef._resolve;
			const resolverResult = resolver({ input: input as TInput });

			// Handle async generator (streaming)
			if (resolverResult && typeof resolverResult === "object" && Symbol.asyncIterator in resolverResult) {
				const iterator = resolverResult as AsyncGenerator<TOutput>;
				const first = await iterator.next();
				return first.value;
			}

			return resolverResult as TOutput;
		});
	}

	getQuery(name: string): QueryDef<unknown, unknown> | undefined {
		return this.queries[name];
	}

	getMutation(name: string): MutationDef<unknown, unknown> | undefined {
		return this.mutations[name];
	}

	getQueryNames(): string[] {
		return Object.keys(this.queries);
	}

	getMutationNames(): string[] {
		return Object.keys(this.mutations);
	}

	handleWebSocket(ws: WebSocketLike): void {
		ws.onmessage = async (event) => {
			try {
				const message = JSON.parse(event.data) as ClientMessage;
				await this.handleMessage(ws, message);
			} catch (error) {
				ws.send(
					JSON.stringify({
						type: "error",
						error: { code: "PARSE_ERROR", message: "Failed to parse message" },
					}),
				);
			}
		};

		ws.onclose = () => {
			// Cleanup if needed
		};
	}

	private async handleMessage(ws: WebSocketLike, message: ClientMessage): Promise<void> {
		switch (message.type) {
			case "handshake":
				ws.send(
					JSON.stringify({
						type: "handshake",
						id: message.id,
						version: this.version,
						queries: this.getQueryNames(),
						mutations: this.getMutationNames(),
					}),
				);
				break;

			case "query":
				try {
					const data = await this.executeQuery(message.name, message.input);
					ws.send(
						JSON.stringify({
							type: "data",
							id: message.id,
							data,
						}),
					);
				} catch (error) {
					ws.send(
						JSON.stringify({
							type: "error",
							id: message.id,
							error: {
								code: "QUERY_ERROR",
								message: error instanceof Error ? error.message : "Unknown error",
							},
						}),
					);
				}
				break;

			case "mutation":
				try {
					const data = await this.executeMutation(message.name, message.input);
					ws.send(
						JSON.stringify({
							type: "result",
							id: message.id,
							data,
						}),
					);
				} catch (error) {
					ws.send(
						JSON.stringify({
							type: "error",
							id: message.id,
							error: {
								code: "MUTATION_ERROR",
								message: error instanceof Error ? error.message : "Unknown error",
							},
						}),
					);
				}
				break;
		}
	}

	async handleRequest(req: Request): Promise<Response> {
		if (req.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		try {
			const body = (await req.json()) as {
				type: "query" | "mutation";
				name: string;
				input?: unknown;
			};

			let data: unknown;

			if (body.type === "query") {
				data = await this.executeQuery(body.name, body.input);
			} else if (body.type === "mutation") {
				data = await this.executeMutation(body.name, body.input);
			} else {
				return new Response("Invalid operation type", { status: 400 });
			}

			return new Response(JSON.stringify({ data }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: {
						code: "EXECUTION_ERROR",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	async listen(port: number): Promise<void> {
		this.server = Bun.serve({
			port,
			fetch: (req, server) => {
				if (req.headers.get("upgrade") === "websocket") {
					const success = server.upgrade(req);
					if (success) {
						return undefined as unknown as Response;
					}
				}
				return this.handleRequest(req);
			},
			websocket: {
				message: (ws, message) => {
					const wsLike = this.createWsLike(ws);
					wsLike.onmessage?.({ data: message.toString() });
				},
				open: (ws) => {
					const wsLike = this.createWsLike(ws);
					this.handleWebSocket(wsLike);
				},
				close: () => {
					// Cleanup
				},
			},
		});

		console.log(`Lens server V2 listening on port ${port}`);
	}

	private createWsLike(ws: unknown): WebSocketLike {
		const bunWs = ws as { send: (data: string) => void; close: () => void };
		return {
			send: (data) => bunWs.send(data),
			close: () => bunWs.close(),
		};
	}

	async close(): Promise<void> {
		if (this.server && typeof (this.server as { stop?: () => void }).stop === "function") {
			(this.server as { stop: () => void }).stop();
		}
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Lens server V2 with the new architecture.
 *
 * @example
 * ```typescript
 * const server = createServerV2({
 *   entities,
 *   relations,
 *   queries,
 *   mutations,
 *   resolvers,
 *   context: async (req) => ({ db: prisma, currentUser }),
 * });
 *
 * server.listen(3000);
 * ```
 */
export function createServerV2<TContext extends ContextValue = ContextValue>(
	config: ServerV2Config<TContext>,
): LensServerV2 {
	return new LensServerV2Impl(config);
}
