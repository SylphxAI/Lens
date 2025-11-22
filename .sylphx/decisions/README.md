# Architectural Decision Records

## Index

- [ADR-001: Builder Pattern over Object Config](#adr-001) - **Accepted** (2024-12-22)
- [ADR-002: Field Selection Design](#adr-002) - **Accepted** (2024-11-22)
- [ADR-003: Update Strategies Design](#adr-003) - **Accepted** (2024-11-22)

---

## ADR-001: Builder Pattern over Object Config {#adr-001}

**Status:** ✅ Accepted
**Date:** 2024-12-22

### Context
Need API definition pattern with perfect TypeScript type inference.

### Decision
Use fluent Builder Pattern:
```typescript
lens.input(Schema).output(Schema).query(async ({ input, ctx }) => ...)
```

### Rationale
- **Perfect type inference** - Each method returns new builder with updated type state
- **Cleaner syntax** - Destructuring `({ input, ctx })` vs `(opts) => opts.input`
- **Proven pattern** - tRPC uses same approach successfully
- **Immutability** - Each step returns new builder instance

### Consequences

**Positive:**
- Excellent developer experience
- IDE autocomplete at every step
- No manual type annotations needed
- Follows industry standard (tRPC)

**Negative:**
- Slightly more verbose than object literal
- Cannot use object spread to share config
- Migration required from legacy API

**Supersedes:** Legacy Object Config API (removed 2024-12-22)

**Implementation:** `packages/lens-core/src/schema/builder.ts`

---

## ADR-002: Field Selection Design {#adr-002}

**Status:** ✅ Accepted
**Date:** 2024-11-22

### Context
tRPC always returns full objects, wasting bandwidth. Need GraphQL-like field selection without GraphQL complexity.

### Decision
Add optional `select` parameter with TypeScript type narrowing:

```typescript
const user = await client.user.get.query(
  { id: '1' },
  { select: { id: true, name: true } }
);
// Type: { id: string; name: string } (automatically narrowed)
```

### Rationale
- **Frontend-driven** - Client decides what it needs (core design goal)
- **Type-safe** - `Select<T>` provides autocomplete and validation
- **Minimal transfer** - Reduces over-fetching
- **Zero runtime overhead** - No AST parsing like GraphQL
- **Optional** - Can still fetch full objects

### Consequences

**Positive:**
- Dramatically reduces bandwidth (only fetch needed fields)
- Perfect TypeScript inference based on selection
- Autocomplete for all valid fields
- Compile-time errors for invalid fields
- Nested selection support

**Negative:**
- Additional API surface (`select` parameter)
- Type complexity (`Selected<T, S>` helper)
- Need to implement server-side projection

**Trade-off:** Simplicity vs flexibility - chose flexibility (aligns with frontend-driven goal)

**Implementation:**
- Types: `packages/lens-core/src/schema/types.ts` (Select, Selected)
- Client: `packages/lens-client/src/index.ts` (QueryOptions)
- Server: Transport layer responsibility

---

## ADR-003: Update Strategies Design {#adr-003}

**Status:** ✅ Accepted
**Date:** 2024-11-22

### Context
Real-time updates send full objects repeatedly, wasting bandwidth. Need intelligent payload optimization.

### Decision
Implement multiple update strategies:

1. **Value** - Send full value (default, safest)
2. **Delta** - Send only text differences (LLM streaming)
3. **Patch** - Send JSON Patch operations (object updates)
4. **Auto** - Intelligently select best strategy

### Rationale
- **Critical for real-time** - Subscriptions would be too expensive without optimization
- **LLM streaming** - Delta saves 57% bandwidth on incremental text
- **Object updates** - Patch saves 99% bandwidth on partial changes
- **Flexibility** - Client chooses mode, server adapts

### Consequences

**Positive:**
- **57% savings** on LLM streaming (Delta)
- **99% savings** on object updates (Patch)
- **Auto mode** removes decision burden
- **Pluggable** - Can add new strategies

**Negative:**
- **Complexity** - Four different modes to understand
- **State tracking** - Client must track previous value for decode
- **Edge cases** - Patch can fail, need fallback to Value

**Trade-off:** Complexity vs performance - chose performance (critical for real-time UIs)

**Implementation:** `packages/lens-core/src/update-strategy/`
- `value.ts` - Full value strategy
- `delta.ts` - Text delta strategy
- `patch.ts` - JSON Patch strategy
- `auto.ts` - Intelligent selection
- `types.ts` - Shared interfaces

**Usage:**
```typescript
client.session.get.subscribe(
  { id: '1' },
  { updateMode: 'auto' }  // or 'delta', 'patch', 'value'
);
```

---

## Decision Criteria

When creating new ADRs, document if:
- Changes affect >3 files across packages
- Introduces breaking changes
- Requires migration from existing pattern
- Multiple valid approaches exist
- Performance/security implications
- Architectural philosophy shift

**Template:** Use format above (Status, Date, Context, Decision, Rationale, Consequences, Implementation)
