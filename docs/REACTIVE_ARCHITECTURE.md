# Lens Reactive Architecture

## Vision

Lens provides a **declarative, reactive API** where:
- Everything returns a Signal - naturally reactive
- Fine-grained field-level subscriptions minimize transfer
- Server implements reactivity - client automatically benefits
- User code is dead simple

```typescript
// User just declares what they want
const user = api.user.get({ id: "123" });
const posts = api.post.list({ authorId: user.$.id });

// UI is automatically reactive
<div>{user.$.name.value}</div>  // Only re-renders when name changes
<div>{post.$.text.value}</div>   // Streaming delta for LLM text
```

## Core Concepts

### 1. EntitySignal

Every entity query returns an `EntitySignal` with field-level signals:

```typescript
interface EntitySignal<T> {
  // Field-level signals (source of truth)
  readonly $: { [K in keyof T]: Signal<T[K]> };

  // Computed value from all fields
  readonly value: T;

  // Metadata signals
  readonly loading: Signal<boolean>;
  readonly error: Signal<Error | null>;

  // Lifecycle
  dispose(): void;
}
```

### 2. Fine-grained Reactivity

```typescript
// Coarse: tracks ALL fields, any change re-renders
<div>{user.value.name}</div>

// Fine: tracks ONLY name, other changes don't re-render
<div>{user.$.name.value}</div>
```

### 3. Query Resolution

```typescript
// First query fetches full entity
const user = api.user.get({ id });
// Server: SUBSCRIBE User:123 [*]

// Second query derives from existing (no network request!)
const userName = api.user.get({ id }, { select: { name: true } });
// Internal: computed from user.$.name

// First disposes
user.dispose();
// Server: UNSUBSCRIBE User:123 [bio, email, ...] (keep only name)

// userName continues working independently
```

### 4. Field-level Subscriptions

```typescript
// Client tracks which fields are subscribed
type FieldSubscription = {
  refCount: number;
  signal: WritableSignal<unknown>;
};

type EntitySubscription = {
  fields: Map<string, FieldSubscription>;
  fullEntityRefs: number;  // How many are subscribed to ALL fields
};
```

### 5. Server Protocol

```typescript
// Client → Server
{ type: "subscribe", entity: "User", id: "123", fields: ["name", "bio"] }
{ type: "unsubscribe", entity: "User", id: "123", fields: ["bio"] }

// Server → Client
{ type: "update", entity: "User", id: "123", field: "name", strategy: "delta", data: [...] }
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Application Layer                                          │
│                                                             │
│  const user = api.user.get({ id })                          │
│  <div>{user.$.name.value}</div>                             │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  EntitySignal                                               │
│                                                             │
│  - $ : field-level signals                                  │
│  - value : computed from fields                             │
│  - dispose() : cleanup subscriptions                        │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  SubscriptionManager                                        │
│                                                             │
│  - Track field-level refCounts                              │
│  - Manage subscribe/unsubscribe to server                   │
│  - Apply server updates to field signals                    │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  QueryResolver                                              │
│                                                             │
│  - Check if query can be derived from existing              │
│  - Batch multiple queries into single request               │
│  - Smart caching with stale-while-revalidate                │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Transport (Links)                                          │
│                                                             │
│  - HTTP for initial fetch                                   │
│  - SSE/WebSocket for push updates                           │
│  - Automatic reconnection                                   │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Server                                                     │
│                                                             │
│  - Track subscriptions per client                           │
│  - Push updates using optimal strategy (delta/patch/value)  │
│  - Only push subscribed fields                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Update Strategies

| Data Type | Strategy | Use Case |
|-----------|----------|----------|
| String (short) | value | Names, titles |
| String (long) | delta | LLM streaming, documents |
| Object | patch | Profile updates |
| Array | patch | List modifications |
| Primitive | value | Numbers, booleans |

## Implementation Plan

### Phase 1: EntitySignal ✅
- [x] Create EntitySignal class with field-level signals
- [x] Implement computed value derivation
- [x] Add dispose lifecycle

**Files:**
- `packages/client/src/reactive/entity-signal.ts`
- `packages/client/src/reactive/entity-signal.test.ts` (13 tests)

### Phase 2: SubscriptionManager ✅
- [x] Field-level subscription tracking
- [x] RefCount management
- [x] Subscribe/unsubscribe protocol

**Files:**
- `packages/client/src/reactive/subscription-manager.ts`
- `packages/client/src/reactive/subscription-manager.test.ts` (22 tests)

### Phase 3: QueryResolver ✅
- [x] Query deduplication
- [x] Derive from existing data
- [x] Request batching

**Files:**
- `packages/client/src/reactive/query-resolver.ts`
- `packages/client/src/reactive/query-resolver.test.ts` (15 tests)

### Phase 4: Server Protocol ✅
- [x] Subscription messages
- [x] Push update handling
- [x] Strategy-based updates

**Files:**
- `packages/server/src/subscriptions/handler.ts`
- `packages/server/src/subscriptions/handler.test.ts` (19 tests)

### Phase 5: Integration ✅
- [x] Update client API (ReactiveClient)
- [ ] Update React hooks (future)
- [ ] End-to-end tests (future)

**Files:**
- `packages/client/src/reactive/reactive-client.ts`

## Usage

### Client-side

```typescript
import { createReactiveClient, httpLink } from "@lens/client";

const client = createReactiveClient({
  links: [httpLink({ url: "/api" })],
});

// Get user with fine-grained reactivity
const user = client.User.get("123");

// Coarse-grained (re-renders when ANY field changes)
<div>{user.value.value.name}</div>

// Fine-grained (re-renders ONLY when name changes)
<div>{user.$.name.value}</div>

// Partial select (only subscribes to selected fields)
const userName = client.User.get("123", { select: { name: true } });
<div>{userName.$.name.value}</div>

// Cleanup
user.dispose();
```

### Server-side

```typescript
import { createSubscriptionHandler } from "@lens/server";

const handler = createSubscriptionHandler({
  onSubscriptionChange: (entity, id, fields) => {
    console.log(`Subscription changed: ${entity}:${id}`, fields);
  },
});

// Handle WebSocket connection
ws.on("connection", (socket) => {
  handler.addClient({
    id: socket.id,
    send: (msg) => socket.send(JSON.stringify(msg)),
    close: () => socket.close(),
  });

  socket.on("message", (data) => {
    handler.handleMessage(socket.id, JSON.parse(data));
  });

  socket.on("close", () => {
    handler.removeClient(socket.id);
  });
});

// Push updates when data changes
handler.pushUpdate("User", "123", "name", {
  strategy: "value",
  data: "New Name",
});

// Or for streaming text (LLM)
handler.pushUpdate("Message", "456", "content", {
  strategy: "delta",
  data: [{ position: 0, insert: "Hello " }],
});
```
