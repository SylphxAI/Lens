# Lens Resource Enhancement - Pure Architecture

**Date:** 2025-01-23
**Status:** Design Phase
**Philosophy:** No workarounds, no bridges, architecture-level perfection

---

## Executive Summary

**Problem:** Code project migration exposed fundamental design issues in Lens
**Solution:** Complete architectural redesign with Resource-Based Enhancement as core
**Approach:** Pure reimplementation in ~/lens/ - no compromises, no bridges

---

## Core Philosophy

### ❌ What We REJECT:
- ❌ Bridge layers (architectural debt)
- ❌ Adapter patterns (workarounds)
- ❌ Backward compatibility sacrifices (technical debt)
- ❌ Incremental patches (band-aids)
- ❌ Local implementations (duplication)

### ✅ What We DEMAND:
- ✅ **Architectural perfection** - Clean, unified design
- ✅ **Single source of truth** - ~/lens/ is THE implementation
- ✅ **Complete documentation** - Every decision documented
- ✅ **Systematic execution** - Ordered, deliberate progress
- ✅ **Zero shortcuts** - Do it right the first time

---

## Part 1: Unified Architecture Vision

### **Single API Surface - Resource-First**

```typescript
// UNIFIED PATTERN: Resource definition is the foundation
import { defineResource } from '@sylphx/lens';

const Message = defineResource({
  name: 'message',

  // 1. Schema (Zod)
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

  // 3. Optimistic Updates (built-in, not bolted-on)
  optimistic: {
    idField: 'id',
    apply: (draft, mutation) => {
      Object.assign(draft, mutation.data);
    }
  },

  // 4. Lifecycle Hooks (integrated)
  hooks: {
    beforeCreate: async (data) => ({
      ...data,
      created_at: new Date()
    }),
    afterUpdate: async (entity) => {
      // Invalidate caches, send notifications
    }
  },

  // 5. Update Strategy (auto-selected)
  updateStrategy: 'auto' // Analyzes field types → Delta/Patch/Value
});
```

### **Generated API - Fully Integrated**

```typescript
// Auto-generated from resource definition
const messageAPI = Message.api;

// Queries - with field selection, auto-batching, subscriptions
const message = await messageAPI.getById.query(
  { id: 'msg-1' },
  {
    select: { id: true, content: true, steps: { id: true } },
    // Auto-applied: DataLoader batching, N+1 elimination
  }
);

// Mutations - with optimistic updates, hooks, events
const updated = await messageAPI.update.mutate({
  id: 'msg-1',
  data: { content: 'New content' }
  // Auto-applied: Optimistic update, hooks, event publishing
});

// Subscriptions - with update strategies, event merging
const subscription = messageAPI.getById.subscribe(
  { id: 'msg-1' },
  { select: { content: true } },
  {
    onData: (msg) => console.log('Updated:', msg),
    // Auto-applied: Delta encoding (57% savings), optimistic merging
  }
);
```

---

## Part 2: Package Architecture

### **NEW Package Structure in ~/lens/**

```
~/lens/packages/

  # CORE (enhanced, not replaced)
  lens-core/
    src/
      schema/
        builder.ts              # Enhanced: Resource-aware
        types.ts                # Enhanced: Resource types
        resource.ts             🆕 NEW - Resource definition
        optimistic.ts           # Existing: Optimistic updates

      query/
        planner.ts              🆕 NEW - Query planning
        optimizer.ts            🆕 NEW - N+1 detection
        executor.ts             🆕 NEW - Query execution

      loader/
        dataloader.ts           🆕 NEW - DataLoader integration
        batching.ts             🆕 NEW - Automatic batching
        caching.ts              🆕 NEW - Per-request caching

      update-strategy/
        auto.ts                 # Existing: Auto strategy
        delta.ts                # Existing: Delta strategy
        patch.ts                # Existing: Patch strategy
        value.ts                # Existing: Value strategy

      transport/
        interface.ts            # Existing: Transport interface
        in-process.ts           # Existing: InProcess transport

  # CLIENT (enhanced)
  lens-client/
    src/
      client.ts                 # Enhanced: Resource-aware client
      optimistic/
        manager.ts              # Existing: OptimisticManager
        cache.ts                # Existing: NormalizedCache
        subscription.ts         # Enhanced: Resource subscriptions

  # SERVER (enhanced)
  lens-server/
    src/
      handlers/
        http.ts                 # Existing: HTTP handler
        websocket.ts            # Existing: WebSocket handler
        resource.ts             🆕 NEW - Resource handler

      subscription/
        manager.ts              🆕 NEW - Resource subscription manager
        events.ts               🆕 NEW - Resource event system

  # REACT (enhanced)
  lens-react/
    src/
      use-resource.ts           🆕 NEW - useResource hook
      use-resource-query.ts     🆕 NEW - useResourceQuery hook
      use-resource-mutation.ts  🆕 NEW - useResourceMutation hook
      use-mutation.ts           # Existing: useMutation hook
      use-query.ts              # Existing: useQuery hook
```

### **Key Principle: Enhancement, Not Replacement**

- Existing packages **enhanced** with resource capabilities
- No separate "resource" packages (unified architecture)
- Resource-first, but Builder Pattern still supported (unified under resource system)

---

## Part 3: Type System Unification

### **Single Type Hierarchy**

```typescript
// Base: Resource Definition
interface ResourceDefinition<TName, TFields, TRelationships> {
  name: TName;
  fields: ZodType<TFields>;
  relationships?: TRelationships;
  optimistic?: OptimisticConfig<TFields>;
  hooks?: ResourceHooks<TFields>;
  updateStrategy?: 'auto' | 'delta' | 'patch' | 'value';
}

// Inferred Types
type InferEntity<T extends ResourceDefinition> = z.infer<T['fields']>;
type InferRelationships<T extends ResourceDefinition> = /* ... */;

// Query Types
type ResourceQuery<T> = {
  query<TSelect>(
    input: { id: string },
    options: {
      select?: Select<InferEntity<T>, TSelect>;
      include?: Include<InferRelationships<T>>;
    }
  ): Promise<Selected<InferEntity<T>, TSelect>>;

  subscribe<TSelect>(
    input: { id: string },
    options: {
      select?: Select<InferEntity<T>, TSelect>;
    },
    handlers: SubscriptionHandlers<Selected<InferEntity<T>, TSelect>>
  ): Subscription;
};

// Generated API Type
type ResourceAPI<T extends ResourceDefinition> = {
  getById: ResourceQuery<T>;
  list: ResourceListQuery<T>;
  create: ResourceMutation<T, 'create'>;
  update: ResourceMutation<T, 'update'>;
  delete: ResourceMutation<T, 'delete'>;
};
```

---

## Part 4: Feature Integration Matrix

### **How Each Feature Integrates (No Bridges)**

| Feature | Current Lens | Enhancement | Integration Approach |
|---------|-------------|-------------|---------------------|
| **Builder Pattern** | Manual lens.query() | Auto-generated from resource | Resource generates Builder Pattern internally |
| **Field Selection** | Select<T> type | include/select options | Unified syntax: Select<T> + include |
| **Optimistic Updates** | OptimisticBuilder | Built into resource | Resource.optimistic → OptimisticBuilder |
| **Update Strategies** | Manual selection | Auto from field types | Resource.updateStrategy → Auto analyzer |
| **Subscriptions** | Manual Observable | Auto-generated | Resource → Auto-subscribe system |
| **DataLoader** | Not built-in | Automatic | Resource → Query planner → DataLoader |
| **N+1 Detection** | Manual | Automatic | Resource → Query analyzer → Batching |
| **Hooks** | Not built-in | Lifecycle hooks | Resource.hooks → Integrated lifecycle |
| **Transport** | Pluggable | Same | No change, works with resources |
| **React Hooks** | Manual hooks | Resource hooks | useResource wraps existing hooks |

### **Integration = Direct Incorporation, Not Adaptation**

```typescript
// ❌ BAD: Bridge/Adapter Pattern
const builderAPI = resourceToBuilder(resource); // NO!

// ✅ GOOD: Direct Integration
const resource = defineResource({ ... });
// Resource internally uses Builder Pattern
// Resource internally uses OptimisticManager
// Resource internally uses DataLoader
// ONE unified system
```

---

## Part 5: Implementation Phases

### **Phase 1: Core Resource System (Week 1)**

**Goal:** Resource definition and registry in lens-core

**Tasks:**
1. Create `lens-core/src/schema/resource.ts`
   - defineResource() API
   - ResourceRegistry (global)
   - Relationship types (hasMany, belongsTo, etc.)
   - Validation system

2. Enhance `lens-core/src/schema/types.ts`
   - Add ResourceDefinition types
   - Add InferEntity, InferRelationships helpers
   - Unify with existing types

3. Create `lens-core/src/query/planner.ts`
   - Query depth analyzer
   - N+1 pattern detector
   - Strategy selector (JOIN/BATCH/LAZY)

4. Create `lens-core/src/loader/dataloader.ts`
   - DataLoader wrapper
   - Batching logic
   - Caching strategy

**Tests:**
- Resource definition validation (20 tests)
- Type inference (15 tests)
- Query planning (10 tests)
- DataLoader batching (10 tests)

**Deliverable:** Resource definition working with full type inference

---

### **Phase 2: Auto-Generation System (Week 2)**

**Goal:** Generate CRUD APIs from resource definitions

**Tasks:**
1. Create `lens-core/src/schema/codegen.ts`
   - generateResourceAPI() function
   - Query generator (getById, list)
   - Mutation generator (create, update, delete)
   - Subscription generator

2. Integrate with Builder Pattern
   - Resource → Internal Builder Pattern
   - Unified API surface
   - No separate "builder" vs "resource" APIs

3. Integrate with Optimistic Updates
   - Resource.optimistic → OptimisticBuilder
   - Auto-apply in mutations
   - Merge with subscriptions

4. Integrate with Update Strategies
   - Resource.updateStrategy → Strategy selector
   - Auto-analyze field types
   - Apply to subscriptions

**Tests:**
- API generation (25 tests)
- Builder integration (15 tests)
- Optimistic integration (20 tests)
- Strategy integration (10 tests)

**Deliverable:** Full CRUD API auto-generated from resource

---

### **Phase 3: Server & Client Integration (Week 3)**

**Goal:** Resource-aware server and client

**Tasks:**
1. Enhance `lens-server/src/handlers/resource.ts`
   - Resource-aware HTTP handler
   - Resource-aware WebSocket handler
   - Auto-subscription setup

2. Enhance `lens-client/src/client.ts`
   - Resource-aware client
   - Auto-optimistic updates
   - Auto-subscriptions

3. Create `lens-react/src/use-resource.ts`
   - useResource() hook
   - useResourceQuery() hook
   - useResourceMutation() hook

4. Integrate event system
   - Resource events (resource:name:id)
   - Relationship events
   - Optimistic event merging

**Tests:**
- Server handlers (20 tests)
- Client integration (25 tests)
- React hooks (15 tests)
- Event system (15 tests)

**Deliverable:** Full-stack resource system working

---

### **Phase 4: Documentation & Migration (Week 4)**

**Goal:** Complete documentation and Code project migration

**Tasks:**
1. Documentation
   - API Reference (complete rewrite)
   - Migration Guide (Builder → Resource)
   - Best Practices
   - Architecture Decision Records (ADRs)

2. Examples
   - Basic resource example
   - Complex relationships example
   - Optimistic updates example
   - Real-time subscriptions example

3. Code Project Migration
   - Define resources for Session, Message, Step
   - Replace manual APIs
   - Test full integration
   - Deploy

4. Cleanup
   - Remove ~/code/packages/lens/ local implementation
   - Archive old code (for reference)
   - Verify no regressions

**Deliverable:** Production-ready Lens with Resource Enhancement

---

## Part 6: Clean Architecture Principles

### **1. Single Responsibility**
- Each package has ONE clear purpose
- No overlap between packages
- Clear boundaries

### **2. Dependency Flow**
```
lens-react
    ↓
lens-client
    ↓
lens-core ← lens-server
    ↓
Zod, RxJS (external)
```

### **3. No Circular Dependencies**
- Strict layering
- Clear import rules
- Type-only imports when needed

### **4. Unified Type System**
- All types in lens-core
- No duplicate type definitions
- Single source of truth

### **5. Pure Functions**
- Query planning: Pure
- API generation: Pure
- Type inference: Compile-time
- Side effects isolated (hooks, events)

---

## Part 7: Documentation Strategy

### **Every Decision Documented**

**Architecture Decision Records (ADRs):**
```
.sylphx/decisions/
  001-resource-first-architecture.md
  002-unified-type-system.md
  003-auto-generation-strategy.md
  004-optimistic-update-integration.md
  005-query-optimization-approach.md
```

**Code Documentation:**
- Every file: Purpose, architecture, examples
- Every function: JSDoc with examples
- Every type: Usage documentation
- Every pattern: Why chosen, alternatives considered

**External Documentation:**
```
docs/
  api/
    resource.md           # defineResource() API
    query.md              # Query system
    mutation.md           # Mutation system
    subscription.md       # Subscription system
    optimistic.md         # Optimistic updates

  guides/
    getting-started.md    # Quick start
    migration.md          # Builder → Resource
    relationships.md      # Relationship patterns
    optimization.md       # Performance optimization

  examples/
    basic-crud.md         # Simple CRUD
    real-time.md          # Real-time updates
    complex-relations.md  # Advanced relationships
```

---

## Part 8: Quality Gates

### **Cannot Proceed to Next Phase Unless:**

**Phase 1 Complete:**
- [ ] All tests passing (55+ tests)
- [ ] Type inference verified
- [ ] Documentation complete
- [ ] Code review approved
- [ ] No TypeScript errors
- [ ] No console.warn in production code

**Phase 2 Complete:**
- [ ] All tests passing (70+ tests)
- [ ] Builder integration verified
- [ ] Optimistic updates working
- [ ] Update strategies integrated
- [ ] Documentation complete
- [ ] Code review approved

**Phase 3 Complete:**
- [ ] All tests passing (75+ tests)
- [ ] Server handlers working
- [ ] Client integration verified
- [ ] React hooks tested
- [ ] End-to-end test passing
- [ ] Documentation complete

**Phase 4 Complete:**
- [ ] Code project migrated successfully
- [ ] No regressions
- [ ] Local implementation removed
- [ ] All documentation published
- [ ] Production deployment successful

---

## Part 9: Success Criteria

### **Architecture-Level Success:**
- ✅ Single, unified API (no separate Builder vs Resource)
- ✅ Zero bridges or adapters
- ✅ Zero workarounds
- ✅ Complete type inference
- ✅ Automatic optimization (N+1 elimination)
- ✅ Integrated optimistic updates
- ✅ Integrated update strategies
- ✅ Clean package boundaries

### **Code-Level Success:**
- ✅ 75% code reduction for resources (vs manual)
- ✅ 100% type safety
- ✅ Zero runtime errors
- ✅ 90%+ test coverage
- ✅ Zero TODO comments
- ✅ Zero console.warn in production

### **Documentation Success:**
- ✅ Every decision documented (ADRs)
- ✅ Every API documented (JSDoc + guides)
- ✅ Migration guide complete
- ✅ Examples for all patterns
- ✅ Architecture diagrams

### **Project-Level Success:**
- ✅ Code project using official Lens
- ✅ Local implementation removed
- ✅ No regressions
- ✅ Production stable
- ✅ Team trained

---

## Part 10: Risk Management

### **Risk: Breaking Existing Lens Users**
**Mitigation:**
- All changes in lens-core are ADDITIVE
- Existing Builder Pattern still works
- Resource system is NEW capability
- Deprecation path for old patterns

### **Risk: Performance Regression**
**Mitigation:**
- Benchmark before/after
- Query planner optimizes automatically
- DataLoader ensures batching
- Update strategies reduce bandwidth

### **Risk: Type Inference Breaking**
**Mitigation:**
- Type tests at each phase
- tsc --noEmit verification
- Example code compilation tests

### **Risk: Timeline Slippage**
**Mitigation:**
- Strict quality gates
- Cannot proceed without tests passing
- Daily progress tracking
- Weekly reviews

---

## Part 11: Execution Plan

### **Week 1: Core Resource System**

**Day 1:**
- [ ] Create branch: `feat/resource-enhancement`
- [ ] Create ADR-001: Resource-First Architecture
- [ ] Set up package structure in lens-core

**Day 2:**
- [ ] Implement defineResource() API
- [ ] Implement ResourceRegistry
- [ ] Implement relationship types

**Day 3:**
- [ ] Implement query planner
- [ ] Implement N+1 detector
- [ ] Write tests (20 tests)

**Day 4:**
- [ ] Implement DataLoader integration
- [ ] Implement batching logic
- [ ] Write tests (10 tests)

**Day 5:**
- [ ] Type inference verification
- [ ] Documentation
- [ ] Code review
- [ ] Commit: "feat(core): Resource definition system"

### **Week 2: Auto-Generation System**

**Day 1:**
- [ ] Implement API generator
- [ ] Query handlers (getById, list)
- [ ] Write tests (15 tests)

**Day 2:**
- [ ] Mutation handlers (create, update, delete)
- [ ] Lifecycle hooks integration
- [ ] Write tests (10 tests)

**Day 3:**
- [ ] Builder Pattern integration
- [ ] Optimistic updates integration
- [ ] Write tests (20 tests)

**Day 4:**
- [ ] Update strategies integration
- [ ] Subscription generation
- [ ] Write tests (10 tests)

**Day 5:**
- [ ] Full integration test
- [ ] Documentation
- [ ] Code review
- [ ] Commit: "feat(core): Auto-generation system"

### **Week 3: Server & Client Integration**

**Day 1:**
- [ ] Resource-aware HTTP handler
- [ ] Resource-aware WebSocket handler
- [ ] Write tests (10 tests)

**Day 2:**
- [ ] Resource-aware client
- [ ] Auto-optimistic updates
- [ ] Write tests (15 tests)

**Day 3:**
- [ ] React hooks (useResource, etc.)
- [ ] Hook tests (15 tests)

**Day 4:**
- [ ] Event system integration
- [ ] End-to-end tests (10 tests)

**Day 5:**
- [ ] Full integration verification
- [ ] Documentation
- [ ] Code review
- [ ] Commit: "feat(server/client): Resource integration"

### **Week 4: Documentation & Migration**

**Day 1-2:**
- [ ] Write API documentation
- [ ] Write migration guide
- [ ] Write examples

**Day 3-4:**
- [ ] Migrate Code project
- [ ] Test integration
- [ ] Fix any issues

**Day 5:**
- [ ] Remove ~/code/packages/lens/
- [ ] Final verification
- [ ] Merge to main
- [ ] Deploy

---

## Part 12: Local Implementation Cleanup

### **~/code/packages/lens/ Removal Plan**

**Step 1: Archive (for reference)**
```bash
cd ~/code
git mv packages/lens packages/.archive/lens-local-implementation
git commit -m "archive: Move local lens implementation for reference"
```

**Step 2: Update Code Project**
```bash
# package.json - use official Lens
{
  "dependencies": {
    "@sylphx/lens": "workspace:*",
    "@sylphx/lens-client": "workspace:*",
    "@sylphx/lens-react": "workspace:*"
  }
}
```

**Step 3: Update Imports**
```typescript
// Before
import { defineResource } from '../packages/lens/src/resource';

// After
import { defineResource } from '@sylphx/lens';
```

**Step 4: Verify**
- [ ] All tests passing
- [ ] No import errors
- [ ] Type inference working
- [ ] Build successful

**Step 5: Final Cleanup**
```bash
# After verification, remove archive
rm -rf packages/.archive/lens-local-implementation
git commit -m "cleanup: Remove local lens implementation"
```

---

## Appendix: Implementation Checklist

### **Phase 1: Core Resource System**
- [ ] defineResource() implemented
- [ ] ResourceRegistry implemented
- [ ] Relationship types (hasMany, belongsTo, hasOne, manyToMany)
- [ ] Query planner implemented
- [ ] N+1 detector implemented
- [ ] DataLoader integration
- [ ] 55+ tests passing
- [ ] Documentation complete
- [ ] ADR-001 written

### **Phase 2: Auto-Generation**
- [ ] generateResourceAPI() implemented
- [ ] Query handlers (getById, list)
- [ ] Mutation handlers (create, update, delete)
- [ ] Lifecycle hooks working
- [ ] Builder Pattern integration
- [ ] Optimistic updates integration
- [ ] Update strategies integration
- [ ] Subscription generation
- [ ] 70+ tests passing
- [ ] Documentation complete
- [ ] ADR-002, ADR-003 written

### **Phase 3: Server & Client**
- [ ] Resource-aware HTTP handler
- [ ] Resource-aware WebSocket handler
- [ ] Resource-aware client
- [ ] Auto-optimistic updates
- [ ] React hooks (useResource, etc.)
- [ ] Event system
- [ ] 75+ tests passing
- [ ] End-to-end tests passing
- [ ] Documentation complete
- [ ] ADR-004 written

### **Phase 4: Migration & Cleanup**
- [ ] API documentation complete
- [ ] Migration guide complete
- [ ] Examples complete
- [ ] Code project migrated
- [ ] All Code tests passing
- [ ] Local implementation removed
- [ ] Production deployment successful
- [ ] Team training complete

---

## Final Commitment

**No bridges. No workarounds. Architecture-level perfection.**

This is not a migration. This is a **redesign**.
This is not an enhancement. This is a **transformation**.
This is not a patch. This is **architectural excellence**.

We build it right. We build it once. We build it perfect.
