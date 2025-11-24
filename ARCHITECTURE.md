# Lens Architecture

> **TypeScript-first, Reactive Graph API Framework**
> Single Source of Truth (SSOT) Document

---

## Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "Everything is Reactive. Everything can Stream."          │
│                                                             │
│   - Zero distinction between query and subscription         │
│   - Server emits, Client receives                           │
│   - Frontend-driven: Client decides single or stream        │
│   - Optimistic by default                                   │
│   - Auto-optimized: Minimal server communication            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **TypeScript-First** - Full type inference, same code runs on client and server
2. **Frontend-Driven** - Client declares what it needs, decides single vs streaming
3. **Reactive by Default** - Every query CAN stream, but doesn't have to
4. **Optimistic by Default** - Mutations update UI immediately
5. **Auto-Optimized** - Smart query deduplication, incremental fetching, minimal transport
6. **Schema = Source of Truth** - Everything derives from schema
7. **Zero Dependencies** - Core has no external dependencies (lightweight subscribe pattern)
8. **Simple > Complex** - No plugins, no unnecessary abstractions

---

## Package Structure

```
@lens/core        Schema, types, QueryResult (zero dependencies)
@lens/client      Client API, Links, Query Optimizer
@lens/server      Resolvers, GraphStateManager, ExecutionEngine
@lens/react       React hooks (useQuery, useMutation)
@lens/svelte      Svelte stores
@lens/vue         Vue composables
```

---

## 1. Schema System

### Two-Phase Entity Definition (Drizzle-style)

```typescript
import { defineEntity, createSchemaFrom, t } from '@lens/core'

// Step 1: Define entities (without relations to avoid circular refs)
const User = defineEntity('User', {
  id: t.id(),
  name: t.string(),
  email: t.string(),

  // .compute() - Runs on BOTH client and server (isomorphic)
  slug: t.string().compute(u => slugify(u.name)),

  // .default() - Runs on BOTH client and server
  createdAt: t.datetime().default(() => new Date()),
})

const Post = defineEntity('Post', {
  id: t.id(),
  title: t.string(),
  content: t.string(),
  authorId: t.string(),
})

// Step 2: Create schema with type-safe relations
const schema = createSchemaFrom({
  User: User.with({
    posts: User.hasMany(Post),  // Direct reference (no strings!)
  }),
  Post: Post.with({
    author: Post.belongsTo(User),
  }),
})
```

### Built-in Field Types

| Type | TypeScript Type | Serialization |
|------|----------------|---------------|
| `t.id()` | `string` | - |
| `t.string()` | `string` | - |
| `t.int()` | `number` | - |
| `t.float()` | `number` | - |
| `t.boolean()` | `boolean` | - |
| `t.datetime()` | `Date` | ISO string |
| `t.date()` | `Date` | ISO date |
| `t.decimal()` | `Decimal` | string |
| `t.bigint()` | `BigInt` | string |
| `t.json()` | `any` | JSON |
| `t.bytes()` | `Uint8Array` | base64 |
| `t.enum([...])` | union | - |

### Field Modifiers

| Modifier | Runs On | Purpose |
|----------|---------|---------|
| `.default(fn)` | Client + Server | Default value for create (isomorphic) |
| `.compute(fn)` | Client + Server | Derived from other fields (isomorphic) |
| `.validate(fn)` | Client + Server | Validation rule |
| `.nullable()` | - | Allow null |
| `.optional()` | - | Optional in input |
| `.serialize(fn)` | Server | Custom serialization |
| `.deserialize(fn)` | Client | Custom deserialization |

**Key Insight:** `.default()` and `.compute()` are pure functions that run on BOTH client (for optimistic) and server. This is TypeScript-first power.

---

## 2. Client API - QueryResult (Thenable + Subscribable)

### The Elegant API

```typescript
import { createClient } from '@lens/client'

const client = createClient({
  schema,
  links: [
    loggerLink(),
    retryLink({ maxRetries: 3 }),
    httpLink({ url: '/api' }),  // Auto-selected for await
  ],
})

// QueryResult - Both Promise and Observable!
const userQuery = client.User.get('123')

// 1. Promise mode (single value)
const user = await userQuery  // ✅ Elegant!

// 2. Subscribe mode (streaming updates)
userQuery.subscribe(user => console.log(user))  // ✅ Elegant!

// 3. Framework integration
const user = useQuery(userQuery)  // React
$: user = $query(userQuery)       // Svelte
const user = ref(userQuery)       // Vue
```

### QueryResult Interface

```typescript
interface QueryResult<T> extends PromiseLike<T> {
  // Thenable - for await
  then<R>(onFulfilled: (value: T) => R): Promise<R>

  // Subscribable - for streaming
  subscribe(observer: (value: T) => void): () => void

  // Helpers
  refetch(): Promise<T>
  invalidate(): void
}
```

**How it works:**

```typescript
class QueryResult<T> {
  constructor(private fetcher: () => Promise<T>) {}

  // Lazy - only fetch when await or subscribe
  then(onFulfilled) {
    if (!this.promise) {
      this.promise = this.fetcher()
    }
    return this.promise.then(onFulfilled)
  }

  subscribe(observer) {
    // Trigger fetch if not started
    this.then(value => {
      observer(value)
      // Subscribe to real-time updates
      this.subscriptionManager.subscribe(...)
    })

    return () => this.unsubscribe()
  }
}
```

**Benefits:**
- ✅ Lazy - No fetch until await/subscribe
- ✅ Unified - Same API for both modes
- ✅ Type-safe - Full TypeScript support
- ✅ Elegant - No `{ stream: true }` needed

---

## 3. Smart Link Selection (Auto-Optimization)

### The Problem

```typescript
// Should use different transport based on usage
await client.User.get(id)           // Single value → HTTP (efficient)
client.User.get(id).subscribe(...)  // Streaming → SSE/WebSocket
```

### The Solution: Automatic Transport Selection

```typescript
// Client detects usage pattern
const userQuery = client.User.get(id)

// If await → Use httpLink (most efficient)
const user = await userQuery  // → HTTP POST /api { entity: "User", op: "get", id }

// If subscribe → Use sseLink or websocketLink
userQuery.subscribe(u => ...)  // → SSE GET /api/stream?entity=User&id=123
```

### Server Metadata

Server tells client if resolver is single or streaming:

```typescript
// Server resolver patterns
const resolvers = createResolvers(schema, {
  User: {
    // Pattern 1: Single return (type: "single")
    resolve: async (id) => {
      return await db.user.findUnique({ where: { id } })
    },

    // Pattern 2: Generator (type: "stream")
    resolve: async function* (id) {
      yield await db.user.findUnique({ where: { id } })
      // Subscribe to updates
      for await (const update of userStream(id)) {
        yield update
      }
    },

    // Pattern 3: Emit (type: "stream")
    resolve: async (id, ctx) => {
      ctx.emit(await db.user.findUnique({ where: { id } }))
      redis.subscribe(`user:${id}`, data => ctx.emit(data))
      ctx.onCleanup(() => redis.unsubscribe())
    },
  },
})

// Server exposes resolver metadata
GET /api/meta → {
  User: { resolve: "single", list: "single" },
  Post: { resolve: "stream", list: "single" }
}
```

### Optimization Matrix

| Client | Server | Transport | Behavior |
|--------|--------|-----------|----------|
| `await` | single | HTTP | ✅ Most efficient (one request-response) |
| `await` | stream | HTTP | ⚠️ Gets first value only (inefficient) |
| `subscribe` | single | SSE | ✅ Gets one value, auto-close connection |
| `subscribe` | stream | SSE/WS | ✅ Streaming updates, keep alive |

**Key:** Even if server is single-return, client can still `.subscribe()` for consistency. Makes it easy to upgrade server to streaming later without changing client code.

---

## 4. Query Optimizer - Minimal Server Communication

### The Principle

**"Maximize data reuse, minimize server requests"**

### Scenario 1: Full Superset

```typescript
// Component A fetches all fields
const user = await client.User.get(id)  // Fetch: { id, name, email, bio }

// Component B needs subset
const userName = await client.User.get(id, { select: { name: true } })
// → NO server request! Derive from Component A's cache ✅
```

### Scenario 2: Partial Overlap (Incremental Fetching)

```typescript
// Component A fetches some fields
const user = await client.User.get(id, { select: { name: true, email: true } })
// Cache: { name, email }

// Component B needs more fields
const userFull = await client.User.get(id, { select: { name: true, email: true, bio: true } })
// → Fetch ONLY missing: { bio }
// → Merge with cache: { name, email, bio }
// → Return merged result ✅
```

### Scenario 3: No Cache

```typescript
// First query
const user = await client.User.get(id)
// → Fetch from server
```

### Implementation: Smart QueryResolver

```typescript
class QueryResolver {
  async resolve<T>(entity: string, id: string, fields?: string[]): QueryResult<T> {
    const cached = this.cache.get(entity, id)

    if (!cached) {
      // No cache → fetch all
      return this.fetch(entity, id, fields)
    }

    // Check what we have vs what we need
    const have = Array.from(cached.fields.keys())
    const need = fields ?? Object.keys(cached.data)
    const missing = need.filter(f => !have.includes(f))

    if (missing.length === 0) {
      // All cached → derive (no server request)
      return this.derive(cached, need)
    }

    // Partial cached → incremental fetch
    const fetched = await this.fetch(entity, id, missing)
    this.merge(cached, fetched)
    return this.derive(cached, need)
  }
}
```

### Query Deduplication

```typescript
// Multiple components request same data simultaneously
const user1 = client.User.get('123')  // Request 1
const user2 = client.User.get('123')  // Request 2 (deduped)
const user3 = client.User.get('123')  // Request 3 (deduped)

await Promise.all([user1, user2, user3])
// → Only 1 server request! ✅
```

---

## 5. Type System - Serialization & Deserialization

### The Problem

```typescript
// Schema defines Date
const User = defineEntity('User', {
  createdAt: t.datetime(),
})

// Server returns Date object
const user = { id: '1', createdAt: new Date() }

// JSON.stringify → ISO string
// JSON.parse → string (not Date!) ❌
```

### The Solution: Automatic Serialization

```typescript
// Field types have built-in serializers
class DateTimeType extends FieldType<Date> {
  serialize(value: Date): string {
    return value.toISOString()
  }

  deserialize(value: string): Date {
    return new Date(value)
  }
}

// ExecutionEngine auto-applies serialization
class ExecutionEngine {
  async executeGet(entity: string, id: string) {
    const data = await this.resolvers[entity].resolve(id)
    return this.serialize(entity, data)  // ✅ Auto-serialize
  }

  private serialize(entity: string, data: any) {
    const entityDef = this.schema.entities[entity]
    const result: any = {}

    for (const [key, fieldType] of Object.entries(entityDef.fields)) {
      if (fieldType.serialize) {
        result[key] = fieldType.serialize(data[key])
      } else {
        result[key] = data[key]
      }
    }

    return result
  }
}

// Client auto-applies deserialization
const deserializeLink = (): Link => () => async (op, next) => {
  const result = await next(op)
  return this.deserialize(op.entity, result.data)
}

// Automatically added to client
const client = createClient({
  schema,
  links: [
    deserializeLink({ schema }),  // ✅ Auto-added
    httpLink({ url: '/api' }),
  ],
})
```

### Custom Types

```typescript
// Define custom type with serialization
const Product = defineEntity('Product', {
  price: t.decimal(),  // Built-in Decimal type

  // Or custom serialization
  location: t.custom({
    type: 'Point',
    serialize: (p: Point) => ({ lat: p.lat, lng: p.lng }),
    deserialize: (p: any) => new Point(p.lat, p.lng),
  }),
})
```

---

## 6. Optimistic Updates (Core Behavior)

### Automatic for Simple CRUD

```typescript
// No config needed - auto optimistic
await client.User.update('123', { name: 'Bob' })

// What happens:
// 1. Merge input into cache immediately
// 2. Apply schema .default() and .compute() (isomorphic!)
// 3. Send to server
// 4. Server response replaces optimistic data (server authoritative)
// 5. On error, rollback
```

### Custom Multi-Entity Mutations

```typescript
const sendMessage = defineMutation({
  input: { sessionId: t.string(), content: t.string() },

  // Optimistic: pure function
  optimistic: (input, { cache, tempId }) => {
    const msgId = tempId()
    return {
      create: {
        Message: {
          id: msgId,
          content: input.content,
          sessionId: input.sessionId,
          // createdAt auto-filled by schema .default()
        }
      },
      update: {
        Session: {
          [input.sessionId]: {
            lastMessage: input.content,
          }
        }
      }
    }
  },

  // Server resolver
  resolve: async (input, ctx) => {
    const message = await ctx.db.message.create({ ... })
    const session = await ctx.db.session.update({ ... })
    return { message, session }
  }
})
```

---

## 7. Server Architecture

### Three Resolver Patterns

```typescript
const resolvers = createResolvers(schema, {
  User: {
    // 1. Single return - most common
    resolve: async (id, ctx) => {
      return await ctx.db.user.findUnique({ where: { id } })
    },

    // 2. Generator - sequential streaming
    resolve: async function* (id, ctx) {
      yield await ctx.db.user.findUnique({ where: { id } })

      // Stream updates
      for await (const update of ctx.redis.subscribe(`user:${id}`)) {
        yield update
      }
    },

    // 3. Emit - event-driven
    resolve: async (id, ctx) => {
      // Initial data
      ctx.emit(await ctx.db.user.findUnique({ where: { id } }))

      // Subscribe to changes
      ctx.redis.subscribe(`user:${id}`, data => ctx.emit(data))

      // Cleanup
      ctx.onCleanup(() => ctx.redis.unsubscribe(`user:${id}`))
    },
  },
})
```

### GraphStateManager

```typescript
class GraphStateManager {
  // Canonical state per entity (server truth)
  private canonical = new Map<EntityKey, EntityData>()

  // Per-client last known state
  private clients = new Map<ClientId, Map<EntityKey, ClientState>>()

  emit(entity: string, id: string, data: Partial<T>) {
    // 1. Merge into canonical
    this.canonical.set(key, { ...this.canonical.get(key), ...data })

    // 2. For each subscribed client:
    for (const [clientId, client] of this.clients) {
      if (!client.subscriptions.has(key)) continue

      const lastKnown = client.lastState.get(key)

      // 3. Compute minimal diff
      const update = createUpdate(lastKnown, data)  // Auto-selects value/delta/patch

      // 4. Send to client
      client.send({ type: 'update', entity, id, update })

      // 5. Update client's last known state
      client.lastState.set(key, data)
    }
  }
}
```

### DataLoader (N+1 Prevention)

```typescript
class ExecutionEngine {
  private loaders = new Map<string, DataLoader>()

  async executeGet(entity: string, id: string) {
    // Auto-batch queries in same tick
    const loader = this.getLoader(entity)
    return await loader.load(id)
  }

  private getLoader(entity: string) {
    if (!this.loaders.has(entity)) {
      this.loaders.set(entity, new DataLoader(async (ids) => {
        // Batch resolver
        return await this.resolvers[entity].batch?.(ids) ??
               await Promise.all(ids.map(id => this.resolvers[entity].resolve(id)))
      }))
    }
    return this.loaders.get(entity)!
  }
}
```

---

## 8. Transfer Optimization

### Automatic Strategy Selection

GraphStateManager auto-selects optimal transfer strategy:

| Data Type | Strategy | When | Savings |
|-----------|----------|------|---------|
| Short string | `value` | < 100 chars | - |
| Long string | `delta` | Small change | ~57% |
| Object | `patch` | Partial change | ~99% |
| Primitives | `value` | Always | - |

### Example: Delta Update (String)

```typescript
// Client last received:
"Hello World"

// New value:
"Hello Lens!"

// Delta update:
{
  strategy: "delta",
  data: [
    { position: 6, delete: 5, insert: "Lens!" }
  ]
}
// Size: ~40 bytes vs 11 bytes (full string) - but more efficient for long strings
```

### Example: Patch Update (Object)

```typescript
// Client last received:
{ id: '1', name: 'Alice', bio: '...' (1000 chars) }

// New value:
{ name: 'Bob' }

// Patch update:
{
  strategy: "patch",
  data: [
    { op: "replace", path: "/name", value: "Bob" }
  ]
}
// Size: ~40 bytes vs 1050 bytes - 97% savings! ✅
```

---

## 9. Framework Adapters

### React

```typescript
// @lens/react
import { useQuery, useMutation } from '@lens/react'

function UserProfile({ id }) {
  const { data, loading, error } = useQuery(client.User.get(id))

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{data.name}</div>
}

function CreateUser() {
  const [create, { loading }] = useMutation(
    (input) => client.User.create(input)
  )

  return <button onClick={() => create({ name: 'Alice' })}>Create</button>
}
```

### Svelte

```typescript
// @lens/svelte
import { query } from '@lens/svelte'

const user = query(client.User.get(id))

// Svelte auto-reactivity
$: console.log($user)
```

### Vue

```typescript
// @lens/vue
import { useQuery } from '@lens/vue'

export default {
  setup() {
    const { data, loading } = useQuery(() => client.User.get(id))
    return { user: data, loading }
  }
}
```

---

## 10. What We DON'T Have

### NO Plugin System
Replaced by:
- **Links** - Client middleware
- **Server Middleware** - Server middleware
- **Schema Features** - `.validate()`, `.default()`, `.compute()`, `.serialize()`
- **Core Behavior** - Optimistic, query optimizer

### NO Signals in Core
- Core uses lightweight subscribe pattern (zero dependencies)
- Framework adapters handle reactive integration
- Optional: `@lens/rxjs` for RxJS integration

### NO Handshake Protocol
- Schema is shared TypeScript code
- Server exposes resolver metadata via `/api/meta`

### NO Nested Signals
- Use separate queries: `client.Post.list({ userId })`
- Or nested select: `client.User.get(id, { select: { posts: true } })`
- Query optimizer ensures minimal server communication

---

## 11. Implementation Priority

### P0 - Critical (Must Have)
1. ✅ Type System - serialization/deserialization
2. ✅ QueryResult - Thenable + Subscribable
3. ✅ Query Optimizer - incremental fetching
4. ✅ Smart Link Selection - auto transport optimization

### P1 - High (Core Features)
5. ✅ Optimistic as core behavior
6. ✅ GraphStateManager with delta/patch
7. ✅ DataLoader for N+1 prevention

### P2 - Medium (Nice to Have)
8. Framework adapters (React, Svelte, Vue)
9. Compression link (gzip/brotli)
10. Binary serialization (msgpack/protobuf)

### P3 - Low (Future)
11. Query planner (automatic query optimization)
12. Code generation (Swift, Kotlin)

---

## Summary

| Concept | Implementation |
|---------|---------------|
| **Client API** | `QueryResult` (Thenable + Subscribable) |
| **Reactive** | Zero-dependency subscribe, framework adapters |
| **Query Optimization** | Incremental fetching, deduplication |
| **Transport** | Auto-selected based on usage (HTTP/SSE/WS) |
| **Optimistic** | Core behavior + multi-entity support |
| **Type System** | Auto serialization/deserialization |
| **Transfer** | Auto strategy (value/delta/patch) |
| **Server** | Three patterns (return/yield/emit) |
| **Middleware** | Links (client), Server middleware |
| **N+1 Prevention** | DataLoader with auto-batching |

**Philosophy: TypeScript-first, Frontend-driven, Auto-optimized, Zero unnecessary complexity.**
