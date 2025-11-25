---
"@lens/core": major
"@lens/client": major
"@lens/server": major
"@lens/react": major
"@lens/solid": major
"@lens/vue": major
"@lens/svelte": major
---

# Lens v1.0 - Type-safe, Real-time API Framework

First stable release of Lens - bringing GraphQL concepts to TypeScript with zero codegen.

## @lens/core

- Schema builder with Zod integration
- Type-safe entity and relation definitions (`entity()`, `relation()`, `hasMany()`, `belongsTo()`)
- Operations API (`query()`, `mutation()`) with fluent builder pattern
- Auto-derived optimistic updates from naming conventions
- Full TypeScript type inference

## @lens/client

- Type-safe client with tRPC-style links architecture
- Composable middleware: `httpLink`, `websocketLink`, `sseLink`, `loggerLink`, `retryLink`, `batchLink`
- Reactive store with Preact Signals integration
- Automatic entity caching and deduplication
- QueryResult pattern: thenable, subscribable, chainable

## @lens/server

- Resolver-based execution engine
- DataLoader pattern for N+1 elimination
- WebSocket server with subscription support
- SSE handler for streaming updates
- AsyncLocalStorage context system

## @lens/react

- `LensProvider` for React context injection
- `useQuery`, `useMutation`, `useLazyQuery` hooks
- Operations-based API accepting QueryResult directly
- Full TypeScript support with inferred types

## @lens/solid

- `LensProvider` for SolidJS context injection
- `createQuery`, `createMutation`, `createLazyQuery` primitives
- Reactive signals integration
- Automatic cleanup on unmount

## @lens/vue

- `provideLensClient` / `useLensClient` for Vue provide/inject
- `useQuery`, `useMutation`, `useLazyQuery` composables
- Vue 3 Composition API integration
- Reactive refs for state management

## @lens/svelte

- `provideLensClient` / `useLensClient` for Svelte context
- `query`, `mutation`, `lazyQuery` store factories
- Svelte store integration
- Automatic subscription cleanup
