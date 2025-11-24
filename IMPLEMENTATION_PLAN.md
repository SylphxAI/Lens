# Lens Implementation Plan

> Current Status: **Phase 4** - Server Integration Complete, Client Integration In Progress

---

## Progress Overview

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | New Architecture Design | ✅ Complete |
| 2 | Core API (@lens/core) | ✅ Complete |
| 3 | Server Integration | ✅ Complete |
| 4 | Client Integration | 🟡 In Progress |
| 5 | React Hooks Update | ⬜ Pending |

---

## Phase 2: Core API ✅ Complete

All new APIs implemented in `@lens/core`:

### Schema API
```typescript
// entities.ts
export const User = entity('User', {
  id: t.id(),
  name: t.string(),
  role: t.enum(['user', 'admin']),
})

// relations.ts
export const relations = [
  relation(User, {
    posts: hasMany(Post, e => e.authorId),
  }),
]
```

### Operations API
```typescript
export const whoami = query()
  .returns(User)
  .resolve(() => useCurrentUser())

export const createPost = mutation()
  .input(z.object({ title: z.string(), content: z.string() }))
  .returns(Post)
  .optimistic(({ input }) => ({ id: tempId(), ...input }))
  .resolve(({ input }) => useDB().post.create({ data: input }))
```

### Entity Resolvers API
```typescript
export const resolvers = entityResolvers({
  User: {
    posts: (user) => useDB().post.findMany({ where: { authorId: user.id } }),
  },
  Post: {
    author: {
      batch: async (posts) => { /* N+1 prevention */ },
    },
  },
})
```

### Context System
```typescript
const ctx = createContext<AppContext>()

await runWithContext(ctx, { db, currentUser }, async () => {
  const db = useContext().db
  const user = useCurrentUser()
})
```

---

## Phase 3: Server Integration ✅ Complete

New `createServerV2()` implemented with operations-based API:

```typescript
const server = createServerV2({
  entities,
  relations,
  queries,
  mutations,
  resolvers,
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromRequest(req),
  }),
})

server.listen(3000)
```

### Features Implemented

- **Operations Support**: Execute queries/mutations by name
- **Context Integration**: `runWithContext()` for AsyncLocalStorage
- **Input Validation**: Zod schema validation from operation definitions
- **WebSocket Transport**: Handshake, query, mutation message handling
- **HTTP Transport**: POST-based query/mutation execution
- **Async Generators**: Streaming support (returns first value)
- **Backward Compatibility**: `createServer()` still available

### Tests: 27 passing

---

## Phase 4: Client Integration 🟡 In Progress

### Current State

The existing client (`@lens/client`) uses CRUD-based API:
- `client.user.get({ id })`
- `client.user.list()`
- `client.user.create(input)`

### New Client API

```typescript
const client = createClient({
  queries,
  mutations,
  links: [websocketLink({ url: '...' })],
})

// Type-safe operation access
const me = await client.whoami()
const results = await client.searchUsers({ query: 'john' })
const post = await client.createPost({ title: 'Hello', content: 'World' })
```

### Changes Required

1. **Client Generation**
   - Generate client methods from query/mutation definitions
   - Type-safe input/output inference

2. **Optimistic Updates**
   - Execute `optimistic()` function on mutation call
   - Apply to local cache
   - Replace/rollback on server response

3. **Multi-Entity Handling**
   - Handle mutations returning `{ users: [User], notifications: [Notification] }`
   - Update cache for multiple entity types

---

## Phase 5: React Hooks Update ⬜ Pending

### New Hooks API

```tsx
function UserProfile() {
  const { data, loading, error } = useQuery(client.whoami)
  // ...
}

function CreatePost() {
  const { mutate, loading } = useMutation(client.createPost)
  // ...
}
```

### Changes Required

1. Update `useQuery()` to accept operation references
2. Update `useMutation()` to handle optimistic updates
3. Support dependency arrays for reactive queries

---

## Test Coverage

| Package | Tests | Status |
|---------|-------|--------|
| @lens/core | 191 | ✅ |
| @lens/server | 124 | ✅ (+27 new) |
| @lens/client | 167 | ✅ |
| **Total** | **482** | ✅ |

---

## Commits (Recent)

| Hash | Description |
|------|-------------|
| `2311c15` | feat(server): add createServerV2 for operations-based API |
| `f2c46e6` | feat(core): add AsyncLocalStorage context system |
| `07f1960` | feat(core): add entityResolvers for nested data handling |
| `92b823b` | feat(core): add new schema and operations API |

---

## Design Rationale

### Why Operations + Entity Resolvers?

**V2 Problem:** Conflated operations with entity CRUD. Couldn't define:
- `whoami` (returns User without ID input)
- `searchUsers` (custom query logic)
- `promoteBatch` (affects multiple entities)

**Solution:** Separate like GraphQL:
- Operations = Entry points (any query/mutation)
- Entity Resolvers = Nested data (reused everywhere)

### Why Type-Safe Relations?

**V2 Problem:** String-based relations (`'Post'`, `'authorId'`) are error-prone.

**Solution:** Direct references with Proxy:
```typescript
hasMany(Post, e => e.authorId)  // TypeScript validates!
```

### Why AsyncLocalStorage?

**V2 Problem:** Passing `ctx` through every function is tedious.

**Solution:** Implicit context with composables:
```typescript
const db = useDB()  // Clean!
const user = useCurrentUser()
```

### Why Multi-Entity Returns?

**V2 Problem:** Can't return multiple entities from one mutation.

**Solution:** Object return type:
```typescript
.returns({ users: [User], notifications: [Notification] })
```

---

## Next Steps

1. ~~**Create `createServerV2()`** - New server accepting operations~~ ✅
2. ~~**Update ExecutionEngine** - Add `executeQuery()`, `executeMutation()`~~ ✅
3. ~~**Integrate Context** - Wrap execution in `runWithContext()`~~ ✅
4. **Create `createClientV2()`** - Client with operations-based API
5. **Update React Hooks** - Accept operation references
