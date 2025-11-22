# @sylphx/lens

**The most powerful type-safe, real-time API framework**

Lens combines:
- **Zod schemas** - Runtime validation + type inference
- **GraphQL** - Frontend-driven field selection
- **tRPC** - Zero codegen, pure TypeScript
- **Pothos** - Code-first schema builder
- **Built-in real-time** - Auto live updates
- **Minimal transfer** - Delta/patch streaming (57-99% bandwidth savings)
- **Pluggable transport** - HTTP, WebSocket, gRPC, in-process, or custom

Zero config. Zero codegen. Pure TypeScript.

---

## Features

- 🎯 **Code-First** - Zod schemas, no SDL
- 🔍 **Frontend-Driven** - Client chooses exact fields (GraphQL-like)
- 📡 **Real-time First** - Auto live updates with minimal transfer
- ⚡ **Optimistic Updates** - Instant UI with auto-rollback
- 🎭 **Framework-Agnostic** - React, Vue, Svelte, Solid, vanilla JS
- 💪 **Full Type Safety** - End-to-end inference, zero codegen
- 🔄 **Smart Streaming** - Auto delta/patch/value optimization
- 🚀 **Minimal Transfer** - 57-99% bandwidth savings
- 🔌 **Pluggable Transport** - HTTP, WebSocket, gRPC, custom
- 📦 **Tiny** - < 15KB gzipped core

---

## Quick Start

### 1. Install

```bash
bun add @sylphx/lens zod
```

### 2. Backend - Define API with Zod

```typescript
// api/user.ts
import { z } from 'zod';
import { lens } from '@sylphx/lens-core';

// 1. Define schemas with Zod
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  bio: z.string(),
  posts: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string()
  })).optional()
});

// 2. Define API with schemas
export const user = lens.object({
  get: lens.query({
    input: z.object({ id: z.string() }),
    output: UserSchema,
    resolve: async ({ id }) => {
      const user = await db.users.findOne({ id });
      const posts = await db.posts.find({ userId: id });
      return { ...user, posts };
    },

    // Optional: manual subscribe for complex cases
    subscribe: ({ id }) => {
      return eventStream.subscribe(`user:${id}`);
    }
  }),

  update: lens.mutation({
    input: z.object({
      id: z.string(),
      data: z.object({
        name: z.string(),
        bio: z.string()
      })
    }),
    output: UserSchema,
    resolve: async ({ id, data }) => {
      return await db.users.update({ id }, data);
    }
  })
});
```

### 3. Server Setup

```typescript
// server.ts
import { createLensServer } from '@sylphx/lens-server';
import { api } from './api';

const server = createLensServer(api, {
  // Auto-subscribe configuration
  autoSubscribe: {
    channelFor: (path, input) => `${path.join(':')}:${input.id}`,
    pubsub: yourPubSubAdapter
  },

  // Minimal transfer - auto optimization
  updateMode: 'auto', // delta/patch/value

  // Compression
  compression: {
    enabled: true,
    algorithm: 'brotli',
    threshold: 1024
  }
});

app.use('/lens', server.handler);
wss.on('connection', server.wsHandler);
```

### 4. Frontend - Type-Safe + Live Updates

```typescript
// client.ts
import { createLensClient } from '@sylphx/lens-client';
import { WebSocketTransport } from '@sylphx/lens-transport-ws';
import type { api } from './api';

const lens = createLensClient<typeof api>({
  transport: new WebSocketTransport({
    url: 'ws://localhost:3000/lens',
    compress: 'brotli'
  })
});

// Usage - fully type-safe!
function UserProfile({ userId }) {
  const user = useLens(
    lens.user.get,
    { id: userId },
    {
      select: {
        id: true,
        name: true,
        bio: true, // Long text - receives as delta (57% savings)
        posts: {
          id: true,
          title: true
        }
      },
      live: true // Auto real-time updates
    }
  );

  const updateUser = useLensMutation(lens.user.update);

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.bio}</p>

      <button onClick={() => updateUser({
        id: userId,
        data: { name: 'John' }
      })}>
        Update
      </button>
    </div>
  );
}
```

---

## Key Features

### 1. Frontend-Driven Field Selection

```typescript
// Select specific fields - saves bandwidth
const user = useLens(lens.user.get, { id: '123' }, {
  select: {
    id: true,
    name: true,
    // bio: false (not fetched)
    posts: {
      id: true,
      title: true
      // content: false (not fetched)
    }
  }
});
// Type: { id: string, name: string, posts: { id: string, title: string }[] }
```

### 2. Real-Time Updates with Minimal Transfer

```typescript
// Live updates with automatic delta optimization
const response = useLens(lens.chat.send, { message: 'Hello' }, {
  live: true
});

// Server streams: "" → "H" → "He" → "Hel" → "Hell" → "Hello"
// Value mode: 26 bytes total
// Delta mode: 11 bytes total (57% savings!)
// With brotli: 8 bytes total (69% savings!)
```

### 3. Optimistic Updates

```typescript
// Instant UI feedback with auto-rollback
const updateUser = useLensMutation(lens.user.update);

await updateUser({ id: '123', data: { name: 'John' } });
// 1. UI updates instantly (optimistic)
// 2. Sends minimal patch to server (99% savings)
// 3. Server confirms or rolls back
// 4. Auto-retry on network errors
```

### 4. Pluggable Transport

```typescript
import {
  HTTPTransport,
  WebSocketTransport,
  InProcessTransport,
  TransportRouter
} from '@sylphx/lens-core';

// Compose transports
const transport = new TransportRouter([
  {
    // Subscriptions → WebSocket
    match: (req) => req.type === 'subscription',
    transport: new WebSocketTransport({ url: 'ws://localhost:3000' })
  },
  {
    // Everything else → HTTP
    match: () => true,
    transport: new HTTPTransport({ url: 'http://localhost:3000' })
  }
]);

// Or use custom transport (gRPC, Redis Streams, WebRTC, etc.)
import { GRPCTransport } from './transports/grpc';
const transport = new GRPCTransport({ host: 'localhost', port: 50051 });
```

### 5. Runtime Validation with Zod

```typescript
// Input validation
await createUser({
  name: '',
  email: 'invalid',
  age: -1
});
// ❌ Zod error:
// - name: String must contain at least 1 character(s)
// - email: Invalid email
// - age: Number must be greater than 0

// Output validation
// Server response is validated before reaching client
// Type-safe + runtime-safe!
```

---

## Performance

### Bandwidth Savings

**LLM Streaming (Text Delta)**
```
Response: "Hello World" (11 chars)
- Value mode: 26 bytes
- Delta mode: 11 bytes (57% savings)
- Delta + brotli: 8 bytes (69% savings)
```

**Object Updates (JSON Patch)**
```
Update: Change user.name from "John" to "Jane"
- Value mode: 50KB (entire object)
- Patch mode: 50 bytes (99.9% savings!)
```

---

## Comparison

| Feature | GraphQL | tRPC | Lens |
|---------|---------|------|------|
| **Schema** | SDL Required | Not required | Zod schemas |
| **Codegen** | Required | Not required | Not required |
| **Type Safety** | Via codegen | ✅ Native | ✅ Native |
| **Field Selection** | ✅ Yes | ❌ No | ✅ Yes |
| **Real-time** | Subscriptions (manual) | Subscriptions (manual) | ✅ Auto |
| **Optimistic** | Manual | Manual | ✅ Built-in |
| **Minimal Transfer** | ❌ No | ❌ No | ✅ Auto delta/patch |
| **Runtime Validation** | ❌ No | ❌ No | ✅ Zod |
| **Transport** | HTTP only | HTTP only | ✅ Pluggable |

---

## Documentation

- [Getting Started](./docs/GETTING_STARTED.md) - Full tutorial
- [API Reference](./docs/API.md) - Complete API docs
- [Transport Guide](./docs/TRANSPORT.md) - Custom transports
- [Examples](./docs/EXAMPLES.md) - Real-world examples
- [Migration Guide](./docs/MIGRATION.md) - From GraphQL/tRPC/REST

---

## License

MIT

---

## Credits

Inspired by:
- **Zod** - Runtime validation
- **tRPC** - Type safety and simplicity
- **GraphQL** - Field selection
- **Pothos** - Code-first schema builder
- **Signals** - Reactive programming
- **JSON Patch (RFC 6902)** - Minimal updates
