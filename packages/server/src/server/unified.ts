/**
 * @lens/server - Unified Server
 *
 * Combines V2 Operations API with V1 Optimization Layer:
 * - Free Operations (query/mutation definitions)
 * - GraphStateManager (per-client state tracking, minimal diffs)
 * - Field-level subscriptions
 * - Entity Resolvers with DataLoader batching
 */

import {
	type QueryDef,
	type MutationDef,
	type EntityResolvers,
	type EntityResolversDefinition,
	type EntityDef,
	type ContextValue,
	type Update,
	isQueryDef,
	isMutationDef,
	isBatchResolver,
	createContext,
	runWithContext,
	createUpdate,
} from "@lens/core";
import { GraphStateManager, type StateClient } from "../state/graph-state-manager";

// =============================================================================
// Types
// =============================================================================

/** Entity map type */
export type EntitiesMap = Record<string, EntityDef<Record<string, unknown>>>;

/** Queries map type */
export type QueriesMap = Record<string, QueryDef<unknown, unknown, unknown>>;

/** Mutations map type */
export type MutationsMap = Record<string, MutationDef<unknown, unknown, unknown>>;

/** Server configuration */
export interface UnifiedServerConfig<TContext extends ContextValue = ContextValue> {
	/** Entity definitions */
	entities?: EntitiesMap;
	/** Query definitions */
	queries?: QueriesMap;
	/** Mutation definitions */
	mutations?: MutationsMap;
	/** Entity resolvers */
	resolvers?: EntityResolvers<EntityResolversDefinition>;
	/** Context factory */
	context?: (req?: unknown) => TContext | Promise<TContext>;
	/** Server version */
	version?: string;
}

/** Unified server interface */
export interface UnifiedServer {
	/** Execute a query (one-time) */
	executeQuery<TInput, TOutput>(name: string, input?: TInput): Promise<TOutput>;
	/** Execute a mutation */
	executeMutation<TInput, TOutput>(name: string, input: TInput): Promise<TOutput>;
	/** Handle WebSocket connection */
	handleWebSocket(ws: WebSocketLike): void;
	/** Handle HTTP request */
	handleRequest(req: Request): Promise<Response>;
	/** Get GraphStateManager for external access */
	getStateManager(): GraphStateManager;
	/** Start server */
	listen(port: number): Promise<void>;
	/** Close server */
	close(): Promise<void>;
}

/** WebSocket interface */
export interface WebSocketLike {
	send(data: string): void;
	close(): void;
	onmessage?: ((event: { data: string }) => void) | null;
	onclose?: (() => void) | null;
	onerror?: ((error: unknown) => void) | null;
}

/** Emit context for streaming resolvers */
interface EmitContext<T> {
	emit: (data: T) => void;
	onCleanup: (fn: () => void) => () => void;
}

// =============================================================================
// Protocol Messages
// =============================================================================

/** Subscribe to operation with field selection */
interface SubscribeMessage {
	type: "subscribe";
	id: string;
	operation: string;
	input?: unknown;
	fields: string[] | "*";
}

/** Update subscription fields */
interface UpdateFieldsMessage {
	type: "updateFields";
	id: string;
	addFields?: string[];
	removeFields?: string[];
}

/** Unsubscribe */
interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
}

/** One-time query */
interface QueryMessage {
	type: "query";
	id: string;
	operation: string;
	input?: unknown;
	fields?: string[] | "*";
}

/** Mutation */
interface MutationMessage {
	type: "mutation";
	id: string;
	operation: string;
	input: unknown;
}

/** Handshake */
interface HandshakeMessage {
	type: "handshake";
	id: string;
	clientVersion?: string;
}

type ClientMessage =
	| SubscribeMessage
	| UpdateFieldsMessage
	| UnsubscribeMessage
	| QueryMessage
	| MutationMessage
	| HandshakeMessage;

// =============================================================================
// Client Connection
// =============================================================================

interface ClientConnection {
	id: string;
	ws: WebSocketLike;
	subscriptions: Map<string, ClientSubscription>;
}

interface ClientSubscription {
	id: string;
	operation: string;
	input: unknown;
	fields: string[] | "*";
	/** Entity keys this subscription is tracking */
	entityKeys: Set<string>;
	/** Cleanup functions */
	cleanups: (() => void)[];
	/** Last emitted data for diff computation */
	lastData: unknown;
}

// =============================================================================
// DataLoader
// =============================================================================

class DataLoader<K, V> {
	private batch: Map<K, { resolve: (v: V | null) => void; reject: (e: Error) => void }[]> = new Map();
	private scheduled = false;

	constructor(private batchFn: (keys: K[]) => Promise<(V | null)[]>) {}

	async load(key: K): Promise<V | null> {
		return new Promise((resolve, reject) => {
			const existing = this.batch.get(key);
			if (existing) {
				existing.push({ resolve, reject });
			} else {
				this.batch.set(key, [{ resolve, reject }]);
			}
			this.scheduleDispatch();
		});
	}

	private scheduleDispatch(): void {
		if (this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(() => this.dispatch());
	}

	private async dispatch(): Promise<void> {
		this.scheduled = false;
		const batch = this.batch;
		this.batch = new Map();

		const keys = Array.from(batch.keys());
		if (keys.length === 0) return;

		try {
			const results = await this.batchFn(keys);
			keys.forEach((key, index) => {
				const callbacks = batch.get(key)!;
				const result = results[index] ?? null;
				callbacks.forEach(({ resolve }) => resolve(result));
			});
		} catch (error) {
			for (const callbacks of batch.values()) {
				callbacks.forEach(({ reject }) => reject(error as Error));
			}
		}
	}

	clear(): void {
		this.batch.clear();
	}
}

// =============================================================================
// Unified Server Implementation
// =============================================================================

class UnifiedServerImpl<TContext extends ContextValue> implements UnifiedServer {
	private queries: QueriesMap;
	private mutations: MutationsMap;
	private entities: EntitiesMap;
	private resolvers?: EntityResolvers<EntityResolversDefinition>;
	private contextFactory: (req?: unknown) => TContext | Promise<TContext>;
	private version: string;
	private ctx = createContext<TContext>();

	/** GraphStateManager for per-client state tracking */
	private stateManager: GraphStateManager;

	/** DataLoaders for N+1 batching (per-request) */
	private loaders = new Map<string, DataLoader<unknown, unknown>>();

	/** Client connections */
	private connections = new Map<string, ClientConnection>();
	private connectionCounter = 0;

	/** Server instance */
	private server: unknown = null;

	constructor(config: UnifiedServerConfig<TContext>) {
		this.queries = config.queries ?? {};
		this.mutations = config.mutations ?? {};
		this.entities = config.entities ?? {};
		this.resolvers = config.resolvers;
		this.contextFactory = config.context ?? (() => ({} as TContext));
		this.version = config.version ?? "1.0.0";

		// Initialize GraphStateManager
		this.stateManager = new GraphStateManager({
			onEntityUnsubscribed: (entity, id) => {
				// Optional: cleanup when entity has no subscribers
			},
		});

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

	getStateManager(): GraphStateManager {
		return this.stateManager;
	}

	// ===========================================================================
	// WebSocket Handling
	// ===========================================================================

	handleWebSocket(ws: WebSocketLike): void {
		const clientId = `client_${++this.connectionCounter}`;

		const conn: ClientConnection = {
			id: clientId,
			ws,
			subscriptions: new Map(),
		};

		this.connections.set(clientId, conn);

		// Register with GraphStateManager
		this.stateManager.addClient({
			id: clientId,
			send: (msg) => {
				ws.send(JSON.stringify(msg));
			},
		});

		ws.onmessage = (event) => {
			this.handleMessage(conn, event.data as string);
		};

		ws.onclose = () => {
			this.handleDisconnect(conn);
		};
	}

	private handleMessage(conn: ClientConnection, data: string): void {
		try {
			const message = JSON.parse(data) as ClientMessage;

			switch (message.type) {
				case "handshake":
					this.handleHandshake(conn, message);
					break;
				case "subscribe":
					this.handleSubscribe(conn, message);
					break;
				case "updateFields":
					this.handleUpdateFields(conn, message);
					break;
				case "unsubscribe":
					this.handleUnsubscribe(conn, message);
					break;
				case "query":
					this.handleQuery(conn, message);
					break;
				case "mutation":
					this.handleMutation(conn, message);
					break;
			}
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					error: { code: "PARSE_ERROR", message: String(error) },
				}),
			);
		}
	}

	private handleHandshake(conn: ClientConnection, message: HandshakeMessage): void {
		conn.ws.send(
			JSON.stringify({
				type: "handshake",
				id: message.id,
				version: this.version,
				queries: Object.keys(this.queries),
				mutations: Object.keys(this.mutations),
			}),
		);
	}

	private async handleSubscribe(conn: ClientConnection, message: SubscribeMessage): Promise<void> {
		const { id, operation, input, fields } = message;

		// Create subscription
		const sub: ClientSubscription = {
			id,
			operation,
			input,
			fields,
			entityKeys: new Set(),
			cleanups: [],
			lastData: null,
		};

		conn.subscriptions.set(id, sub);

		// Execute query and start streaming
		try {
			await this.executeSubscription(conn, sub);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	private async executeSubscription(conn: ClientConnection, sub: ClientSubscription): Promise<void> {
		const queryDef = this.queries[sub.operation];
		if (!queryDef) {
			throw new Error(`Query not found: ${sub.operation}`);
		}

		// Validate input
		if (queryDef._input && sub.input !== undefined) {
			const result = queryDef._input.safeParse(sub.input);
			if (!result.success) {
				throw new Error(`Invalid input: ${JSON.stringify(result.error)}`);
			}
		}

		const context = await this.contextFactory();
		let isFirstUpdate = true;

		// Create emit function that integrates with GraphStateManager
		const emitData = (data: unknown) => {
			if (!data) return;

			// Extract entity info from data
			const entityName = this.getEntityNameFromOutput(queryDef._output);
			const entities = this.extractEntities(entityName, data);

			// Register entities with GraphStateManager and track in subscription
			for (const { entity, id, entityData } of entities) {
				const entityKey = `${entity}:${id}`;
				sub.entityKeys.add(entityKey);

				// Subscribe client to this entity in GraphStateManager
				this.stateManager.subscribe(conn.id, entity, id, sub.fields);

				// Emit to GraphStateManager (it will compute diffs and send to client)
				this.stateManager.emit(entity, id, entityData);
			}

			// Also send operation-level response for first data
			if (isFirstUpdate) {
				conn.ws.send(
					JSON.stringify({
						type: "data",
						id: sub.id,
						data,
					}),
				);
				isFirstUpdate = false;
				sub.lastData = data;
			} else {
				// Compute operation-level diff for subsequent updates
				const updates = this.computeUpdates(sub.lastData, data);
				if (updates && Object.keys(updates).length > 0) {
					conn.ws.send(
						JSON.stringify({
							type: "update",
							id: sub.id,
							updates,
						}),
					);
				}
				sub.lastData = data;
			}
		};

		// Execute resolver
		await runWithContext(this.ctx, context, async () => {
			const resolver = queryDef._resolve;
			if (!resolver) {
				throw new Error(`Query ${sub.operation} has no resolver`);
			}

			const emitCtx: EmitContext<unknown> = {
				emit: emitData,
				onCleanup: (fn) => {
					sub.cleanups.push(fn);
					return () => {
						const idx = sub.cleanups.indexOf(fn);
						if (idx >= 0) sub.cleanups.splice(idx, 1);
					};
				},
			};

			const result = resolver({ input: sub.input, ctx: emitCtx });

			if (isAsyncIterable(result)) {
				// Async generator - stream all values
				for await (const value of result) {
					emitData(value);
				}
			} else {
				// Single value
				const value = await result;
				emitData(value);
			}
		});
	}

	private handleUpdateFields(conn: ClientConnection, message: UpdateFieldsMessage): void {
		const sub = conn.subscriptions.get(message.id);
		if (!sub) return;

		// Update fields
		if (sub.fields === "*") {
			// Already subscribing to all fields
			return;
		}

		const fields = new Set(sub.fields);

		if (message.addFields) {
			for (const field of message.addFields) {
				fields.add(field);
			}
		}

		if (message.removeFields) {
			for (const field of message.removeFields) {
				fields.delete(field);
			}
		}

		sub.fields = Array.from(fields);

		// Update GraphStateManager subscriptions for all tracked entities
		for (const entityKey of sub.entityKeys) {
			const [entity, id] = entityKey.split(":");
			this.stateManager.updateSubscription(conn.id, entity, id, sub.fields);
		}
	}

	private handleUnsubscribe(conn: ClientConnection, message: UnsubscribeMessage): void {
		const sub = conn.subscriptions.get(message.id);
		if (!sub) return;

		// Cleanup
		for (const cleanup of sub.cleanups) {
			try {
				cleanup();
			} catch (e) {
				console.error("Cleanup error:", e);
			}
		}

		// Unsubscribe from all tracked entities in GraphStateManager
		for (const entityKey of sub.entityKeys) {
			const [entity, id] = entityKey.split(":");
			this.stateManager.unsubscribe(conn.id, entity, id);
		}

		conn.subscriptions.delete(message.id);
	}

	private async handleQuery(conn: ClientConnection, message: QueryMessage): Promise<void> {
		try {
			const result = await this.executeQuery(message.operation, message.input);

			// Apply field selection if specified
			const selected = message.fields ? this.applySelection(result, message.fields) : result;

			conn.ws.send(
				JSON.stringify({
					type: "result",
					id: message.id,
					data: selected,
				}),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	private async handleMutation(conn: ClientConnection, message: MutationMessage): Promise<void> {
		try {
			const result = await this.executeMutation(message.operation, message.input);

			// After mutation, emit to GraphStateManager to notify all subscribers
			const entityName = this.getEntityNameFromMutation(message.operation);
			const entities = this.extractEntities(entityName, result);

			for (const { entity, id, entityData } of entities) {
				this.stateManager.emit(entity, id, entityData);
			}

			conn.ws.send(
				JSON.stringify({
					type: "result",
					id: message.id,
					data: result,
				}),
			);
		} catch (error) {
			conn.ws.send(
				JSON.stringify({
					type: "error",
					id: message.id,
					error: { code: "EXECUTION_ERROR", message: String(error) },
				}),
			);
		}
	}

	private handleDisconnect(conn: ClientConnection): void {
		// Cleanup all subscriptions
		for (const sub of conn.subscriptions.values()) {
			for (const cleanup of sub.cleanups) {
				try {
					cleanup();
				} catch (e) {
					console.error("Cleanup error:", e);
				}
			}
		}

		// Remove from GraphStateManager
		this.stateManager.removeClient(conn.id);

		// Remove connection
		this.connections.delete(conn.id);
	}

	// ===========================================================================
	// Query/Mutation Execution
	// ===========================================================================

	async executeQuery<TInput, TOutput>(name: string, input?: TInput): Promise<TOutput> {
		const queryDef = this.queries[name];
		if (!queryDef) {
			throw new Error(`Query not found: ${name}`);
		}

		if (queryDef._input && input !== undefined) {
			const result = queryDef._input.safeParse(input);
			if (!result.success) {
				throw new Error(`Invalid input: ${JSON.stringify(result.error)}`);
			}
		}

		const context = await this.contextFactory();

		try {
			return await runWithContext(this.ctx, context, async () => {
				const resolver = queryDef._resolve;
				if (!resolver) {
					throw new Error(`Query ${name} has no resolver`);
				}

				const emitCtx: EmitContext<TOutput> = {
					emit: () => {},
					onCleanup: () => () => {},
				};

				const result = resolver({ input: input as TInput, ctx: emitCtx });

				if (isAsyncIterable(result)) {
					for await (const value of result) {
						return value as TOutput;
					}
					throw new Error(`Query ${name} returned empty stream`);
				}

				return result as TOutput;
			});
		} finally {
			this.clearLoaders();
		}
	}

	async executeMutation<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
		const mutationDef = this.mutations[name];
		if (!mutationDef) {
			throw new Error(`Mutation not found: ${name}`);
		}

		if (mutationDef._input) {
			const result = mutationDef._input.safeParse(input);
			if (!result.success) {
				throw new Error(`Invalid input: ${JSON.stringify(result.error)}`);
			}
		}

		const context = await this.contextFactory();

		try {
			return await runWithContext(this.ctx, context, async () => {
				const resolver = mutationDef._resolve;
				if (!resolver) {
					throw new Error(`Mutation ${name} has no resolver`);
				}

				const result = await resolver({ input: input as TInput });

				// Emit to GraphStateManager
				const entityName = this.getEntityNameFromMutation(name);
				const entities = this.extractEntities(entityName, result);

				for (const { entity, id, entityData } of entities) {
					this.stateManager.emit(entity, id, entityData);
				}

				return result as TOutput;
			});
		} finally {
			this.clearLoaders();
		}
	}

	// ===========================================================================
	// HTTP Handler
	// ===========================================================================

	async handleRequest(req: Request): Promise<Response> {
		const url = new URL(req.url);

		if (req.method === "POST") {
			try {
				const body = (await req.json()) as { type: string; operation: string; input?: unknown };

				if (body.type === "query") {
					const result = await this.executeQuery(body.operation, body.input);
					return new Response(JSON.stringify({ data: result }), {
						headers: { "Content-Type": "application/json" },
					});
				}

				if (body.type === "mutation") {
					const result = await this.executeMutation(body.operation, body.input);
					return new Response(JSON.stringify({ data: result }), {
						headers: { "Content-Type": "application/json" },
					});
				}

				return new Response(JSON.stringify({ error: "Invalid request type" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				return new Response(JSON.stringify({ error: String(error) }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		return new Response("Method not allowed", { status: 405 });
	}

	// ===========================================================================
	// Server Lifecycle
	// ===========================================================================

	async listen(port: number): Promise<void> {
		this.server = Bun.serve({
			port,
			fetch: (req, server) => {
				if (server.upgrade(req)) {
					return;
				}
				return this.handleRequest(req);
			},
			websocket: {
				message: (ws, message) => {
					const conn = this.findConnectionByWs(ws);
					if (conn) {
						this.handleMessage(conn, String(message));
					}
				},
				close: (ws) => {
					const conn = this.findConnectionByWs(ws);
					if (conn) {
						this.handleDisconnect(conn);
					}
				},
			},
		});

		console.log(`Lens server listening on port ${port}`);
	}

	async close(): Promise<void> {
		if (this.server && typeof (this.server as { stop?: () => void }).stop === "function") {
			(this.server as { stop: () => void }).stop();
		}
		this.server = null;
	}

	private findConnectionByWs(ws: unknown): ClientConnection | undefined {
		for (const conn of this.connections.values()) {
			if (conn.ws === ws) {
				return conn;
			}
		}
		return undefined;
	}

	// ===========================================================================
	// Helper Methods
	// ===========================================================================

	private getEntityNameFromOutput(output: unknown): string {
		if (!output) return "unknown";
		if (typeof output === "object" && output !== null && "name" in output) {
			return (output as { name: string }).name;
		}
		if (Array.isArray(output) && output.length > 0) {
			const first = output[0];
			if (typeof first === "object" && first !== null && "name" in first) {
				return (first as { name: string }).name;
			}
		}
		return "unknown";
	}

	private getEntityNameFromMutation(name: string): string {
		const mutationDef = this.mutations[name];
		if (!mutationDef) return "unknown";
		return this.getEntityNameFromOutput(mutationDef._output);
	}

	private extractEntities(
		entityName: string,
		data: unknown,
	): Array<{ entity: string; id: string; entityData: Record<string, unknown> }> {
		const results: Array<{ entity: string; id: string; entityData: Record<string, unknown> }> = [];

		if (!data) return results;

		if (Array.isArray(data)) {
			for (const item of data) {
				if (item && typeof item === "object" && "id" in item) {
					results.push({
						entity: entityName,
						id: String((item as { id: unknown }).id),
						entityData: item as Record<string, unknown>,
					});
				}
			}
		} else if (typeof data === "object" && "id" in data) {
			results.push({
				entity: entityName,
				id: String((data as { id: unknown }).id),
				entityData: data as Record<string, unknown>,
			});
		}

		return results;
	}

	private applySelection(data: unknown, fields: string[] | "*"): unknown {
		if (fields === "*" || !data) return data;

		if (Array.isArray(data)) {
			return data.map((item) => this.applySelectionToObject(item, fields));
		}

		return this.applySelectionToObject(data, fields);
	}

	private applySelectionToObject(
		data: unknown,
		fields: string[],
	): Record<string, unknown> | null {
		if (!data || typeof data !== "object") return null;

		const result: Record<string, unknown> = {};
		const obj = data as Record<string, unknown>;

		// Always include id
		if ("id" in obj) {
			result.id = obj.id;
		}

		for (const field of fields) {
			if (field in obj) {
				result[field] = obj[field];
			}
		}

		return result;
	}

	private computeUpdates(
		oldData: unknown,
		newData: unknown,
	): Record<string, Update> | null {
		if (!oldData || !newData) return null;
		if (typeof oldData !== "object" || typeof newData !== "object") return null;

		const updates: Record<string, Update> = {};
		const oldObj = oldData as Record<string, unknown>;
		const newObj = newData as Record<string, unknown>;

		for (const key of Object.keys(newObj)) {
			const oldValue = oldObj[key];
			const newValue = newObj[key];

			if (!this.deepEqual(oldValue, newValue)) {
				updates[key] = createUpdate(oldValue, newValue);
			}
		}

		return Object.keys(updates).length > 0 ? updates : null;
	}

	private deepEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (typeof a !== typeof b) return false;
		if (typeof a !== "object" || a === null || b === null) return false;

		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;

		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);

		if (aKeys.length !== bKeys.length) return false;

		for (const key of aKeys) {
			if (!this.deepEqual(aObj[key], bObj[key])) return false;
		}

		return true;
	}

	private clearLoaders(): void {
		for (const loader of this.loaders.values()) {
			loader.clear();
		}
		this.loaders.clear();
	}
}

// =============================================================================
// Utility
// =============================================================================

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
	return (
		value !== null && typeof value === "object" && Symbol.asyncIterator in value
	);
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create unified Lens server with Operations API + Optimization Layer
 */
export function createUnifiedServer<TContext extends ContextValue = ContextValue>(
	config: UnifiedServerConfig<TContext>,
): UnifiedServer {
	return new UnifiedServerImpl(config);
}
