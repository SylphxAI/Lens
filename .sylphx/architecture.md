# Lens Architecture

## Design Philosophy

Lens combines the best aspects of tRPC, GraphQL, and Pothos to create a **TypeScript-first, frontend-driven API framework** with perfect type inference and minimal data transfer.

### Core Goals

1. **強類型推導** - tRPC-level type safety without code generation
2. **TypeScript-first** - Schema and types defined in TypeScript
3. **Frontend-driven** - Client decides which fields to fetch (GraphQL-like)
4. **Optimistic updates** - Built-in update strategies for reactive UIs
5. **Minimal transfer** - Intelligent payload optimization (57%-99% savings)

---

## System Overview

Lens provides end-to-end type safety from server to client with three core layers:

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT (Frontend-driven)                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ client.user.get.query(                            │  │
│  │   { id: '1' },                                    │  │
│  │   { select: { id: true, name: true } }  ← Select  │  │
│  │ )                                                 │  │
│  └───────────────────────────────────────────────────┘  │
│         ↓ Type-safe request with field selection        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  TRANSPORT (Pluggable)                                  │
│  • InProcessTransport (direct calls, embedding)         │
│  • HTTPTransport (REST-like, queries/mutations)         │
│  • WebSocketTransport (real-time, bidirectional)        │
│  • SSETransport (real-time, simpler, auto-reconnect)    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  SERVER (Builder Pattern API)                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │ const api = lens.object({                         │  │
│  │   user: lens.object({                             │  │
│  │     get: lens                                     │  │
│  │       .input(z.object({ id: z.string() }))       │  │
│  │       .output(UserSchema)                         │  │
│  │       .query(                                     │  │
│  │         async ({ input, ctx }) => {...},  ← Resolve│  │
│  │         ({ input, ctx }) => Observable    ← Subscribe│  │
│  │       )                                           │  │
│  │   })                                              │  │
│  │ })                                                │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Builder Pattern API (Server)

**Pattern:**
```typescript
lens.input(InputSchema).output(OutputSchema).query(resolveHandler, subscribeHandler?)
```

**Why this design?**
- ✅ **Perfect type inference** - Each method returns new builder with updated types
- ✅ **Cleaner syntax** - `({ input, ctx })` destructuring vs tRPC's `(opts) => opts.input`
- ✅ **Unified API** - Same pattern for queries, mutations, subscriptions
- ✅ **Zero runtime overhead** - Pure TypeScript types, no proxies or reflection

**Comparison with tRPC:**
```typescript
// tRPC
t.procedure
  .input(z.object({ id: z.string() }))
  .query((opts) => {
    const id = opts.input.id;  // ⚠️ Need to access opts.input
    return db.findUser(id);
  })

// Lens
lens
  .input(z.object({ id: z.string() }))
  .output(UserSchema)
  .query(async ({ input, ctx }) => {
    const { id } = input;  // ✅ Direct destructuring
    return ctx.db.findUser(id);
  })
```

### 2. Field Selection (Frontend-driven)

**GraphQL-like selection without GraphQL complexity:**

```typescript
// Client decides which fields to fetch
const user = await client.user.get.query(
  { id: '1' },
  {
    select: {
      id: true,      // ✅ Autocomplete
      name: true,    // ✅ Type-safe
      posts: {       // ✅ Nested selection
        title: true,
        content: true
      }
    }
  }
);

// Type automatically narrows based on selection
// user: { id: string; name: string; posts: Array<{ title: string; content: string }> }
```

**Implementation:**
- `Select<T>` - Type-safe field selector with autocomplete
- `Selected<T, S>` - Extracts selected fields from type
- Zero runtime parsing (unlike GraphQL's AST)
- Full TypeScript validation at compile-time

### 3. Update Strategies (Minimal Transfer)

**Unique to Lens** - Intelligent payload optimization for different scenarios:

#### **Delta Strategy** (LLM Streaming)
```typescript
// Streaming: "" → "H" → "He" → "Hel" → "Hell" → "Hello"
// Value mode: 26 bytes total
// Delta mode: 11 bytes total (57% savings!)
```

#### **Patch Strategy** (Object Updates)
```typescript
// Update user.name: "John" → "Jane"
// Value mode: 50KB (entire object)
// Patch mode: 50 bytes (99.9% savings!)
```

#### **Auto Strategy** (Smart Selection)
```typescript
client.user.get.subscribe(
  { id: '1' },
  { updateMode: 'auto' }  // Automatically picks best strategy
);
```

**Selection logic:**
1. String growth (LLM streaming) → Delta (57% savings)
2. Object updates with >50% savings → Patch (99% savings)
3. Small payloads (<1KB) → Value (simple)
4. Default → Value (safest)

### 4. Real-time Subscriptions

**Unified API** - Queries support both one-time fetch and real-time updates:

```typescript
// Server: Single definition for both
lens
  .input(z.object({ sessionId: z.string() }))
  .output(SessionSchema)
  .query(
    // One-time fetch
    async ({ input, ctx }) => {
      return ctx.db.sessions.findById(input.sessionId);
    },
    // Real-time updates
    ({ input, ctx }): Observable<Session> => {
      return ctx.eventStream
        .subscribe(`session:${input.sessionId}`)
        .pipe(map(event => event.payload));
    }
  )

// Client: Simple switch between modes
const session = await client.session.get.query({ sessionId: '1' });        // One-time
client.session.get.subscribe({ sessionId: '1' }).subscribe(console.log);   // Real-time
```

**Comparison:**
- **tRPC**: Separate `.subscription()` procedures
- **GraphQL**: Separate subscription definitions
- **Lens**: Unified in `.query()` with optional subscribe handler ✅

---

## Design Comparisons

### Lens vs tRPC

| Feature | tRPC | Lens |
|---------|------|------|
| Type inference | ✅ Perfect | ✅ Perfect |
| Builder pattern | ✅ `.input().query()` | ✅ `.input().output().query()` |
| Handler syntax | `(opts) => opts.input` | `({ input, ctx }) => ...` ✅ Cleaner |
| Field selection | ❌ No | ✅ GraphQL-like |
| Update strategies | ❌ No | ✅ Delta/Patch/Auto |
| Subscriptions | Separate `.subscription()` | Unified in `.query()` ✅ |
| Runtime overhead | ✅ Zero | ✅ Zero |

### Lens vs GraphQL

| Feature | GraphQL | Lens |
|---------|---------|------|
| Field selection | ✅ Built-in | ✅ Built-in |
| Type inference | ⚠️ Codegen required | ✅ Native TypeScript |
| Schema definition | SDL or code-first | TypeScript + Zod ✅ |
| Runtime overhead | ⚠️ AST parsing | ✅ Zero |
| Update optimization | ❌ No | ✅ Delta/Patch strategies |
| Subscriptions | ✅ Built-in | ✅ Built-in |

### Lens vs Pothos

| Feature | Pothos | Lens |
|---------|--------|------|
| GraphQL schemas | ✅ Excellent | N/A (universal) |
| Type inference | ✅ Excellent | ✅ Excellent |
| Flexibility | ⚠️ GraphQL only | ✅ REST/RPC/GraphQL |
| Builder pattern | `builder.queryType({ fields: ... })` | `lens.input().query(...)` ✅ Simpler |
| Runtime | ⚠️ GraphQL execution | ✅ Zero overhead |

---

## Unique Advantages

**Lens is the only framework that combines:**

1. ✅ **tRPC-level type safety** without code generation
2. ✅ **GraphQL-level flexibility** (field selection, subscriptions)
3. ✅ **Pothos-level DX** (builder pattern, plugin system potential)
4. ✅ **Zero runtime overhead** (pure type layer like tRPC)
5. ✅ **Intelligent update strategies** (unique to Lens)

**Perfect for:**
- Full-stack TypeScript applications
- Frontend-driven architectures
- Real-time reactive UIs
- LLM streaming applications
- Optimistic update patterns
- Minimal bandwidth scenarios

---

## Architecture Decisions

### Why Builder Pattern over Object Config?

```typescript
// ❌ Old: Object config (verbose, poor inference)
lens.query({
  input: Schema,
  output: Schema,
  resolve: (input, ctx) => ...
})

// ✅ New: Builder pattern (clean, perfect inference)
lens
  .input(Schema)
  .output(Schema)
  .query(({ input, ctx }) => ...)
```

**Reasoning:** (ADR-001)
- Better type inference through method chaining
- Cleaner destructuring syntax
- Follows tRPC's proven pattern
- More intuitive developer experience

### Why Field Selection?

**Problem:** tRPC always returns full objects, wasting bandwidth.

**Solution:** GraphQL-like field selection with TypeScript inference.

**Benefits:**
- Frontend decides what it needs
- Reduces over-fetching
- Type automatically narrows
- No GraphQL complexity (no AST, no resolvers)

**Trade-off:** Additional `select` parameter vs simpler API (ADR-002)

### Why Update Strategies?

**Problem:** Real-time updates send full objects repeatedly.

**Solutions:**
- **Delta**: For LLM streaming (57% savings)
- **Patch**: For object updates (99% savings)
- **Auto**: Intelligent selection

**Impact:**
- Dramatically reduces bandwidth
- Enables real-time UIs at scale
- Critical for LLM streaming

**Trade-off:** Complexity vs performance (ADR-003)

---

## Technical Boundaries

### In Scope
- TypeScript-first API definition
- End-to-end type safety
- Field selection and projection
- Real-time subscriptions
- Update optimization strategies
- Pluggable transport layer

### Out of Scope
- GraphQL SDL parsing (use TypeScript + Zod instead)
- Code generation (pure type inference only)
- Schema stitching/federation (monolithic for now)
- Built-in authentication (middleware pattern instead)
- Built-in caching (transport responsibility)

---

## Future Considerations

### Potential Enhancements
- Plugin system (Pothos-inspired)
- Automatic OpenAPI generation (ts-rest-like)
- Multiple transport strategies (HTTP, WebSocket, SSE)
- Middleware system for auth/logging
- Client-side caching integration

### Non-Goals
- Replacing GraphQL entirely (complementary tool)
- Supporting non-TypeScript environments
- Runtime schema validation (compile-time only)
- Distributed tracing (observability layer)
