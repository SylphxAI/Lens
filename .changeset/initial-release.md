---
"@lens/core": minor
"@lens/client": minor
"@lens/server": minor
"@lens/react": minor
---

Initial release of Lens - Type-safe, real-time API framework

**@lens/core**
- Schema builder with Zod integration
- Type-safe entity and relation definitions
- Optimistic builder for conflict resolution
- Full TypeScript type inference
- Code generation for clients and servers

**@lens/client**
- LensClient with signals-based state management
- Preact Signals integration (@preact/signals-core)
- Three transport options: WebSocket, HTTP, SSE
- Automatic entity caching and reactive updates
- Type-safe query and mutation builders

**@lens/server**
- Resolver-based execution engine
- DataLoader pattern for N+1 elimination
- WebSocket server with subscription support
- SSE handler for streaming updates
- Progress tracking for long-running operations (embeddings, etc.)

**@lens/react**
- LensProvider for React context
- useEntity, useList, useMutation hooks
- useSignalValue and useLensComputed utilities
- Full TypeScript support with inferred types
