# Lens Architecture

> **TypeScript-first, Reactive Graph API Framework**

Lens is a revolutionary approach to building APIs that combines the best of GraphQL's query flexibility with tRPC's type safety, while adding first-class support for real-time streaming and optimistic updates.

---

## Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "Everything is Reactive. Everything can Stream."          │
│                                                             │
│   - Zero distinction between static and streaming data      │
│   - Server emits, Client receives                           │
│   - No configuration, only implementation                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **TypeScript-First** - Full type inference from schema to client, zero codegen
2. **Reactive by Default** - Every field, every entity is reactive
3. **Frontend-Driven** - Client declares what it needs, server delivers
4. **Zero Config** - Schema = Shape, Resolver = Implementation, that's it
5. **Minimal Transfer** - Automatic delta/patch/value strategy selection
6. **Transparent Streaming** - Client doesn't know or care about streaming

---

## Mental Model

### The Unified Reactive Model

There is no distinction between "streaming" and "non-streaming" fields.

```
Static data    = Server yields once
Streaming data = Server yields many times
Same pattern, same code, same API
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                               │
│                                                             │
│   const user = api.user.get({ id })   // Signal<User>       │
│   <div>{user.name}</div>              // Auto-updates       │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Reactive Store                         │   │
│   │   Signals auto-subscribe, auto-update, auto-dispose │   │
│   └─────────────────────────────────────────────────────┘   │
│                          ▲                                  │
│                          │ WebSocket                        │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                          ▼              SERVER               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Graph Emitter                          │   │
│   │   yield data → Framework delivers to subscribers    │   │
│   └─────────────────────────────────────────────────────┘   │
│                          ▲                                  │
│                          │                                  │
│   ┌──────────┬───────────┴───────────┬──────────┐          │
│   │    DB    │         LLM           │  Service │          │
│   │  Source  │        Source         │  Source  │          │
│   └──────────┴───────────────────────┴──────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Layers

### Layer 1: Schema (Shape Definition)

Schema defines WHAT the data looks like. Nothing else.

```typescript
import { createSchema, t } from '@lens/core';

const schema = createSchema({
  User: {
    id: t.id(),
    name: t.string(),
    email: t.string(),
    avatar: t.string().nullable(),
    posts: t.hasMany('Post'),
    profile: t.hasOne('Profile'),
  },

  Post: {
    id: t.id(),
    title: t.string(),
    content: t.string(),         // Can stream (LLM) or not (DB)
    status: t.enum(['draft', 'published']),
    author: t.belongsTo('User'),
    comments: t.hasMany('Comment'),
  },

  Comment: {
    id: t.id(),
    body: t.string(),
    author: t.belongsTo('User'),
    post: t.belongsTo('Post'),
  },
});
```

**Key points:**
- No `.streaming()` annotation - streaming is runtime behavior
- Relations define the graph structure
- Types are inferred automatically

### Layer 2: Resolvers (Implementation)

Resolvers define HOW to get data. They decide runtime behavior.

```typescript
import { createResolvers } from '@lens/server';

const resolvers = createResolvers(schema, {
  User: {
    // Simple: return value (yields once)
    resolve: async (id, ctx) => {
      return await ctx.db.user.findUnique({ where: { id } });
    },

    // Batch: for N+1 elimination
    batch: async (ids, ctx) => {
      return await ctx.db.user.findMany({ where: { id: { in: ids } } });
    },

    // Relations
    posts: async (user, ctx) => {
      return await ctx.db.post.findMany({ where: { authorId: user.id } });
    },
  },

  Post: {
    // Streaming: yield multiple times
    resolve: async function* (id, ctx) {
      // Initial from DB
      const post = await ctx.db.post.findUnique({ where: { id } });
      yield post;

      // If generating, stream from LLM
      if (post.isGenerating) {
        for await (const chunk of ctx.llm.stream(post.promptId)) {
          yield {
            ...post,
            content: post.content + chunk.text,
          };
        }
      }

      // Listen for DB changes
      for await (const change of ctx.db.watch('Post', id)) {
        yield change;
      }
    },
  },
});
```

**Key points:**
- `return` = yield once (static)
- `yield` = can yield many times (streaming)
- Same API, different behavior based on implementation

### Layer 3: Client (Reactive Access)

Client provides reactive access to the graph.

```typescript
import { createClient } from '@lens/client';

const api = createClient<typeof schema>({
  url: 'wss://api.example.com/lens',
});

// Get entity - returns Signal
const user = api.user.get({ id: '123' });
// user: Signal<User | null>

// Computed relations
const posts = computed(() => user.value?.posts ?? []);
// posts: Signal<Post[]>

// Field selection (optimization)
const simpleUser = api.user.get({ id: '123' }, {
  select: { name: true, avatar: true },
});
// simpleUser: Signal<{ name: string; avatar: string | null } | null>

// Mutations (auto-optimistic)
await api.post.update({
  id: '456',
  title: 'New Title',
});
// UI updates immediately, rolls back on error
```

**Key points:**
- Everything returns a Signal (reactive)
- Field selection is an optimization hint
- Optimistic updates are automatic

### Layer 4: React Integration

React hooks wrap signals for React's rendering model.

```tsx
import { useEntity, useMutation } from '@lens/react';

function UserProfile({ userId }: { userId: string }) {
  const user = useEntity(api.user, { id: userId });
  const posts = useComputed(() => user.value?.posts ?? []);

  const updateUser = useMutation(api.user.update);

  return (
    <div>
      <h1>{user.value?.name}</h1>
      <button onClick={() => updateUser({ id: userId, name: 'New Name' })}>
        Update
      </button>
      {posts.value.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
```

---

## Transfer Optimization

### Automatic Strategy Selection

Server automatically selects the optimal transfer strategy:

| Field Type | Strategy | Savings |
|------------|----------|---------|
| `string` (short) | `value` | - |
| `string` (long, small change) | `delta` | ~57% |
| `object` | `patch` | ~99% |
| `array` | `patch` | ~90% |
| `number`, `boolean` | `value` | - |

### Wire Protocol

```typescript
// Initial
{ type: 'initial', entity: 'Post', id: '123', data: { ... } }

// Value update
{ type: 'update', entity: 'Post', id: '123', field: 'title', strategy: 'value', data: 'New Title' }

// Delta update (streaming text)
{ type: 'update', entity: 'Post', id: '123', field: 'content', strategy: 'delta', data: { pos: 100, insert: 'Hello' } }

// Patch update (object/array)
{ type: 'update', entity: 'Post', id: '123', field: 'metadata', strategy: 'patch', data: [{ op: 'add', path: '/views', value: 100 }] }
```

---

## Optimistic Updates

### Automatic Inference

Optimistic updates are inferred from mutation input:

```typescript
// Mutation
await api.post.update({ id: '123', title: 'New Title' });

// Framework automatically:
// 1. Detects: has `id` → update operation
// 2. Extracts: fields to update = { title: 'New Title' }
// 3. Applies: merge into cached entity
// 4. Marks: as optimistic
// 5. On success: confirm
// 6. On error: rollback
```

No configuration needed!

### Create/Delete

```typescript
// Create - generates temp ID
await api.post.create({ title: 'New Post' });
// temp:uuid → replaced with real ID on success

// Delete - removes from cache
await api.post.delete({ id: '123' });
// Restored on error
```

---

## Package Structure

```
@lens/core      Schema types, utilities, shared code
@lens/server    Resolvers, graph execution, handlers
@lens/client    Reactive store, signals, transport
@lens/react     React hooks and bindings
```

---

## Comparison

| Feature | GraphQL | tRPC | Lens |
|---------|---------|------|------|
| Type Safety | Codegen | Native | Native |
| Field Selection | ✅ | ❌ | ✅ |
| Nested Queries | ✅ | ❌ | ✅ |
| Real-time | Subscription | Manual | Native |
| Streaming | ❌ | ❌ | Native |
| Optimistic | Manual | Manual | Auto |
| N+1 Prevention | DataLoader | Manual | Auto |
| Transfer Optimization | ❌ | ❌ | Auto |
| Boilerplate | High | Low | Zero |

---

## Summary

```
Schema     = Define shape (WHAT)
Resolvers  = Implement fetching (HOW)
Client     = Reactive access (USE)

Everything else is automatic.
Zero config. Only implementation.
```
