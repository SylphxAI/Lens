# ADR-001: Resource-First Architecture

**Status:** ✅ Accepted
**Date:** 2025-01-23
**Deciders:** Core Team
**Impact:** Breaking Change - Complete Redesign

---

## Context

### Original Lens Design Flaws

Lens was initially designed with a Builder Pattern API that required **manual implementation** of every query, mutation, and subscription:

```typescript
// OLD DESIGN (Manual, Verbose, Error-Prone)
const api = lens.object({
  user: {
    get: lens.input(z.object({ id: z.string() }))
              .output(UserSchema)
              .query(async ({ input, ctx }) => {
                // Manual query logic
                return await ctx.db.users.findOne(input.id);
              }, ({ input, ctx }) => {
                // Manual subscription logic
                return ctx.eventStream.subscribe(`user:${input.id}`);
              }),

    list: lens.output(z.array(UserSchema))
               .query(async ({ ctx }) => {
                 // Manual query logic
                 return await ctx.db.users.findMany();
               }),

    update: lens.input(UpdateUserSchema)
                 .output(UserSchema)
                 .mutation(async ({ input, ctx }) => {
                   // Manual mutation logic
                   return await ctx.db.users.update(input.id, input.data);
                 })
  }
});
```

### Problems with Old Design

1. **Massive Boilerplate** - ~200 lines per resource
2. **No Automatic Optimization** - Manual N+1 prevention
3. **No DataLoader Integration** - Manual batching
4. **Inconsistent Patterns** - Each developer implements differently
5. **No Relationship Support** - Manual joins/includes
6. **No Lifecycle Hooks** - Side effects scattered
7. **Subscription Duplication** - Manual Observable setup every time

### Why Redesign Now

Code project migration exposed that **manual API definition doesn't scale**:
- Session, Message, Step resources = 600+ lines of repetitive code
- N+1 queries everywhere (messages → steps, session → messages → steps)
- Subscription logic duplicated across resources
- No optimistic updates integration
- Update strategies manually configured

**Conclusion:** The Builder Pattern API is fundamentally wrong for resource-based systems.

---

## Decision

**Adopt Resource-First Architecture** - Resources are the foundation, everything else auto-generated.

### New Architecture

```typescript
// NEW DESIGN (Declarative, Automatic, Optimized)
const Message = defineResource({
  name: 'message',

  // 1. Schema
  fields: z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  }),

  // 2. Relationships (declarative)
  relationships: {
    steps: hasMany('step', { foreignKey: 'message_id' }),
    session: belongsTo('session', { foreignKey: 'session_id' })
  },

  // 3. Optimistic Updates (built-in)
  optimistic: {
    idField: 'id',
    apply: (draft, mutation) => {
      Object.assign(draft, mutation.data);
    }
  },

  // 4. Lifecycle Hooks
  hooks: {
    beforeCreate: async (data) => ({
      ...data,
      created_at: new Date()
    })
  },

  // 5. Update Strategy (auto-selected)
  updateStrategy: 'auto'
});

// Auto-generated API (ZERO manual code)
const messageAPI = Message.api;

// Usage - Everything automatic:
// - DataLoader batching ✅
// - N+1 elimination ✅
// - Optimistic updates ✅
// - Update strategies ✅
// - Subscriptions ✅
// - Type inference ✅
const message = await messageAPI.getById.query(
  { id: 'msg-1' },
  { include: { steps: true } }
);
```

---

## Rationale

### 1. Declarative Over Imperative

**Before:** Imperative - "How to fetch data"
```typescript
query: async ({ input, ctx }) => {
  return await ctx.db.users.findOne(input.id);
}
```

**After:** Declarative - "What data looks like"
```typescript
defineResource({
  fields: z.object({ id: z.string(), name: z.string() })
})
```

**Benefit:** Framework handles "how", developer specifies "what"

### 2. DRY Principle

**Before:** Repeat for every operation
- getById: Manual
- list: Manual
- create: Manual
- update: Manual
- delete: Manual
- subscribe: Manual (x5 = 5 manual subscriptions)

**After:** Define once, generate all
- Resource definition: **One** declaration
- Generated operations: **All** automatic

**Benefit:** 75-90% code reduction

### 3. Correctness by Construction

**Before:** Easy to forget:
- ❌ Forget to add subscription
- ❌ Forget to use DataLoader
- ❌ Forget optimistic updates
- ❌ Forget lifecycle hooks
- ❌ Forget field selection

**After:** Impossible to forget:
- ✅ Subscriptions auto-generated
- ✅ DataLoader always used
- ✅ Optimistic updates integrated
- ✅ Hooks always executed
- ✅ Field selection built-in

**Benefit:** Zero-error architecture

### 4. Automatic Optimization

**Before:** Manual optimization
```typescript
// Developer must remember:
const loader = new DataLoader(...);
const users = await loader.loadMany(ids);
```

**After:** Automatic optimization
```typescript
// Framework automatically:
// 1. Detects N+1 pattern
// 2. Creates DataLoader
// 3. Batches queries
// 4. Caches results
```

**Benefit:** Performance by default

### 5. Unified Type System

**Before:** Scattered types
- Zod schema for input
- Zod schema for output
- Manual type inference
- Separate types for selection

**After:** Unified resource types
- Resource definition = Single source
- All types inferred from resource
- Relationships typed automatically

**Benefit:** Type safety everywhere

---

## Consequences

### Positive

**Developer Experience:**
- ✅ 75-90% code reduction
- ✅ No boilerplate
- ✅ Automatic optimization
- ✅ Type-safe by default
- ✅ Consistent patterns
- ✅ Faster development

**Performance:**
- ✅ Automatic N+1 elimination
- ✅ DataLoader batching
- ✅ Update strategies (57-99% bandwidth savings)
- ✅ Query planning
- ✅ Caching

**Maintainability:**
- ✅ Single source of truth (resource definition)
- ✅ Centralized optimization
- ✅ Easy to reason about
- ✅ Less code to maintain

**Scalability:**
- ✅ Framework optimizes as app grows
- ✅ No per-resource tuning
- ✅ Consistent architecture

### Negative

**Breaking Changes:**
- ❌ **Complete API redesign** - Cannot maintain backward compatibility
- ❌ All existing Lens code must be migrated
- ❌ Different mental model (declarative vs imperative)

**Learning Curve:**
- ⚠️ New concepts (resources, relationships, auto-generation)
- ⚠️ Different from Builder Pattern
- ⚠️ More "magic" (less explicit control)

**Migration Effort:**
- ⚠️ Rewrite all existing APIs
- ⚠️ Update documentation
- ⚠️ Team training

**Trade-offs:**
- ⚠️ Less control over individual queries
- ⚠️ Framework lock-in (more opinionated)
- ⚠️ Harder to customize edge cases

---

## Alternatives Considered

### Alternative 1: Keep Builder Pattern, Add Resource Layer

**Approach:** Add resource system on top of Builder Pattern
```typescript
const resource = defineResource({ ... });
const builderAPI = resourceToBuilder(resource); // Adapter
```

**Pros:**
- ✅ Backward compatible
- ✅ Gradual migration

**Cons:**
- ❌ **Two APIs to maintain** (technical debt)
- ❌ Complexity from adapter layer
- ❌ Doesn't fix design flaws
- ❌ Bridge pattern = workaround

**Decision:** **REJECTED** - Workarounds are forbidden

### Alternative 2: Enhance Builder Pattern with Macros

**Approach:** Add codegen to reduce boilerplate
```typescript
// Macro expands to full Builder Pattern
@resource({ ... })
class User { ... }
```

**Pros:**
- ✅ Familiar Builder Pattern
- ✅ Reduces boilerplate

**Cons:**
- ❌ Build-time complexity
- ❌ Still requires manual patterns
- ❌ Doesn't solve fundamental issues
- ❌ TypeScript inference breaks

**Decision:** **REJECTED** - Doesn't address root cause

### Alternative 3: Use Existing ORM (Prisma, Drizzle)

**Approach:** Abandon custom framework, use existing ORM

**Pros:**
- ✅ Battle-tested
- ✅ Large community
- ✅ Feature-rich

**Cons:**
- ❌ No real-time subscriptions
- ❌ No optimistic updates
- ❌ No update strategies
- ❌ No frontend-driven field selection
- ❌ Doesn't solve Code project problems

**Decision:** **REJECTED** - Doesn't meet requirements

---

## Design Principles

### 1. Resources as First-Class Citizens

Resources are **not** a feature. Resources are **the foundation**.

Everything else (queries, mutations, subscriptions, types, optimizations) derives from resource definitions.

### 2. Auto-Generation by Default

If it can be auto-generated, it **must** be auto-generated.

Manual implementation is only for edge cases with escape hatches.

### 3. Performance is Not Optional

Optimization (N+1 elimination, batching, caching, update strategies) is **automatic**, not opt-in.

### 4. Type Safety Everywhere

TypeScript inference from resource definition to query result. Zero `as` casts, zero runtime type errors.

### 5. Zero Compromises

No backward compatibility. No workarounds. No bridges. Architecture-level perfection only.

---

## Implementation Strategy

### Phase 1: Core Resource System
- defineResource() API
- ResourceRegistry
- Relationship types
- Type inference

### Phase 2: Auto-Generation
- Query handlers (getById, list)
- Mutation handlers (create, update, delete)
- Subscription handlers
- Integration with optimistic updates

### Phase 3: Optimization Layer
- Query planner
- N+1 detector
- DataLoader integration
- Update strategies integration

### Phase 4: Migration & Deprecation
- Migrate Code project
- Deprecate Builder Pattern
- Remove old APIs
- Update documentation

---

## Migration Path

### For Code Project (Primary User)

```typescript
// BEFORE: Manual Builder Pattern (~200 lines)
const sessionAPI = lens.object({
  getById: lens.input(...).output(...).query(...),
  list: lens.output(...).query(...),
  // ... 200 lines of boilerplate
});

// AFTER: Resource Definition (~40 lines)
const Session = defineResource({
  name: 'session',
  fields: SessionSchema,
  relationships: {
    messages: hasMany('message')
  }
});

const sessionAPI = Session.api; // Auto-generated!
```

**Reduction:** 200 lines → 40 lines = **80% code reduction**

---

## Success Criteria

- ✅ Code reduction: 75-90% (vs manual)
- ✅ Type safety: 100% (no `as` casts)
- ✅ N+1 queries: 0 (automatic elimination)
- ✅ Test coverage: 90%+
- ✅ Documentation: Complete
- ✅ Migration: Code project successful
- ✅ Performance: Same or better than manual

---

## References

- **Problem Source:** Code project migration pain points
- **Inspiration:** Prisma (schema-first), GraphQL (relationships), tRPC (type inference)
- **Implementation:** `~/lens/.sylphx/resource-enhancement-pure-architecture.md`
- **Related:** `.sylphx/context.md` (Lens original goals)

---

## Decision

**Status:** ✅ **ACCEPTED**

**Commitment:** Complete redesign. Zero backward compatibility. Architecture-level perfection.

**Timeline:** 4 weeks
**Risk:** Medium (breaking changes) → Mitigated (Code is only user, we control migration)
**Reward:** High (solves fundamental design flaws, enables scale)

---

## Sign-off

**Date:** 2025-01-23
**Decision Maker:** Core Team
**Next Action:** Begin Phase 1 implementation
