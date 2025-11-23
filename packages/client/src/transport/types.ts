/**
 * @lens/client - Transport Types
 *
 * Transport layer interfaces for client-server communication.
 */

// =============================================================================
// Message Types
// =============================================================================

/** Subscribe message */
export interface SubscribeMessage {
	type: "subscribe";
	id: string;
	entity: string;
	entityId: string;
	select?: Record<string, unknown>;
}

/** Unsubscribe message */
export interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
}

/** Mutation message */
export interface MutateMessage {
	type: "mutate";
	id: string;
	entity: string;
	operation: "create" | "update" | "delete";
	input: Record<string, unknown>;
}

/** Query message */
export interface QueryMessage {
	type: "query";
	id: string;
	entity: string;
	queryType: "get" | "list";
	input?: Record<string, unknown>;
}

/** Client -> Server message */
export type ClientMessage =
	| SubscribeMessage
	| UnsubscribeMessage
	| MutateMessage
	| QueryMessage;

/** Data message (initial/full data) */
export interface DataMessage {
	type: "data";
	subscriptionId: string;
	data: unknown;
}

/** Update message (partial update) */
export interface UpdateMessage {
	type: "update";
	subscriptionId: string;
	field?: string;
	strategy: "value" | "delta" | "patch";
	data: unknown;
}

/** Mutation result message */
export interface ResultMessage {
	type: "result";
	mutationId: string;
	data: unknown;
}

/** Error message */
export interface ErrorMessage {
	type: "error";
	id: string;
	error: {
		code: string;
		message: string;
	};
}

/** Server -> Client message */
export type ServerMessage = DataMessage | UpdateMessage | ResultMessage | ErrorMessage;

// =============================================================================
// Transport Interface
// =============================================================================

/** Transport configuration */
export interface TransportConfig {
	/** WebSocket URL */
	url: string;
	/** HTTP fallback URL */
	httpUrl?: string;
	/** Reconnect automatically */
	autoReconnect?: boolean;
	/** Max reconnect attempts */
	maxReconnectAttempts?: number;
	/** Reconnect delay in ms */
	reconnectDelay?: number;
}

/** Connection state */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

/** Subscription input */
export interface SubscribeInput {
	entity: string;
	id: string;
	select?: Record<string, unknown>;
}

/** Query input */
export interface QueryInput {
	entity: string;
	type: "get" | "list";
	where?: Record<string, unknown>;
	orderBy?: Record<string, "asc" | "desc">;
	take?: number;
	skip?: number;
	select?: Record<string, unknown>;
}

/** Mutation input */
export interface MutateInput {
	entity: string;
	operation: "create" | "update" | "delete";
	input: Record<string, unknown>;
}

/**
 * Transport interface for client-server communication
 */
export interface Transport {
	/** Current connection state */
	readonly state: ConnectionState;

	/** Connect to server */
	connect(): Promise<void>;

	/** Disconnect from server */
	disconnect(): void;

	/** Subscribe to entity updates */
	subscribe(input: SubscribeInput): Promise<unknown>;

	/** Unsubscribe from entity updates */
	unsubscribe(subscriptionId: string): void;

	/** Execute a query */
	query(input: QueryInput): Promise<unknown>;

	/** Execute a mutation */
	mutate(input: MutateInput): Promise<unknown>;

	/** Add connection state listener */
	onStateChange(callback: (state: ConnectionState) => void): () => void;

	/** Add message listener */
	onMessage(callback: (message: ServerMessage) => void): () => void;
}
