# Lens Implementation Plan

> From Zero to World-Changing

---

## Phase Overview

```
Phase 1: Core Foundation
├── Schema Type System
├── Type Inference Engine
└── Shared Utilities

Phase 2: Server Runtime
├── Resolver System
├── Graph Execution
├── Update Strategies
└── WebSocket Handler

Phase 3: Client Runtime
├── Reactive Store (Signals)
├── Transport Layer
├── Optimistic Engine
└── Relation Resolution

Phase 4: React Integration
├── Hooks
├── Suspense Support
└── DevTools

Phase 5: Polish & Release
├── Documentation
├── Examples
├── Performance
└── Testing
```

---

## Phase 1: Core Foundation

**Goal**: Build the type system that powers everything.

### 1.1 Schema Type Builder

```typescript
// packages/core/src/schema/types.ts

// Type builder DSL
export const t = {
  id: () => new IdType(),
  string: () => new StringType(),
  int: () => new IntType(),
  float: () => new FloatType(),
  boolean: () => new BooleanType(),
  datetime: () => new DateTimeType(),
  enum: <T extends readonly string[]>(values: T) => new EnumType<T>(),
  object: <T>() => new ObjectType<T>(),
  array: <T>(item: Type<T>) => new ArrayType<T>(),

  // Relations
  hasOne: <T extends string>(target: T) => new HasOneType<T>(),
  hasMany: <T extends string>(target: T) => new HasManyType<T>(),
  belongsTo: <T extends string>(target: T) => new BelongsToType<T>(),
};
```

### 1.2 Schema Creation

```typescript
// packages/core/src/schema/create.ts

export function createSchema<T extends SchemaDefinition>(def: T): Schema<T> {
  // Validate schema
  // Build relation graph
  // Generate type metadata
  return new Schema(def);
}
```

### 1.3 Type Inference

```typescript
// packages/core/src/schema/infer.ts

// Infer entity type from schema
export type InferEntity<T> = {
  [K in ScalarFields<T>]: InferScalar<T[K]>;
} & {
  [K in RelationFields<T>]: InferRelation<T[K]>;
};

// Infer selected type
export type InferSelected<T, S extends Select<T>> = {
  [K in keyof S & keyof T]: S[K] extends true
    ? T[K]
    : S[K] extends { select: infer RS }
      ? InferSelected<T[K], RS>
      : never;
};
```

### 1.4 Update Strategies

```typescript
// packages/core/src/updates/strategies.ts

export interface UpdateStrategy {
  name: 'value' | 'delta' | 'patch';
  encode(prev: any, next: any): any;
  decode(current: any, update: any): any;
}

export const valueStrategy: UpdateStrategy = { ... };
export const deltaStrategy: UpdateStrategy = { ... };
export const patchStrategy: UpdateStrategy = { ... };

export function selectStrategy(type: FieldType, prev: any, next: any): UpdateStrategy;
```

### Deliverables

- [ ] `t.*` type builders with full inference
- [ ] `createSchema()` with validation
- [ ] `InferEntity<T>` type inference
- [ ] `InferSelected<T, S>` selection inference
- [ ] Update strategy implementations
- [ ] 100% test coverage

---

## Phase 2: Server Runtime

**Goal**: Build the resolver and execution system.

### 2.1 Resolver Definition

```typescript
// packages/server/src/resolvers/create.ts

export function createResolvers<S extends Schema>(
  schema: S,
  resolvers: ResolverDefinition<S>
): Resolvers<S> {
  // Validate resolvers match schema
  // Set up DataLoader factories
  // Build resolver graph
  return new Resolvers(schema, resolvers);
}
```

### 2.2 Graph Execution Engine

```typescript
// packages/server/src/execution/engine.ts

export class ExecutionEngine {
  // Execute query with field selection
  async execute<E extends Entity>(
    entity: E,
    id: string,
    select: Select<E>,
  ): Promise<Selected<E, typeof select>>;

  // Subscribe to entity updates
  subscribe<E extends Entity>(
    entity: E,
    id: string,
    select: Select<E>,
  ): AsyncIterable<Selected<E, typeof select>>;
}
```

### 2.3 DataLoader Integration

```typescript
// packages/server/src/execution/dataloader.ts

export class GraphDataLoader {
  // Automatic batching for N+1 elimination
  load<E extends Entity>(entity: E, id: string): Promise<E>;
  loadMany<E extends Entity>(entity: E, ids: string[]): Promise<E[]>;

  // Relation loading with batching
  loadRelation<E extends Entity, R extends Relation>(
    entity: E,
    relation: R,
    parentIds: string[],
  ): Promise<Map<string, RelationType<R>[]>>;
}
```

### 2.4 WebSocket Handler

```typescript
// packages/server/src/transport/websocket.ts

export function createWebSocketHandler(
  engine: ExecutionEngine,
): WebSocketHandler {
  return {
    onConnection(ws) { ... },
    onMessage(ws, message) { ... },
    onClose(ws) { ... },
  };
}
```

### Deliverables

- [ ] `createResolvers()` with validation
- [ ] Execution engine with selection
- [ ] DataLoader with automatic batching
- [ ] AsyncIterable resolver support (yield)
- [ ] Update strategy encoding
- [ ] WebSocket handler
- [ ] HTTP handler (fallback)
- [ ] 100% test coverage

---

## Phase 3: Client Runtime

**Goal**: Build the reactive client with signals.

### 3.1 Reactive Store

```typescript
// packages/client/src/store/reactive-store.ts

export class ReactiveStore {
  // Entity signals
  private entities: Map<string, Signal<any>>;

  // Get or create entity signal
  getEntity<E>(entity: string, id: string): Signal<E | null>;

  // Apply server update
  applyUpdate(update: ServerUpdate): void;

  // Optimistic updates
  applyOptimistic(mutation: Mutation): string;  // Returns optimistic ID
  confirmOptimistic(id: string): void;
  rollbackOptimistic(id: string): void;
}
```

### 3.2 Signal Implementation

```typescript
// packages/client/src/signals/signal.ts

export interface Signal<T> {
  readonly value: T;
  subscribe(fn: (value: T) => void): () => void;
}

export function createSignal<T>(initial: T): WritableSignal<T>;
export function computed<T>(fn: () => T): Signal<T>;
```

### 3.3 Client API

```typescript
// packages/client/src/client.ts

export function createClient<S extends Schema>(config: ClientConfig): Client<S> {
  return {
    [entity]: {
      get: (input, options?) => Signal<Entity>,
      list: (input?, options?) => Signal<Entity[]>,
      create: (input) => Promise<Entity>,
      update: (input) => Promise<Entity>,
      delete: (input) => Promise<void>,
    },
  };
}
```

### 3.4 Transport Layer

```typescript
// packages/client/src/transport/websocket.ts

export class WebSocketTransport {
  connect(): Promise<void>;
  subscribe(entity: string, id: string, select: Select): Subscription;
  mutate(mutation: Mutation): Promise<Result>;
  close(): void;
}
```

### Deliverables

- [ ] Signal implementation (value, computed)
- [ ] ReactiveStore with entity management
- [ ] Optimistic update engine
- [ ] WebSocket transport
- [ ] Auto-reconnection
- [ ] Field selection optimization
- [ ] Relation resolution
- [ ] 100% test coverage

---

## Phase 4: React Integration

**Goal**: Seamless React integration.

### 4.1 React Hooks

```typescript
// packages/react/src/hooks.ts

// Use entity signal in React
export function useEntity<E>(
  accessor: EntityAccessor<E>,
  input: { id: string },
  options?: SelectOptions,
): Signal<E | null>;

// Use list signal in React
export function useList<E>(
  accessor: ListAccessor<E>,
  input?: ListInput,
  options?: SelectOptions,
): Signal<E[]>;

// Use mutation with optimistic
export function useMutation<I, O>(
  mutator: Mutator<I, O>,
): MutationResult<I, O>;

// Computed value
export function useComputed<T>(fn: () => T): T;
```

### 4.2 Provider

```typescript
// packages/react/src/provider.tsx

export function LensProvider({
  client,
  children,
}: {
  client: Client;
  children: React.ReactNode;
}) {
  return (
    <LensContext.Provider value={client}>
      {children}
    </LensContext.Provider>
  );
}
```

### 4.3 Suspense Support

```typescript
// packages/react/src/suspense.ts

export function useEntitySuspense<E>(
  accessor: EntityAccessor<E>,
  input: { id: string },
): E;  // Throws promise if loading
```

### Deliverables

- [ ] `useEntity` hook
- [ ] `useList` hook
- [ ] `useMutation` hook
- [ ] `useComputed` hook
- [ ] `LensProvider`
- [ ] Suspense support
- [ ] Error boundaries
- [ ] DevTools integration
- [ ] 100% test coverage

---

## Phase 5: Polish & Release

**Goal**: Production-ready release.

### 5.1 Documentation

- [ ] Complete API reference
- [ ] Getting started guide
- [ ] Migration guide (from tRPC/GraphQL)
- [ ] Best practices
- [ ] Examples repository

### 5.2 Examples

- [ ] Basic CRUD
- [ ] Real-time chat
- [ ] LLM streaming
- [ ] Collaborative editing
- [ ] Full-stack Next.js

### 5.3 Performance

- [ ] Benchmarks
- [ ] Memory profiling
- [ ] Bundle size optimization
- [ ] Tree-shaking verification

### 5.4 Testing

- [ ] Unit tests (100% coverage)
- [ ] Integration tests
- [ ] E2E tests
- [ ] Load tests

### 5.5 Release

- [ ] Changelog
- [ ] Semantic versioning
- [ ] NPM publish
- [ ] GitHub release

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Core | 1 week | 🚧 Starting |
| Phase 2: Server | 1 week | ⏳ Pending |
| Phase 3: Client | 1 week | ⏳ Pending |
| Phase 4: React | 3 days | ⏳ Pending |
| Phase 5: Polish | 1 week | ⏳ Pending |

---

## Success Criteria

### Functional

- [ ] Full type inference from schema to client
- [ ] Real-time updates work transparently
- [ ] Streaming fields work without special handling
- [ ] Optimistic updates are automatic
- [ ] N+1 queries are eliminated
- [ ] Transfer is optimized (delta/patch)

### Performance

- [ ] < 10KB gzipped client bundle
- [ ] < 1ms overhead per operation
- [ ] < 100ms p99 latency

### Developer Experience

- [ ] Zero configuration required
- [ ] Full autocomplete in IDE
- [ ] Helpful error messages
- [ ] Comprehensive documentation

---

## Let's Build This! 🚀
