# Lens Project Context

## What (Internal)

Lens is a **TypeScript-first, frontend-driven API framework** that combines the best aspects of tRPC, GraphQL, and Pothos.

**Scope:**
- Universal API builder (REST/RPC/GraphQL compatible)
- End-to-end type safety without code generation
- Frontend-driven field selection
- Real-time subscriptions with update strategies
- Zero runtime overhead (pure type layer)

**Target:**
- Full-stack TypeScript developers
- Teams building reactive, real-time UIs
- Applications with LLM streaming
- Bandwidth-sensitive scenarios

**Out of Scope:**
- GraphQL SDL parsing (use TypeScript + Zod)
- Non-TypeScript environments
- Schema stitching/federation (for now)
- Built-in authentication (use middleware)

---

## Why (Business/Internal)

**Problem:** Current full-stack TypeScript API solutions force compromise:
- **tRPC**: Great type safety, but no field selection, always over-fetches
- **GraphQL**: Flexible queries, but requires codegen, complex setup, runtime overhead
- **Pothos**: Excellent GraphQL DX, but GraphQL-only, not universal
- **REST frameworks**: No end-to-end type safety

**Market Gap:**
Developers want **tRPC-level type safety** + **GraphQL-level flexibility** without the complexity.

**Lens fills this gap:**
- TypeScript-first (like tRPC) ✅
- Field selection (like GraphQL) ✅
- Builder pattern (like Pothos) ✅
- Zero overhead (like tRPC) ✅
- Update strategies (unique) ✅

**Opportunity:**
Capture developers frustrated with:
1. tRPC's lack of field selection
2. GraphQL's complexity and codegen requirement
3. Lack of intelligent update optimization

---

## Key Constraints

### Technical Constraints

**Non-negotiable:**
- **TypeScript-only** - No JavaScript support, types are first-class
- **Zero codegen** - All type inference must be compile-time only
- **Zero runtime overhead** - Pure type layer, no proxies in production
- **Zod schemas** - Schema validation tied to Zod (not pluggable yet)
- **Node.js 18+** - Requires modern Node.js for TypeScript features

**Flexible:**
- Transport layer pluggable (HTTP, WebSocket, in-process)
- Update strategies optional (can use "value" mode always)
- Field selection optional (can fetch full objects)

### Business Constraints

**Non-negotiable:**
- **Open source** - MIT license, community-driven
- **No telemetry** - Zero data collection, privacy-first
- **Offline-capable** - All features work without internet

**Flexible:**
- Documentation can evolve
- Plugin system can be added later
- Additional transports can be contributed

### Design Constraints

**Non-negotiable:**
- **Builder Pattern** - Already migrated, no going back to object config
- **Frontend-driven** - Field selection is core to design
- **Update strategies** - Delta/Patch/Auto modes must exist
- **Unified subscriptions** - `.query(resolve, subscribe)` pattern is final

**Flexible:**
- Middleware pattern for auth/logging
- OpenAPI generation (future enhancement)
- Plugin system architecture (Pothos-inspired)

---

## Boundaries

### In Scope
**What we build:**
- Core type system (`@sylphx/lens-core`)
- Client library (`@sylphx/lens-client`)
- Server adapters (`@sylphx/lens-server`)
- Transport implementations (in-process, HTTP, WebSocket)
- Update strategies (Value, Delta, Patch, Auto)
- Documentation and examples

### Out of Scope
**What we explicitly don't build:**
- GraphQL runtime (use graphql-js if needed)
- Authentication system (use middleware pattern)
- Caching layer (use transport-level caching)
- Code generation tools (against core philosophy)
- Non-TypeScript bindings
- Schema stitching/federation (monolithic for now)

---

## SSOT References

**Code:**
- Dependencies: `packages/*/package.json`
- Type definitions: `packages/lens-core/src/schema/types.ts`
- Builder implementation: `packages/lens-core/src/schema/builder.ts`
- Update strategies: `packages/lens-core/src/update-strategy/`

**Configuration:**
- Monorepo: Root `package.json` (workspaces)
- TypeScript: `tsconfig.json` in each package
- Build: `tsup.config.ts` in each package

**Documentation:**
- Architecture: `.sylphx/architecture.md`
- Decisions: `.sylphx/decisions/`
- Public docs: `README.md` files in each package

---

## Project History

### Origins
Lens was created to solve problems in a specific project:
- **Problem**: tRPC + custom streaming with inconsistent granularity
- **Issues**: Session updates, status updates, title deltas, usage updates - all different patterns
- **Goal**: Unified API with consistent granularity and minimal transfer

### Evolution
1. **v1**: Object config API (verbose, poor inference)
2. **v2**: Builder Pattern API (current) - tRPC-inspired, better DX
3. **Current**: Fully migrated to Builder Pattern, all legacy code removed

### Design Philosophy Refinement
Original goal: "tRPC + GraphQL + Pothos in one framework"

Current reality: **Goal achieved** ✅
- tRPC: Type safety, zero overhead, builder pattern
- GraphQL: Field selection, subscriptions, flexibility
- Pothos: Clean builder API, excellent DX
- Plus: Unique update strategies (Delta/Patch/Auto)

---

## Current State (2024-12-22)

### Completed ✅
- ✅ Builder Pattern migration (all 54 handlers in code-api)
- ✅ Legacy API removal (QueryConfig/MutationConfig gone)
- ✅ Type system stable (Select, Selected, field inference)
- ✅ Update strategies implemented (Value, Delta, Patch, Auto)
- ✅ Client library with field selection
- ✅ Subscription support in queries
- ✅ Architecture documentation
- ✅ Public README updates
- ✅ Test suite verified (36/36 tests passing)
- ✅ HTTP transport implementation (complete)
- ✅ WebSocket transport implementation (complete)
- ✅ SSE transport implementation (complete)
- ✅ InProcess transport (for embedding server)

### In Progress 🚧
- 🚧 Example applications

### Pending ⬜
- ⬜ OpenAPI generation (future)
- ⬜ Plugin system (future)

---

## Decision Log

Major architectural decisions are documented in `.sylphx/decisions/`:
- ADR-001: Builder Pattern over Object Config
- ADR-002: Field Selection Design
- ADR-003: Update Strategies Design

See individual ADRs for full rationale and trade-offs.
