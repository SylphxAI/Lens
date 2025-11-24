# Lens Architecture

> **TypeScript-first, Reactive Graph API Framework**
> Single Source of Truth (SSOT) Document

---

## Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "GraphQL concepts, TypeScript implementation"             │
│                                                             │
│   - Operations define entry points (any query/mutation)     │
│   - Entity Resolvers handle nested data                     │
│   - Everything is reactive and can stream                   │
│   - Type-safe without codegen                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why This Design?

**Problem with GraphQL:**
- Requires schema definition language (SDL)
- Requires code generation for type safety
- Two sources of truth (SDL + resolvers)

**Problem with tRPC:**
- No entity-based data model
- No automatic nested resolution
- No built-in optimistic updates

**Lens Solution:**
- TypeScript IS the schema (no SDL, no codegen)
- Operations define entry points (like GraphQL Query/Mutation)
- Entity Resolvers handle nested data (like GraphQL type resolvers)
- Reactive by default, optimistic built-in

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Operations                            │
│   Completely free query/mutation definitions                 │
│   Entry points to the system                                 │
│   Examples: whoami, searchUsers, createPost, promoteBatch    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Entity Resolvers                         │
│   Handle nested data resolution                              │
│   Reused across ALL operations                               │
│   Examples: User.posts, Post.author, Comment.replies         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         Schema                               │
│   Structure + Relations only                                 │
│   No operations, no resolvers                                │
│   Pure type definitions                                      │
└─────────────────────────────────────────────────────────────┘
```

### Why Separate Operations from Entity Resolvers?

**GraphQL does this:**
```graphql
# Operations (Query/Mutation) - entry points
type Query {
  whoami: User
  searchUsers(query: String): [User!]!
  post(id: ID!): Post
}

# Type resolvers - nested handling
type User {
  posts: [Post!]!   # <- Resolved by User.posts resolver
}
```

**Common mistake:** Conflating operations with entity CRUD. This leads to:
- ❌ Can only do `User.get(id)`, `User.list()`, `User.create()`
- ❌ Can't define `whoami` (returns User but not by ID)
- ❌ Can't define `searchUsers` (custom logic)
- ❌ Can't define `promoteBatch` (affects multiple entities)

**Lens separates them:**
- **Operations**: Any entry point you want (query/mutation)
- **Entity Resolvers**: Handle nested fields only

---

## 1. Schema Layer

Schema defines structure and relations. NO operations, NO resolvers.

```typescript
import { entity, relation, hasMany, belongsTo, t } from '@lens/core'

// =============================================================================
// Entities - Pure structure
// =============================================================================

export const User = entity('User', {
  id: t.id(),
  name: t.string(),
  email: t.string(),
  role: t.enum(['user', 'admin', 'vip']),

  // Computed fields (isomorphic - runs on client + server)
  slug: t.string().compute(u => slugify(u.name)),

  // Default values (isomorphic)
  createdAt: t.datetime().default(() => new Date()),
})

export const Post = entity('Post', {
  id: t.id(),
  title: t.string(),
  content: t.string(),
  authorId: t.string(),
  published: t.boolean().default(() => false),
})

export const Comment = entity('Comment', {
  id: t.id(),
  content: t.string(),
  postId: t.string(),
  authorId: t.string(),
})

// =============================================================================
// Relations - Type-safe, no strings
// =============================================================================

export const relations = [
  relation(User, {
    posts: hasMany(Post, e => e.authorId),     // User.posts → Post[]
    comments: hasMany(Comment, e => e.authorId), // User.comments → Comment[]
  }),

  relation(Post, {
    author: belongsTo(User, e => e.authorId),  // Post.author → User
    comments: hasMany(Comment, e => e.postId), // Post.comments → Comment[]
  }),

  relation(Comment, {
    author: belongsTo(User, e => e.authorId),  // Comment.author → User
    post: belongsTo(Post, e => e.postId),      // Comment.post → Post
  }),
]
```

### Why Type-Safe Relations?

```typescript
// ❌ String-based (error-prone)
relation('Post', {
  author: belongsTo('User', 'authorId'),  // Typo? Wrong field? No error!
})

// ✅ Type-safe (Lens approach)
relation(Post, {
  author: belongsTo(User, e => e.authorId),  // TypeScript validates!
})
```

**How it works:**
```typescript
// e => e.authorId uses Proxy to extract field name
function belongsTo<T, R>(target: Entity<R>, fieldAccessor: (e: T) => string) {
  const proxy = new Proxy({}, { get: (_, key) => key })
  const foreignKey = fieldAccessor(proxy as T)  // Returns 'authorId'
  return { type: 'belongsTo', target, foreignKey }
}
```

---

## 2. Operations Layer

Operations are completely free. Define ANY query or mutation.

### Query Definition

```typescript
import { query } from '@lens/core'
import { z } from 'zod'  // For input validation
import { User, Post } from './schema'

// =============================================================================
// Queries - Any entry point
// =============================================================================

// No input, returns current user
export const whoami = query()
  .returns(User)
  .resolve(() => {
    const ctx = useContext()  // AsyncLocalStorage
    return ctx.currentUser
  })

// Simple by-ID query
export const user = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input }) => {
    return useDB().user.findUnique({ where: { id: input.id } })
  })

// Custom query logic
export const searchUsers = query()
  .input(z.object({
    query: z.string(),
    limit: z.number().optional()
  }))
  .returns([User])  // Array syntax
  .resolve(({ input }) => {
    return useDB().user.findMany({
      where: { name: { contains: input.query } },
      take: input.limit ?? 10,
    })
  })

// Streaming query (real-time updates)
export const activeUsers = query()
  .returns([User])
  .resolve(async function* () {
    yield await useDB().user.findMany({ where: { active: true } })

    for await (const event of useRedis().subscribe('user:active')) {
      yield event.users
    }
  })
```

### Mutation Definition

```typescript
import { mutation, tempId } from '@lens/core'

// =============================================================================
// Mutations - Any write operation
// =============================================================================

// Simple create
export const createPost = mutation()
  .input(z.object({
    title: z.string(),
    content: z.string()
  }))
  .returns(Post)
  .optimistic(({ input }) => ({
    id: tempId(),  // Temporary ID, replaced by server
    title: input.title,
    content: input.content,
    authorId: useContext().currentUser.id,
    published: false,  // From schema default
  }))
  .resolve(({ input }) => {
    const ctx = useContext()
    return useDB().post.create({
      data: { ...input, authorId: ctx.currentUser.id },
    })
  })

// Custom mutation (not tied to single entity)
export const publishPost = mutation()
  .input(z.object({ postId: z.string() }))
  .returns(Post)
  .optimistic(({ input }) => ({
    id: input.postId,
    published: true,
  }))
  .resolve(({ input }) => {
    return useDB().post.update({
      where: { id: input.postId },
      data: { published: true },
    })
  })
```

### Multi-Entity Mutations

```typescript
// Mutation affecting multiple entities
export const promoteSomeUsers = mutation()
  .input(z.object({
    userIds: z.array(z.string()),
    newRole: z.enum(['admin', 'vip'])
  }))
  .returns({
    users: [User],           // Array of User
    notifications: [Notification],  // Array of Notification
  })
  .optimistic(({ input }) => ({
    users: input.userIds.map(id => ({
      id,
      role: input.newRole,
    })),
    notifications: input.userIds.map(id => ({
      id: tempId(),
      userId: id,
      message: `You have been promoted to ${input.newRole}!`,
    })),
  }))
  .resolve(async ({ input }) => {
    const db = useDB()

    // Update users
    const users = await Promise.all(
      input.userIds.map(id =>
        db.user.update({ where: { id }, data: { role: input.newRole } })
      )
    )

    // Create notifications
    const notifications = await Promise.all(
      input.userIds.map(userId =>
        db.notification.create({
          data: { userId, message: `Promoted to ${input.newRole}!` }
        })
      )
    )

    return { users, notifications }
  })
```

### Why Separate from Schema?

**Operations are NOT tied to entities:**

| Operation | Returns | Notes |
|-----------|---------|-------|
| `whoami` | `User` | No input, returns current user |
| `searchUsers` | `User[]` | Custom search logic |
| `promoteBatch` | `{users, notifications}` | Multi-entity |
| `healthCheck` | `{status}` | Not even an entity! |

**Entity CRUD is just ONE pattern:**
```typescript
// These are just regular queries/mutations
export const getUser = query().input(...).returns(User).resolve(...)
export const listUsers = query().input(...).returns([User]).resolve(...)
export const createUser = mutation().input(...).returns(User).resolve(...)

// But you can also have:
export const whoami = query().returns(User).resolve(...)  // No input!
export const importUsers = mutation().input(...).returns([User]).resolve(...)  // Bulk!
```

---

## 3. Entity Resolvers Layer

Entity Resolvers handle nested data. They are **reused across ALL operations**.

```typescript
import { entityResolvers } from '@lens/core'

// =============================================================================
// Entity Resolvers - Handle nested fields
// =============================================================================

export const resolvers = entityResolvers({
  User: {
    // Resolve User.posts when requested
    posts: (user) => {
      return useDB().post.findMany({ where: { authorId: user.id } })
    },

    // Resolve User.comments when requested
    comments: (user) => {
      return useDB().comment.findMany({ where: { authorId: user.id } })
    },
  },

  Post: {
    // Resolve Post.author when requested
    author: (post) => {
      return useDB().user.findUnique({ where: { id: post.authorId } })
    },

    // Resolve Post.comments when requested
    comments: (post) => {
      return useDB().comment.findMany({ where: { postId: post.id } })
    },
  },

  Comment: {
    author: (comment) => {
      return useDB().user.findUnique({ where: { id: comment.authorId } })
    },

    post: (comment) => {
      return useDB().post.findUnique({ where: { id: comment.postId } })
    },
  },
})
```

### Why Separate from Operations?

**Reusability:**
```typescript
// Query 1: Get user with posts
const user = await client.user({ id: '1' }).select({ posts: true })
// → Uses User.posts resolver

// Query 2: Search users with posts
const users = await client.searchUsers({ query: 'john' }).select({ posts: true })
// → Uses SAME User.posts resolver

// Query 3: Get current user with posts
const me = await client.whoami().select({ posts: true })
// → Uses SAME User.posts resolver
```

**The resolver is defined ONCE, used EVERYWHERE.**

### Batching (N+1 Prevention)

```typescript
export const resolvers = entityResolvers({
  Post: {
    // Without batching: N+1 problem
    // author: (post) => db.user.findUnique({ where: { id: post.authorId } })

    // With batching: 1 query for all
    author: {
      batch: (posts) => {
        const authorIds = [...new Set(posts.map(p => p.authorId))]
        const authors = await useDB().user.findMany({
          where: { id: { in: authorIds } }
        })

        // Return in same order as input
        const authorMap = new Map(authors.map(a => [a.id, a]))
        return posts.map(p => authorMap.get(p.authorId))
      },
    },
  },
})
```

---

## 4. Context System

### AsyncLocalStorage (Recommended)

```typescript
import { createContext, useContext, useDB, useCurrentUser } from '@lens/core'

// Server setup
const server = createServer({
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromToken(req.headers.authorization),
  }),
})

// In resolvers/operations - use composables
export const whoami = query()
  .returns(User)
  .resolve(() => useCurrentUser())  // ✅ Clean!

export const createPost = mutation()
  .input(...)
  .resolve(({ input }) => {
    const db = useDB()
    const user = useCurrentUser()
    return db.post.create({ data: { ...input, authorId: user.id } })
  })
```

### Explicit Context (Fallback)

```typescript
// If AsyncLocalStorage unavailable or for explicit passing
export const createPost = mutation()
  .input(...)
  .resolve(({ input, ctx }) => {  // ctx explicitly available
    return ctx.db.post.create({
      data: { ...input, authorId: ctx.currentUser.id }
    })
  })
```

### Why AsyncLocalStorage?

```typescript
// ❌ Without: Prop drilling hell
async function createPost(input, ctx) {
  await validateUser(ctx.currentUser, ctx)
  await checkPermissions(ctx.currentUser, 'post:create', ctx)
  await db.post.create(ctx, { data: { ... } })
}

// ✅ With: Clean composables
async function createPost(input) {
  await validateUser()           // Gets user from context
  await checkPermissions('post:create')  // Gets user from context
  await useDB().post.create({ data: { ... } })
}
```

**Note:** AsyncLocalStorage is the primary pattern. Explicit `ctx` is available as fallback for:
- Testing (inject mock context)
- Environments without AsyncLocalStorage support
- Explicit dependency injection preference

---

## 5. Server Setup

```typescript
import { createServer } from '@lens/server'
import * as entities from './schema/entities'
import { relations } from './schema/relations'
import * as queries from './operations/queries'
import * as mutations from './operations/mutations'
import { resolvers } from './resolvers'

export const server = createServer({
  // Schema
  entities,
  relations,

  // Operations
  queries,
  mutations,

  // Entity resolvers
  resolvers,

  // Context factory
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromToken(req.headers.authorization),
    redis: redisClient,
  }),
})

// Express/Fastify/etc
app.use('/api', server.handler())

// Or standalone
server.listen(3000)
```

---

## 6. Client Setup

```typescript
import { createClient } from '@lens/client'
import * as entities from './schema/entities'
import * as queries from './operations/queries'
import * as mutations from './operations/mutations'

const client = createClient({
  entities,
  queries,
  mutations,

  links: [
    retryLink({ maxRetries: 3 }),
    websocketLink({ url: 'ws://localhost:3000/api' }),
  ],
})

// Type-safe usage
const user = await client.whoami()  // User type inferred
const posts = await client.searchUsers({ query: 'john' }).select({ posts: true })
```

---

## 7. Optimistic Updates

### Automatic for Simple Cases

```typescript
// Optimistic is just a function that predicts the result
export const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .optimistic(({ input }) => ({
    id: input.id,
    name: input.name,  // Predict the change
  }))
  .resolve(({ input }) => {
    return useDB().user.update({ where: { id: input.id }, data: input })
  })
```

### Flow

```
1. Client calls mutation
2. optimistic() predicts result → Update cache immediately
3. Server executes resolve()
4. Server response replaces optimistic data
5. On error: Rollback to previous state
```

### Multi-Entity Optimistic

```typescript
export const sendMessage = mutation()
  .input(z.object({ sessionId: z.string(), content: z.string() }))
  .returns({
    message: Message,
    session: Session,
  })
  .optimistic(({ input }) => ({
    message: {
      id: tempId(),
      content: input.content,
      sessionId: input.sessionId,
    },
    session: {
      id: input.sessionId,
      lastMessage: input.content,
      updatedAt: new Date(),
    },
  }))
  .resolve(...)
```

---

## 8. Reactive System

### Three Resolver Patterns

```typescript
// 1. Return - Single value (most common)
export const user = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input }) => useDB().user.findUnique({ where: { id: input.id } }))

// 2. Generator - Sequential streaming
export const activeUsers = query()
  .returns([User])
  .resolve(async function* () {
    yield await useDB().user.findMany({ where: { active: true } })

    for await (const event of useRedis().subscribe('user:active')) {
      yield event.users
    }
  })

// 3. Emit - Event-driven streaming
export const userPresence = query()
  .input(z.object({ id: z.string() }))
  .returns(UserPresence)
  .resolve(({ input, emit, onCleanup }) => {
    // Initial value
    emit({ userId: input.id, status: 'online' })

    // Subscribe to changes
    const handler = (status) => emit({ userId: input.id, status })
    useRedis().subscribe(`presence:${input.id}`, handler)

    // Cleanup
    onCleanup(() => useRedis().unsubscribe(`presence:${input.id}`, handler))
  })
```

### Client Subscription

```typescript
// await → Get single value
const user = await client.user({ id: '1' })

// subscribe → Stream updates
client.activeUsers().subscribe(users => {
  console.log('Active users:', users.length)
})
```

---

## 9. Transfer Optimization

### Automatic Strategy Selection

| Data Type | Strategy | When Used |
|-----------|----------|-----------|
| Short string | `value` | < 100 chars |
| Long string | `delta` | Small changes to large text |
| Object | `patch` | Partial field changes |
| Primitives | `value` | Always |

### GraphStateManager

```typescript
// Server maintains canonical state + per-client last-known state
// Computes minimal diff for each client

// Client A subscribed at t=1, has { name: 'Alice', bio: '...' }
// Client B subscribed at t=2, has { name: 'Alice', bio: '...' }
// Server update: { name: 'Bob' }

// Client A receives: { strategy: 'patch', ops: [{ replace: '/name', value: 'Bob' }] }
// Client B receives: { strategy: 'patch', ops: [{ replace: '/name', value: 'Bob' }] }
```

---

## 10. API Summary

### Simplified Naming

| Old (Verbose) | New (Clean) |
|---------------|-------------|
| `defineEntity()` | `entity()` |
| `defineRelations()` | `relation()` |
| `defineQuery()` | `query()` |
| `defineMutation()` | `mutation()` |

### Full API

```typescript
// Schema
entity(name, fields)           // Define entity structure
relation(entity, relations)     // Define entity relations
t.id(), t.string(), ...        // Field types
hasMany(Entity, accessor)      // One-to-many relation
belongsTo(Entity, accessor)    // Many-to-one relation

// Operations
query()                        // Create query builder
  .input(zodSchema)            // Input validation (optional)
  .returns(Entity | [Entity])  // Return type
  .resolve(fn)                 // Resolver function

mutation()                     // Create mutation builder
  .input(zodSchema)            // Input validation (required)
  .returns(Entity | { ... })   // Return type
  .optimistic(fn)              // Optimistic prediction (optional)
  .resolve(fn)                 // Resolver function

// Entity Resolvers
entityResolvers({ Entity: { field: resolver } })

// Context
useContext()                   // Get full context
useDB()                        // Get database
useCurrentUser()               // Get current user

// Helpers
tempId()                       // Generate temporary ID for optimistic
```

---

## Design Decisions Log

### Why Operations + Entity Resolvers (not CRUD-only)?

**Problem:** V1 → V2 regression. V2 conflated operations with entity CRUD, limiting flexibility.

**Decision:** Separate like GraphQL does:
- Operations = Entry points (any query/mutation)
- Entity Resolvers = Nested data handling

**Benefit:** Can define `whoami`, `searchUsers`, `batchUpdate`, etc.

### Why Type-Safe Relations (no strings)?

**Problem:** String-based relations are error-prone and not refactor-safe.

**Decision:** Direct entity references with Proxy for field extraction.

**Benefit:** TypeScript validates relations at compile time.

### Why AsyncLocalStorage for Context?

**Problem:** Passing `ctx` through every function is tedious.

**Decision:** AsyncLocalStorage with composables pattern, `ctx` as fallback.

**Benefit:** Clean code, easy testing, Vue-like composables.

### Why Zod for Input Validation?

**Problem:** Need runtime validation, schema has our own type system.

**Decision:** Use Zod for operation input/output, our types for schema.

**Benefit:** Powerful validation (transforms, refinements), familiar to users.

### Why Multi-Entity Returns?

**Problem:** Some mutations affect multiple entities.

**Decision:** Allow `returns({ users: [User], notifications: [Notification] })`.

**Benefit:** One mutation, all affected entities properly typed.

---

## Package Structure

```
packages/
├── core/                    @lens/core
│   ├── schema/              entity(), relation(), t.*
│   ├── operations/          query(), mutation()
│   └── types/               Shared types
│
├── server/                  @lens/server
│   ├── execution/           ExecutionEngine
│   ├── state/               GraphStateManager
│   └── server/              createServer
│
├── client/                  @lens/client
│   ├── store/               ReactiveStore
│   ├── links/               Transport links
│   └── client/              createClient
│
└── react/                   @lens/react
    ├── hooks/               useQuery, useMutation
    └── provider/            LensProvider
```

---

## What We DON'T Have

| Feature | Why Not | Alternative |
|---------|---------|-------------|
| Plugin system | Unnecessary complexity | Links (client), middleware (server) |
| Schema-first | TypeScript IS the schema | Code-first |
| Codegen | Not needed | Full inference |
| Nested signals | Complexity | Separate queries + optimizer |
| GraphQL SDL | Extra layer | Direct TypeScript |

---

## Philosophy

**TypeScript-first:** Same code runs on client and server. No SDL, no codegen.

**Operations are free:** Define any query/mutation, not limited to CRUD.

**Nested is automatic:** Entity resolvers handle nested data, reused everywhere.

**Reactive by default:** Every query can stream, optimistic is built-in.

**Simple > Complex:** No plugins, no unnecessary abstractions.
