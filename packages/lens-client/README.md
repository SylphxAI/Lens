# @sylphx/lens-client

Type-safe client for Lens APIs with full type inference from server schema.

## Features

- **End-to-end type safety**: Infer types from server API definition
- **tRPC-like DX**: `client.user.get.query({ id: '1' })`
- **Transport agnostic**: Works with any Lens transport
- **Field selection**: Type-safe field selection with inference
- **Auto-complete**: Full IDE support

## Installation

```bash
bun add @sylphx/lens-client
```

## Usage

### Basic Setup

```typescript
import { createLensClient } from '@sylphx/lens-client';
import { HTTPTransport } from '@sylphx/lens-transport-http';
import type { API } from './server/api'; // Import server API type

const transport = new HTTPTransport({
  url: 'http://localhost:3000/lens'
});

const client = createLensClient<API>({ transport });
```

### Queries

```typescript
// Full type inference
const user = await client.user.get.query({ id: '1' });
//    ^? { id: string; name: string; email: string; ... }

// With field selection
const userBasic = await client.user.get.query(
  { id: '1' },
  { select: ['id', 'name'] }
);
//    ^? { id: string; name: string }
```

### Mutations

```typescript
const updated = await client.user.update.mutate({
  id: '1',
  data: {
    name: 'Alice Smith'
  }
});
//    ^? { id: string; name: string; email: string; ... }
```

### Subscriptions

```typescript
const subscription = client.user.get.subscribe({ id: '1' });

subscription.subscribe({
  next: (user) => {
    console.log('Updated:', user);
    //                     ^? { id: string; name: string; ... }
  },
  error: (err) => console.error(err),
  complete: () => console.log('Done')
});
```

### Nested APIs

```typescript
// Deeply nested paths work seamlessly
const post = await client.blog.posts.get.query({ id: '123' });

const comment = await client.blog.posts.comments.create.mutate({
  postId: '123',
  text: 'Great post!'
});
```

## Type Safety

The client automatically infers:

1. **Input types** from Zod schemas
2. **Output types** from Zod schemas
3. **Available paths** from API structure
4. **Method availability** (query/mutate/subscribe)

```typescript
// TypeScript errors on:
client.user.get.query({ id: 123 }); // ❌ id should be string
client.user.get.mutate({ ... });     // ❌ get is query-only
client.nonexistent.query({ ... });   // ❌ path doesn't exist
```

## Transport Options

Works with any Lens transport:

```typescript
// HTTP
import { HTTPTransport } from '@sylphx/lens-transport-http';
const client = createLensClient<API>({
  transport: new HTTPTransport({ url: '...' })
});

// WebSocket
import { WebSocketTransport } from '@sylphx/lens-transport-ws';
const client = createLensClient<API>({
  transport: new WebSocketTransport({ url: 'ws://...' })
});

// SSE
import { SSETransport } from '@sylphx/lens-transport-sse';
const client = createLensClient<API>({
  transport: new SSETransport({ url: '...' })
});

// In-process (testing/embedding)
import { InProcessTransport } from '@sylphx/lens-core';
const client = createLensClient<API>({
  transport: new InProcessTransport({ api })
});
```

## React Integration

Combine with `@sylphx/lens-react`:

```typescript
import { LensProvider } from '@sylphx/lens-react';
import { createLensClient } from '@sylphx/lens-client';

const client = createLensClient<API>({ transport });

function App() {
  return (
    <LensProvider transport={client._transport}>
      <YourApp />
    </LensProvider>
  );
}
```

## Comparison with tRPC

| Feature | Lens | tRPC |
|---------|------|------|
| Type inference | ✅ Full | ✅ Full |
| Field selection | ✅ Built-in | ❌ Manual |
| Subscriptions | ✅ First-class | ✅ Via wsLink |
| Transport | Pluggable | Links-based |
| Update strategies | ✅ Delta/Patch | ❌ Full updates |
| Schema validation | Zod | Zod |
| Real-time | Auto-subscribe | Manual |
