/**
 * @lens/client - In-Process Transport
 *
 * Direct transport for same-process client-server communication.
 * No network overhead - calls resolvers directly.
 *
 * Use cases:
 * - Server-side rendering (SSR)
 * - Testing
 * - CLI tools
 * - Edge functions
 */

import type {
	Transport,
	ConnectionState,
	SubscribeInput,
	QueryInput,
	MutateInput,
	ServerMessage,
} from "./types";

// =============================================================================
// Types
// =============================================================================

/** Resolver function signatures */
export interface InProcessResolvers {
	/** Get single entity by ID */
	get: (entity: string, id: string, select?: Record<string, unknown>) => Promise<unknown>;
	/** List entities with filters */
	list: (
		entity: string,
		input: {
			where?: Record<string, unknown>;
			orderBy?: Record<string, "asc" | "desc">;
			take?: number;
			skip?: number;
			select?: Record<string, unknown>;
		},
	) => Promise<unknown[]>;
	/** Create entity */
	create: (entity: string, data: Record<string, unknown>) => Promise<unknown>;
	/** Update entity */
	update: (entity: string, id: string, data: Record<string, unknown>) => Promise<unknown>;
	/** Delete entity */
	delete: (entity: string, id: string) => Promise<void>;
	/** Subscribe to entity changes (optional) */
	subscribe?: (
		entity: string,
		id: string,
		callback: (data: unknown) => void,
	) => () => void;
}

export interface InProcessTransportConfig {
	/** Direct resolver functions */
	resolvers: InProcessResolvers;
	/** Optional context factory (called for each operation) */
	createContext?: () => unknown | Promise<unknown>;
}

// =============================================================================
// In-Process Transport Implementation
// =============================================================================

/**
 * In-Process transport for direct resolver calls
 *
 * @example
 * ```typescript
 * // Server-side usage (SSR)
 * const transport = new InProcessTransport({
 *   resolvers: {
 *     get: (entity, id) => db[entity].findUnique({ where: { id } }),
 *     list: (entity, input) => db[entity].findMany(input),
 *     create: (entity, data) => db[entity].create({ data }),
 *     update: (entity, id, data) => db[entity].update({ where: { id }, data }),
 *     delete: (entity, id) => db[entity].delete({ where: { id } }),
 *   },
 * });
 *
 * const client = new LensClient({ transport });
 * const user = await client.User.get("user-1"); // Direct call, no network
 * ```
 */
export class InProcessTransport implements Transport {
	private config: InProcessTransportConfig;
	private _state: ConnectionState = "disconnected";
	private stateListeners = new Set<(state: ConnectionState) => void>();
	private messageListeners = new Set<(message: ServerMessage) => void>();
	private subscriptions = new Map<string, () => void>();
	private subscriptionCounter = 0;

	constructor(config: InProcessTransportConfig) {
		this.config = config;
	}

	// ===========================================================================
	// Transport Interface
	// ===========================================================================

	get state(): ConnectionState {
		return this._state;
	}

	async connect(): Promise<void> {
		// In-process is always "connected"
		this.setState("connected");
	}

	disconnect(): void {
		// Cleanup subscriptions
		for (const unsubscribe of this.subscriptions.values()) {
			unsubscribe();
		}
		this.subscriptions.clear();
		this.setState("disconnected");
	}

	async subscribe(input: SubscribeInput): Promise<unknown> {
		const subscriptionId = `sub_${++this.subscriptionCounter}`;

		// Get initial data
		const data = await this.config.resolvers.get(
			input.entity,
			input.id,
			input.select,
		);

		// Setup subscription if supported
		if (this.config.resolvers.subscribe) {
			const unsubscribe = this.config.resolvers.subscribe(
				input.entity,
				input.id,
				(updatedData) => {
					this.notifyMessage({
						type: "data",
						subscriptionId,
						data: updatedData,
					});
				},
			);
			this.subscriptions.set(subscriptionId, unsubscribe);
		}

		return data;
	}

	unsubscribe(subscriptionId: string): void {
		const unsubscribe = this.subscriptions.get(subscriptionId);
		if (unsubscribe) {
			unsubscribe();
			this.subscriptions.delete(subscriptionId);
		}
	}

	async query(input: QueryInput): Promise<unknown> {
		const { resolvers } = this.config;

		switch (input.type) {
			case "get":
				return resolvers.get(
					input.entity,
					input.where?.id as string,
					input.select,
				);

			case "list":
				return resolvers.list(input.entity, {
					where: input.where,
					orderBy: input.orderBy,
					take: input.take,
					skip: input.skip,
					select: input.select,
				});

			default:
				throw new Error(`Unknown query type: ${input.type}`);
		}
	}

	async mutate(input: MutateInput): Promise<unknown> {
		const { resolvers } = this.config;
		const data = input.input as Record<string, unknown>;

		switch (input.operation) {
			case "create":
				return resolvers.create(input.entity, data);

			case "update": {
				const { id, ...updateData } = data;
				return resolvers.update(input.entity, id as string, updateData);
			}

			case "delete":
				await resolvers.delete(input.entity, data.id as string);
				return { success: true };

			default:
				throw new Error(`Unknown mutation operation: ${input.operation}`);
		}
	}

	onStateChange(callback: (state: ConnectionState) => void): () => void {
		this.stateListeners.add(callback);
		return () => this.stateListeners.delete(callback);
	}

	onMessage(callback: (message: ServerMessage) => void): () => void {
		this.messageListeners.add(callback);
		return () => this.messageListeners.delete(callback);
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	private setState(state: ConnectionState): void {
		this._state = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}

	private notifyMessage(message: ServerMessage): void {
		for (const listener of this.messageListeners) {
			listener(message);
		}
	}
}

// =============================================================================
// Factory from ExecutionEngine
// =============================================================================

/**
 * Create in-process transport from Lens server ExecutionEngine
 *
 * @example
 * ```typescript
 * import { ExecutionEngine, createResolvers } from "@lens/server";
 * import { createInProcessTransport } from "@lens/client";
 *
 * const resolvers = createResolvers(schema, { ... });
 * const engine = new ExecutionEngine(schema, resolvers);
 *
 * const transport = createInProcessTransport(engine);
 * const client = new LensClient({ transport });
 * ```
 */
export function createInProcessTransport(
	engine: {
		executeGet: (entity: string, id: string, select?: unknown, ctx?: unknown) => Promise<unknown>;
		executeList: (entity: string, input: unknown, ctx?: unknown) => Promise<unknown[]>;
		executeCreate: (entity: string, data: unknown, ctx?: unknown) => Promise<unknown>;
		executeUpdate: (entity: string, id: string, data: unknown, ctx?: unknown) => Promise<unknown>;
		executeDelete: (entity: string, id: string, ctx?: unknown) => Promise<void>;
	},
	options?: { createContext?: () => unknown | Promise<unknown> },
): InProcessTransport {
	return new InProcessTransport({
		resolvers: {
			get: (entity, id, select) => engine.executeGet(entity, id, select),
			list: (entity, input) => engine.executeList(entity, input),
			create: (entity, data) => engine.executeCreate(entity, data),
			update: (entity, id, data) => engine.executeUpdate(entity, id, data),
			delete: (entity, id) => engine.executeDelete(entity, id),
		},
		createContext: options?.createContext,
	});
}
