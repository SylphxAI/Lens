---
"@sylphx/lens": major
"@sylphx/lens-core": major
"@sylphx/lens-client": major
"@sylphx/lens-server": major
"@sylphx/lens-react": major
"@sylphx/lens-solid": major
"@sylphx/lens-vue": major
"@sylphx/lens-svelte": major
---

# Lens v1.0 - Type-safe, Real-time API Framework

First stable release of Lens - bringing GraphQL concepts to TypeScript with zero codegen.

## @sylphx/lens-core

- Schema builder with Zod integration
- Type-safe entity and relation definitions
- Operations API (`query()`, `mutation()`) with fluent builder pattern
- **Router API** (`router()`) for tRPC-style namespaced operations
- Auto-derived optimistic updates from naming conventions
- Full TypeScript type inference
- **tRPC-style context**: `ctx` passed directly to resolvers

## @sylphx/lens-client

- Type-safe client with tRPC-style links architecture
- **Nested proxy** for router-based namespaced access (`client.user.get()`)
- Composable middleware: `httpLink`, `websocketLink`, `sseLink`, `loggerLink`, `retryLink`, `batchLink`

## @sylphx/lens-server

- Resolver-based execution engine
- **Router support** for namespaced operations
- DataLoader pattern for N+1 elimination
- WebSocket server with subscription support
- Context passed directly to resolvers (tRPC style)

## Framework Adapters

- @sylphx/lens-react: React hooks
- @sylphx/lens-solid: SolidJS primitives
- @sylphx/lens-vue: Vue composables
- @sylphx/lens-svelte: Svelte stores
