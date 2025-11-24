# Lens Implementation Plan

> Current Status: **Phase 1** - New Architecture Implementation

---

## Progress Overview

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | New Architecture Design | ✅ Complete |
| 2 | Schema Layer | 🟡 In Progress |
| 3 | Operations Layer | ⬜ Pending |
| 4 | Entity Resolvers | ⬜ Pending |
| 5 | Server Integration | ⬜ Pending |
| 6 | Client Integration | ⬜ Pending |
| 7 | React Hooks | ⬜ Pending |

---

## Architecture Summary

### Three-Layer Design

```
Operations        →  Entry points (any query/mutation)
Entity Resolvers  →  Nested data handling (reused everywhere)
Schema            →  Structure + Relations only
```

### Key Design Decisions

1. **Operations + Entity Resolvers (not CRUD-only)**
   - Operations define any query/mutation (like GraphQL Query/Mutation)
   - Entity Resolvers handle nested data (like GraphQL type resolvers)
   - CRUD is just one pattern, not a limitation

2. **Type-Safe Relations (no strings)**
   - `hasMany(Post, e => e.authorId)` instead of `hasMany('Post', 'authorId')`
   - TypeScript validates at compile time

3. **AsyncLocalStorage Context**
   - `useDB()`, `useCurrentUser()` composables
   - Explicit `ctx` fallback available

4. **Multi-Entity Mutations**
   - `returns({ users: [User], notifications: [Notification] })`
   - Optimistic updates for all affected entities

5. **Simplified API**
   - `entity()` not `defineEntity()`
   - `query()` not `defineQuery()`

---

## Implementation Phases

### Phase 1: Schema Layer ✅ → 🟡

**Goal:** Define entities and type-safe relations

**API:**
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

**Tasks:**
- [ ] Implement `entity()` function
- [ ] Implement field type builders (`t.id()`, `t.string()`, etc.)
- [ ] Implement field modifiers (`.optional()`, `.default()`, `.compute()`)
- [ ] Implement `relation()` function
- [ ] Implement `hasMany()`, `belongsTo()`, `hasOne()` with Proxy field extraction
- [ ] Write tests for all schema functions
- [ ] Ensure full type inference

**TDD Order:**
1. `t.id()`, `t.string()` basics → test type inference
2. `entity()` → test entity creation and typing
3. Field modifiers → test `.optional()`, `.default()`, `.compute()`
4. `hasMany()`, `belongsTo()` → test Proxy field extraction
5. `relation()` → test relation definition
6. Integration → test full schema with relations

---

### Phase 2: Operations Layer ⬜

**Goal:** Define queries and mutations with builder pattern

**API:**
```typescript
export const whoami = query()
  .returns(User)
  .resolve(() => useCurrentUser())

export const createPost = mutation()
  .input(z.object({ title: z.string() }))
  .returns(Post)
  .optimistic(({ input }) => ({ id: tempId(), ...input }))
  .resolve(({ input }) => useDB().post.create({ data: input }))
```

**Tasks:**
- [ ] Implement `query()` builder
- [ ] Implement `mutation()` builder
- [ ] Implement `.input()` with Zod validation
- [ ] Implement `.returns()` with entity type inference
- [ ] Implement `.optimistic()` for mutations
- [ ] Implement `.resolve()` with context injection
- [ ] Support three resolver patterns (return, yield, emit)
- [ ] Write tests for all operation functions

**TDD Order:**
1. `query().returns().resolve()` → basic query
2. `query().input().returns().resolve()` → query with input
3. `mutation().input().returns().resolve()` → basic mutation
4. `mutation()...optimistic()` → optimistic updates
5. Multi-entity returns → `returns({ users, notifications })`
6. Streaming → generator and emit patterns

---

### Phase 3: Entity Resolvers ⬜

**Goal:** Handle nested data resolution

**API:**
```typescript
export const resolvers = entityResolvers({
  User: {
    posts: (user) => useDB().post.findMany({ where: { authorId: user.id } }),
  },
  Post: {
    author: {
      batch: (posts) => { /* N+1 prevention */ },
    },
  },
})
```

**Tasks:**
- [ ] Implement `entityResolvers()` function
- [ ] Support simple resolver functions
- [ ] Support batch resolvers for N+1 prevention
- [ ] Integrate with schema relations
- [ ] Write tests

**TDD Order:**
1. Simple resolver → `posts: (user) => ...`
2. Batch resolver → `author: { batch: (posts) => ... }`
3. Integration with schema → validate resolver matches relations

---

### Phase 4: Context System ⬜

**Goal:** AsyncLocalStorage-based context with composables

**API:**
```typescript
// Server setup
const server = createServer({
  context: async (req) => ({
    db: prisma,
    currentUser: await getUserFromToken(req),
  }),
})

// In resolvers
const user = useCurrentUser()
const db = useDB()
```

**Tasks:**
- [ ] Implement AsyncLocalStorage context store
- [ ] Implement `useContext()`, `useDB()`, `useCurrentUser()` composables
- [ ] Support explicit `ctx` fallback in resolvers
- [ ] Write tests

**TDD Order:**
1. `useContext()` → basic context retrieval
2. Custom composables → `useDB()`, `useCurrentUser()`
3. Explicit ctx fallback → `resolve(({ input, ctx }) => ...)`

---

### Phase 5: Server Integration ⬜

**Goal:** Wire everything together in createServer

**API:**
```typescript
const server = createServer({
  entities,
  relations,
  queries,
  mutations,
  resolvers,
  context: async (req) => ({ ... }),
})

server.listen(3000)
```

**Tasks:**
- [ ] Update `createServer()` to accept new config shape
- [ ] Wire operations to execution engine
- [ ] Wire entity resolvers for nested data
- [ ] Integrate GraphStateManager for reactive updates
- [ ] Support WebSocket transport
- [ ] Write integration tests

---

### Phase 6: Client Integration ⬜

**Goal:** Type-safe client with operation access

**API:**
```typescript
const client = createClient({
  queries,
  mutations,
  links: [websocketLink({ url: '...' })],
})

const me = await client.whoami()
const results = await client.searchUsers({ query: 'john' })
```

**Tasks:**
- [ ] Update `createClient()` to accept operations
- [ ] Generate type-safe accessors from operations
- [ ] Implement optimistic update handling
- [ ] Support `.select()` for nested data
- [ ] Write tests

---

### Phase 7: React Hooks ⬜

**Goal:** React integration with new API

**API:**
```tsx
const { data, loading } = useQuery(client.whoami)
const { mutate } = useMutation(client.createPost)
```

**Tasks:**
- [ ] Update `useQuery()` hook
- [ ] Update `useMutation()` hook
- [ ] Support dependency arrays for reactive queries
- [ ] Write tests

---

## Test Coverage Goals

| Package | Target |
|---------|--------|
| @lens/core | 90%+ |
| @lens/server | 85%+ |
| @lens/client | 85%+ |
| @lens/react | 80%+ |

---

## Migration from V2

The current V2 codebase has CRUD-only design. Migration strategy:

1. **Keep existing tests** where possible (rename to _old if conflicting)
2. **Implement new API** alongside existing code
3. **Migrate tests** to new API as features are implemented
4. **Remove old code** when new implementation is complete

---

## Next Steps

1. Run existing tests to understand current state
2. Start Phase 1: Implement `entity()` and `t.*` type builders
3. Follow TDD: Write test → Implement → Refactor
4. Document progress in this file

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

### Why Zod for Input?

**Problem:** Need runtime validation, but schema uses our type system.

**Decision:** Zod for operation inputs (powerful, familiar), our types for schema.
