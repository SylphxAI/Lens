# @sylphx/lens-core

**Type-safe, real-time API framework core**

The foundation of Lens - combining GraphQL field selection, tRPC type inference, and Zod validation.

## Features

- 🎯 **Code-First** - Zod schemas, no SDL
- 🔍 **Frontend-Driven** - Client chooses exact fields
- 📡 **Pluggable Transport** - HTTP, WebSocket, gRPC, in-process, custom
- ⚡ **Minimal Transfer** - Delta/Patch/Value strategies (57-99% bandwidth savings)
- 💪 **Full Type Safety** - End-to-end inference, zero codegen
- 🔄 **Smart Streaming** - Auto delta/patch/value optimization
- 📦 **Tiny** - < 15KB gzipped

## Installation

```bash
bun add @sylphx/lens-core zod
```

## Quick Start

### 1. Define API with Zod

```typescript
import { z } from 'zod';
import { lens } from '@sylphx/lens-core';

// Define schemas
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  bio: z.string(),
});

// Define API
export const api = lens.object({
  user: lens.object({
    get: lens.query({
      input: z.object({ id: z.string() }),
      output: UserSchema,
      resolve: async ({ id }) => {
        return await db.users.findOne({ id });
      },
    }),

    update: lens.mutation({
      input: z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          bio: z.string().optional(),
        }),
      }),
      output: UserSchema,
      resolve: async ({ id, data }) => {
        return await db.users.update({ id }, data);
      },
    }),
  }),
});
```

### 2. Use with Transport

```typescript
import { InProcessTransport } from '@sylphx/lens-core';
import { api } from './api';

// Create transport
const transport = new InProcessTransport({ api });

// Query with field selection
const user = await transport.send({
  type: 'query',
  path: ['user', 'get'],
  input: { id: '123' },
  select: ['id', 'name', 'email'], // Frontend-driven!
});
// Type: { id: string; name: string; email: string }

// Mutation
const updated = await transport.send({
  type: 'mutation',
  path: ['user', 'update'],
  input: {
    id: '123',
    data: { name: 'Jane' }
  },
});
```

## Core Concepts

### Schema Builder

```typescript
// Query: Read operation
const getUser = lens.query({
  input: z.object({ id: z.string() }),
  output: UserSchema,
  resolve: async ({ id }) => db.users.findOne({ id }),
});

// Mutation: Write operation
const updateUser = lens.mutation({
  input: z.object({ id: z.string(), data: UpdateSchema }),
  output: UserSchema,
  resolve: async ({ id, data }) => db.users.update({ id }, data),
});

// Object: Group queries/mutations
const userAPI = lens.object({
  get: getUser,
  update: updateUser,
});
```

### Field Selection

**Array Syntax:**
```typescript
select: ['id', 'name', 'email']
// Result: { id: string; name: string; email: string }
```

**Object Syntax:**
```typescript
select: {
  id: true,
  name: true,
  posts: {
    id: true,
    title: true
  }
}
// Result: { id: string; name: string; posts: { id: string; title: string }[] }
```

### Transport Layer

**InProcess (for TUI/CLI/Testing):**
```typescript
const transport = new InProcessTransport({ api });
```

**Custom Transport:**
```typescript
import type { LensTransport } from '@sylphx/lens-core';

class MyTransport implements LensTransport {
  send<T>(request: LensRequest): Promise<T> | Observable<T> {
    // Your implementation
  }
}
```

**Transport Router:**
```typescript
import { TransportRouter } from '@sylphx/lens-core';

const transport = new TransportRouter([
  {
    match: (req) => req.type === 'subscription',
    transport: new WebSocketTransport({ ... })
  },
  {
    match: () => true,
    transport: new HTTPTransport({ ... })
  }
]);
```

### Update Strategies

**Value Strategy** (default, safest):
```typescript
import { ValueStrategy } from '@sylphx/lens-core';

const strategy = new ValueStrategy();
const payload = strategy.encode(currentValue, nextValue);
// Sends full value every time
```

**Delta Strategy** (for LLM streaming):
```typescript
import { DeltaStrategy } from '@sylphx/lens-core';

const strategy = new DeltaStrategy();

// "" → "H" → "He" → "Hel" → "Hell" → "Hello"
// Value mode: 26 bytes total
// Delta mode: 11 bytes total (57% savings!)
```

**Patch Strategy** (for object updates):
```typescript
import { PatchStrategy } from '@sylphx/lens-core';

const strategy = new PatchStrategy();

// Update user.name from "John" to "Jane"
// Value mode: 50KB (entire object)
// Patch mode: 50 bytes (99.9% savings!)
```

**Auto Strategy** (intelligent selection):
```typescript
import { AutoStrategy } from '@sylphx/lens-core';

const strategy = new AutoStrategy();

// Automatically selects best strategy:
// - String growth → Delta
// - Object updates → Patch (if >50% savings)
// - Small payloads → Value
```

## API Reference

### `lens.query(config)`

Define a read operation.

```typescript
lens.query({
  input: z.ZodType<TInput>,
  output: z.ZodType<TOutput>,
  resolve: (input: TInput) => Promise<TOutput>,
  subscribe?: (input: TInput) => Observable<TOutput>, // Optional
});
```

### `lens.mutation(config)`

Define a write operation.

```typescript
lens.mutation({
  input: z.ZodType<TInput>,
  output: z.ZodType<TOutput>,
  resolve: (input: TInput) => Promise<TOutput>,
});
```

### `lens.object(obj)`

Group queries and mutations.

```typescript
lens.object({
  get: lens.query({ ... }),
  update: lens.mutation({ ... }),
  nested: lens.object({ ... }),
});
```

### Type Inference

```typescript
// Infer input type
type Input = InferInput<typeof myQuery>;

// Infer output type
type Output = InferOutput<typeof myQuery>;

// Type-safe field selection
type Selected = Selected<User, ['id', 'name']>;
// Result: { id: string; name: string }
```

## Examples

See [examples/basic](../../examples/basic) for a complete working example with:
- User and post management
- Field selection (array & object syntax)
- Nested queries
- Mutations
- Validation
- Error handling

## Architecture

```
@sylphx/lens-core
├── schema/          # Schema builder & types
│   ├── builder.ts   # lens.query(), lens.mutation(), lens.object()
│   └── types.ts     # Core type definitions
├── transport/       # Pluggable transport layer
│   ├── interface.ts # LensTransport interface
│   └── in-process.ts # InProcessTransport
└── update-strategy/ # Minimal transfer strategies
    ├── value.ts     # Full value (default)
    ├── delta.ts     # Text delta (LLM streaming)
    ├── patch.ts     # JSON Patch (object updates)
    └── auto.ts      # Intelligent selection
```

## Performance

**Field Selection:**
- Full user object: 370 bytes
- Selected fields ['id', 'name', 'email']: 80 bytes
- **Reduction: 78%**

**Delta Strategy (LLM streaming):**
- Response: "Hello World" (11 chars)
- Value mode: 26 bytes
- Delta mode: 11 bytes
- **Savings: 57%**

**Patch Strategy (object updates):**
- Update: user.name "John" → "Jane"
- Value mode: 50KB
- Patch mode: 50 bytes
- **Savings: 99.9%**

## Related Packages

- `@sylphx/lens-server` - Server runtime with auto-subscription
- `@sylphx/lens-transport-http` - HTTP transport
- `@sylphx/lens-transport-ws` - WebSocket transport
- `@sylphx/lens-react` - React hooks

## License

MIT
