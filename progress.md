# Progress

## Current Status

- **Version**: 1.1.1
- **Build**: ✅ Passing
- **Tests**: ✅ All passing (56 test files)
- **Score**: 95%

## Architecture

Lens is a **GraphQL-like frontend-driven framework** with these core innovations:

1. **Live Queries** - Every query is automatically subscribable
2. **Incremental Transfer** - Server computes and sends only diffs
3. **Type-safe E2E** - Full TypeScript inference, no codegen

### Design Principles

```
GraphQL Principles          Lens Innovations
────────────────────────────────────────────
Schema-driven               + Live Queries (any query subscribable)
Field-level resolution      + Incremental Transfer (diff only)
Field arguments             + Optimistic Updates (built-in)
Selection sets              + Type-safe E2E (no codegen)
```

## Core Concepts

### 1. Entity (Shape Definition)

Entities define scalar fields only. No relations - avoids circular references:

```typescript
const User = entity("User", {
  id: t.id(),
  name: t.string(),
  email: t.string(),
})
```

### 2. Field Resolver (with Arguments)

GraphQL-style field resolvers with field-level arguments:

```typescript
resolver(User, (f) => ({
  // Expose scalar
  id: f.expose("id"),
  name: f.expose("name"),

  // Computed field
  displayName: f.string().resolve((user) => `${user.name}`),

  // Relation with field args
  posts: f.many(Post)
    .args(z.object({
      first: z.number().default(10),
      published: z.boolean().optional(),
    }))
    .resolve((user, args, ctx) =>
      ctx.db.posts.find({ authorId: user.id, ...args })
    ),
}))
```

### 3. Field Resolver Signature

```typescript
(parent: TParent, args: TArgs, ctx: TContext) => TResult | Promise<TResult>
```

### 4. Client Selection with Field Args

```typescript
client.user.get({ id: "1" }, {
  select: {
    name: true,
    posts: {
      args: { first: 5, published: true },
      select: { title: true }
    }
  }
})
```

### 5. emit (Operation Level Only)

`emit` is for operation resolvers, not field resolvers:

```typescript
const getUser = query()
  .returns(User)
  .resolve(({ input, ctx, emit, onCleanup }) => {
    ctx.db.onChange(() => emit(ctx.db.users.find(input.id)))
    return ctx.db.users.find(input.id)
  })
```

## Recent Changes

### v1.2.0 (WIP)

- **GraphQL-like field arguments** - `.args(schema).resolve((parent, args, ctx) => ...)`
- **New resolver() API** - Field builder pattern for type-safe field definitions
- **Updated resolver signature** - `(parent, args, ctx)` matches GraphQL
- **Client field args** - `{ posts: { args: { first: 5 }, select: { title: true } } }`
- **Removed relation()** - Relations now defined in resolver with `f.one()`/`f.many()`

### v1.1.1

- Lazy connection: `createClient` is now sync
- Eager handshake with deferred execution
- Fixed mutation detection using server metadata
- Added turbo for monorepo builds

### v1.1.0

- Updated route() syntax to object format

## Packages

| Package | Status |
|---------|--------|
| @sylphx/lens | ✅ Published |
| @sylphx/lens-core | ✅ Published |
| @sylphx/lens-client | ✅ Published |
| @sylphx/lens-server | ✅ Published |
| @sylphx/lens-react | ✅ Published |
| @sylphx/lens-vue | ✅ Published |
| @sylphx/lens-solid | ✅ Published |
| @sylphx/lens-svelte | ✅ Published |
| @sylphx/lens-preact | ✅ Published |
| @sylphx/lens-next | ✅ Published |
| @sylphx/lens-nuxt | ✅ Published |
| @sylphx/lens-fresh | ✅ Published |
| @sylphx/lens-solidstart | ✅ Published |

## TODO

### v1.2.0 - Field Arguments

- [x] Design field arguments API
- [x] Update README with GraphQL-like design
- [x] Implement resolver() with field builder
- [ ] Add .args() method to FieldBuilder
- [ ] Update resolver signature to (parent, args, ctx)
- [ ] Add field args support in client selection types
- [ ] Update server to process field arguments
- [ ] Add tests for field arguments
- [ ] Update v2-complete example

### Backlog

- [ ] Align dependency versions across packages
- [ ] DataLoader integration for batching
- [ ] Field-level authorization
