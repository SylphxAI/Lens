# Unified Architecture: V2 Operations + V1 Optimization

## Goal

Combine V2's **Free Operations API** with V1's **Optimization Layer** to achieve:
- Any query/mutation (not CRUD-locked)
- Query deduplication & derivation
- Field-level subscriptions with refCount
- Per-client minimal diff transfer
- Request batching
- EntitySignal for fine-grained reactivity

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Unified Client API                             │   │
│  │   client.whoami()                                                     │   │
│  │   client.searchUsers({ query: 'john' }).select({ name: true })       │   │
│  │   client.user({ id: '1' }).select({ posts: { title: true } })        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        QueryResolver                                  │   │
│  │   - canDerive(): Check if query can use existing subscription        │   │
│  │   - deduplication: Same query = same subscription                    │   │
│  │   - batching: Batch multiple queries in 10ms window                  │   │
│  │   - inFlight: Track pending requests                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     SubscriptionManager                               │   │
│  │   - Field-level subscriptions with refCount                          │   │
│  │   - queueSubscribe/queueUnsubscribe: Batch server messages           │   │
│  │   - handleServerUpdate: Apply updates to EntitySignals               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        EntitySignal                                   │   │
│  │   - Per-field signals for fine-grained reactivity                    │   │
│  │   - onFieldAccess: Auto-subscribe when field accessed                │   │
│  │   - onDispose: Auto-cleanup subscriptions                            │   │
│  │   - deriveEntitySignal: Create subset view                           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ WebSocket (field-level protocol)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVER                                          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Operations Engine                                 │   │
│  │   - query() definitions (whoami, searchUsers, user, etc.)            │   │
│  │   - mutation() definitions (createPost, updateUser, etc.)            │   │
│  │   - Entity Resolvers (User.posts, Post.author)                       │   │
│  │   - DataLoader for N+1 batching                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     GraphStateManager                                 │   │
│  │   - canonical: Server truth (authoritative state)                    │   │
│  │   - clientStates: Per-client last-known state                        │   │
│  │   - computeMinimalDiff: Only send changed fields                     │   │
│  │   - field-level subscriptions: Track what each client needs          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### 1. Query Derivation (canDerive)

When `user.get({ id: 1 })` is already subscribed (all fields), a new query
`user.get({ id: 1 }).select({ name: true })` should NOT create a new subscription.
Instead, it derives from the existing one.

```typescript
// QueryResolver.resolveQuery()
const canDerive = this.subscriptionManager.canDerive(queryKey, requestedFields);
if (canDerive) {
  const source = this.subscriptionManager.getSignal(queryKey);
  return deriveEntitySignal(source, requestedFields);
}
```

### 2. Reference Counting

Multiple components subscribing to same data share ONE subscription:

```typescript
// Component A subscribes
client.user({ id: '1' }).select({ name: true })  // refCount: 1

// Component B subscribes (same query)
client.user({ id: '1' }).select({ name: true })  // refCount: 2

// Component A disposes
// refCount: 1 (still subscribed!)

// Component B disposes
// refCount: 0 → unsubscribe from server
```

### 3. Field-Level Subscriptions

Server tracks exactly which fields each client needs:

```
Client A: user:1 → { name, email }
Client B: user:1 → { name, posts }

When user:1.bio changes:
  → Neither client receives update (they don't subscribe to bio)

When user:1.name changes:
  → Both clients receive update
```

### 4. Subscription Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Subscription Lifecycle                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Query Created                                            │
│     client.user({ id: '1' })                                │
│         │                                                    │
│         ▼                                                    │
│  2. QueryResolver checks canDerive                          │
│         │                                                    │
│         ├─→ YES: Return derived signal (no server call)     │
│         │                                                    │
│         └─→ NO: Create new subscription                     │
│                   │                                          │
│                   ▼                                          │
│  3. SubscriptionManager.subscribe()                         │
│         │                                                    │
│         ├─→ refCount++ for each field                       │
│         │                                                    │
│         └─→ If refCount 0→1: Send subscribe to server       │
│                                                              │
│  4. Server sends updates via GraphStateManager              │
│         │                                                    │
│         └─→ EntitySignal updated, UI reacts                 │
│                                                              │
│  5. Component disposes                                       │
│         │                                                    │
│         └─→ refCount-- for each field                       │
│               │                                              │
│               └─→ If refCount 1→0: Send unsubscribe         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## API Design

### Client API (Flat Namespace)

```typescript
const client = createClient({
  queries,
  mutations,
  transport: websocketTransport({ url: 'ws://localhost:3000' }),
});

// Operations are directly on client (not client.query.xxx)
const me = await client.whoami();
const users = await client.searchUsers({ query: 'john' });

// With selection
const user = await client.user({ id: '1' }).select({
  name: true,
  posts: { select: { title: true } },
});

// Streaming subscription
const unsubscribe = client.activeUsers().subscribe(users => {
  console.log('Active users:', users);
});

// Mutations
const result = await client.createPost({
  title: 'Hello',
  content: 'World',
});
```

### Server API

```typescript
const server = createServer({
  entities: { User, Post },
  queries: { whoami, searchUsers, user },
  mutations: { createPost, updateUser },
  resolvers: entityResolvers({
    User: {
      posts: (user) => db.post.findMany({ where: { authorId: user.id } }),
    },
    Post: {
      author: {
        batch: async (posts) => {
          // N+1 prevention
          const ids = [...new Set(posts.map(p => p.authorId))];
          const authors = await db.user.findMany({ where: { id: { in: ids } } });
          return posts.map(p => authors.find(a => a.id === p.authorId));
        },
      },
    },
  }),
  context: async (req) => ({
    db: prisma,
    currentUser: await getUser(req),
  }),
});
```

---

## Protocol (WebSocket Messages)

### Client → Server

```typescript
// Subscribe to operation result
{ type: "subscribe", id: "sub_1", operation: "user", input: { id: "1" }, fields: ["name", "email"] }

// Update subscription fields
{ type: "updateFields", id: "sub_1", addFields: ["posts"], removeFields: ["email"] }

// Unsubscribe
{ type: "unsubscribe", id: "sub_1" }

// Query (one-time)
{ type: "query", id: "q_1", operation: "searchUsers", input: { query: "john" } }

// Mutation
{ type: "mutation", id: "m_1", operation: "createPost", input: { title: "Hello" } }
```

### Server → Client

```typescript
// Full data (first response)
{ type: "data", id: "sub_1", data: { id: "1", name: "Alice", email: "alice@example.com" } }

// Incremental update (subsequent)
{ type: "update", id: "sub_1", updates: { name: { strategy: "value", value: "Bob" } } }

// Result (for queries/mutations)
{ type: "result", id: "q_1", data: [...] }

// Error
{ type: "error", id: "sub_1", error: { code: "NOT_FOUND", message: "User not found" } }
```

---

## Implementation Phases

### Phase 1: Design (This Document) ✅

### Phase 2: Server Integration
- Integrate GraphStateManager with Operations Engine
- Per-client state tracking
- Field-level subscription protocol

### Phase 3: Client QueryResolver
- Operation-based query resolution
- canDerive logic for Operations
- Request batching

### Phase 4: Client SubscriptionManager
- Field-level subscriptions for Operations
- Reference counting
- Server communication

### Phase 5: EntitySignal Integration
- Connect Operations to EntitySignal
- Fine-grained reactivity
- Auto-subscribe on field access

### Phase 6: Unified API
- Flat namespace (client.whoami vs client.query.whoami)
- Replace createClientV2/createServerV2 with createClient/createServer

### Phase 7: Testing & Validation
- E2E tests for all scenarios
- Performance benchmarks
- Migration guide

---

## Key Files to Modify

### Server
- `packages/server/src/server/create-v2.ts` → Integrate GraphStateManager
- `packages/server/src/state/graph-state-manager.ts` → Support Operations

### Client
- `packages/client/src/client/client-v2.ts` → Integrate QueryResolver
- `packages/client/src/reactive/query-resolver.ts` → Support Operations
- `packages/client/src/reactive/subscription-manager.ts` → Operations protocol
- `packages/client/src/reactive/entity-signal.ts` → Already good

### New Files
- `packages/client/src/client/unified.ts` → New unified client
- `packages/server/src/server/unified.ts` → New unified server
