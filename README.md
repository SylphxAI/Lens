# Lens

> **Type-Safe Reactive API Framework for TypeScript**

End-to-end type safety from server to client. Like tRPC, but with **live queries**, **real-time subscriptions**, **optimistic updates**, and **multi-server support** built-in.

## What Lens Does

Lens lets you define type-safe API operations on the server that clients can call with full TypeScript inference. But unlike traditional request/response APIs, Lens operations can **stream data** and **push updates** to connected clients.

```typescript
// Server: Define your API
const appRouter = router({
  user: {
    // Standard query - returns once
    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input }) => db.user.find(input.id)),

    // Live query - returns initial data, then pushes updates via ctx.emit
    watch: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input, ctx }) => {
        // Subscribe to database changes
        const unsubscribe = db.user.onChange(input.id, (user) => {
          ctx.emit(user)  // Push update to client
        })
        ctx.onCleanup(unsubscribe)
        return db.user.find(input.id)  // Return initial data
      }),

    // Streaming query - yields multiple values over time
    stream: query()
      .resolve(async function* ({ ctx }) {
        for await (const user of db.user.cursor()) {
          yield user  // Stream each user to client
        }
      }),
  },
})

// Client: Full type inference, reactive updates
const user = await client.user.get({ id: '123' })
//    ^? { id: string, name: string, email: string }

// Subscribe to live updates
client.user.watch({ id: '123' }).subscribe((user) => {
  console.log('User updated:', user)
})
```

---

## Resolver Patterns

Lens supports three resolver patterns for different use cases:

### 1. Single Return (Standard)

Returns a single value, like traditional APIs:

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input }) => db.user.find(input.id))

// Client
const user = await client.user.get({ id: '123' })
```

### 2. Live Query with `ctx.emit`

Returns initial data, then pushes updates when data changes:

```typescript
const watchUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    // Set up subscription to push updates
    const unsubscribe = db.user.onChange(input.id, (updated) => {
      ctx.emit(updated)  // Push to client
    })

    // Cleanup when client disconnects
    ctx.onCleanup(unsubscribe)

    // Return initial data
    return db.user.find(input.id)
  })

// Client - receives initial data + all updates
client.user.watch({ id: '123' }).subscribe((user) => {
  console.log('Current user:', user)
})
```

### 3. Streaming with `yield` (AsyncGenerator)

Yields multiple values over time (e.g., pagination, real-time feeds):

```typescript
const streamUsers = query()
  .resolve(async function* () {
    // Stream users in batches
    for await (const batch of db.user.cursor({ batchSize: 100 })) {
      for (const user of batch) {
        yield user
      }
    }
  })

// Client - receives each yielded value
client.user.stream().subscribe((user) => {
  console.log('Received user:', user)
})
```

---

## How Live Queries Work

Live queries combine the simplicity of REST with the real-time capabilities of WebSocket subscriptions:

```
┌─────────┐                      ┌─────────┐
│ Client  │                      │ Server  │
└────┬────┘                      └────┬────┘
     │                                │
     │  1. Subscribe to user.watch    │
     │ ─────────────────────────────> │
     │                                │
     │  2. Initial data               │
     │ <───────────────────────────── │  ← resolve() returns
     │                                │
     │  3. Update (user changed)      │
     │ <───────────────────────────── │  ← ctx.emit() called
     │                                │
     │  4. Update (user changed)      │
     │ <───────────────────────────── │  ← ctx.emit() called
     │                                │
     │  5. Unsubscribe                │
     │ ─────────────────────────────> │
     │                                │  ← ctx.onCleanup() called
```

**Key concepts:**

- `ctx.emit(data)` - Push new data to the subscribed client
- `ctx.onCleanup(fn)` - Register cleanup function when client disconnects
- Client receives both initial return value AND all emitted updates
- Works over WebSocket or SSE transports

---

## Installation

```bash
# Core packages
npm install @sylphx/lens-server @sylphx/lens-client

# Framework adapters (pick one)
npm install @sylphx/lens-react    # React
npm install @sylphx/lens-vue      # Vue
npm install @sylphx/lens-solid    # SolidJS
npm install @sylphx/lens-svelte   # Svelte

# Meta-framework integrations (optional)
npm install @sylphx/lens-next       # Next.js
npm install @sylphx/lens-nuxt       # Nuxt 3
npm install @sylphx/lens-solidstart # SolidStart
npm install @sylphx/lens-fresh      # Fresh (Deno)
```

---

## Quick Start

### 1. Define Your Server

```typescript
// server/api.ts
import { createServer, router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'

export const appRouter = router({
  greeting: query()
    .input(z.object({ name: z.string() }))
    .resolve(({ input }) => `Hello, ${input.name}!`),

  user: {
    list: query()
      .resolve(() => db.user.findMany()),

    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input }) => db.user.findUnique({ where: { id: input.id } })),

    // Live query example
    watch: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input, ctx }) => {
        const unsub = db.user.subscribe(input.id, (user) => ctx.emit(user))
        ctx.onCleanup(unsub)
        return db.user.findUnique({ where: { id: input.id } })
      }),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ input }) => db.user.create({ data: input })),
  },
})

export type AppRouter = typeof appRouter
export const server = createServer({ router: appRouter })
```

### 2. Create Your Client

```typescript
// client/api.ts
import { createClient, http } from '@sylphx/lens-client'
import type { AppRouter } from '../server/api'

export const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})

// One-time query
const user = await client.user.get({ id: '123' })

// Live query subscription
const subscription = client.user.watch({ id: '123' }).subscribe((user) => {
  console.log('User updated:', user)
})

// Later: unsubscribe
subscription.unsubscribe()
```

### 3. Use with React

```tsx
import { useQuery, useMutation } from '@sylphx/lens-react'
import { client } from '../client/api'

function UserProfile({ userId }) {
  // Automatically subscribes and receives live updates
  const { data, loading, error } = useQuery(client.user.watch({ id: userId }))

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <h1>{data?.name}</h1>
}

function CreateUser() {
  const { mutate, loading } = useMutation(client.user.create)

  return (
    <button
      disabled={loading}
      onClick={() => mutate({ name: 'John', email: 'john@example.com' })}
    >
      Create User
    </button>
  )
}
```

---

## Meta-Framework Integrations

For full-stack frameworks, Lens provides unified setup that handles both server and client:

### Next.js

```typescript
// lib/lens.ts
import { createLensNext } from '@sylphx/lens-next'
import { createServer } from '@sylphx/lens-server'
import { appRouter } from './router'

const server = createServer({ router: appRouter })
export const lens = createLensNext({ server })
```

```typescript
// app/api/lens/[...path]/route.ts
import { lens } from '@/lib/lens'
export const GET = lens.handler
export const POST = lens.handler
```

```tsx
// app/users/page.tsx (Server Component)
import { lens } from '@/lib/lens'

export default async function UsersPage() {
  const users = await lens.serverClient.user.list()  // Direct execution, no HTTP
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}
```

```tsx
// components/UserProfile.tsx (Client Component)
'use client'
import { lens } from '@/lib/lens'

export function UserProfile({ userId }) {
  const { data, loading } = lens.useQuery(c => c.user.watch({ id: userId }))
  if (loading) return <div>Loading...</div>
  return <h1>{data?.name}</h1>
}
```

### Nuxt 3

```typescript
// server/lens.ts
import { createLensNuxt } from '@sylphx/lens-nuxt'
import { createServer } from '@sylphx/lens-server'
import { appRouter } from './router'

const server = createServer({ router: appRouter })
export const lens = createLensNuxt({ server })
```

```vue
<!-- pages/users.vue -->
<script setup>
import { lens } from '~/server/lens'
const { data, pending } = await lens.useQuery('users', c => c.user.list())
</script>

<template>
  <div v-if="pending">Loading...</div>
  <ul v-else>
    <li v-for="user in data" :key="user.id">{{ user.name }}</li>
  </ul>
</template>
```

### SolidStart

```typescript
// lib/lens.ts
import { createLensSolidStart } from '@sylphx/lens-solidstart'
import { createServer } from '@sylphx/lens-server'
import { appRouter } from './router'

const server = createServer({ router: appRouter })
export const lens = createLensSolidStart({ server })
```

```tsx
// routes/users.tsx
import { lens } from '~/lib/lens'
import { Suspense, For } from 'solid-js'

export default function UsersPage() {
  const users = lens.createQuery(c => c.user.list())
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <For each={users()}>{user => <div>{user.name}</div>}</For>
    </Suspense>
  )
}
```

---

## Core Concepts

### Router & Operations

```typescript
import { router, query, mutation } from '@sylphx/lens-server'
import { z } from 'zod'

const appRouter = router({
  // Simple query
  health: query().resolve(() => ({ status: 'ok' })),

  // Query with input validation
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .resolve(({ input }) => db.user.find(input.id)),

    create: mutation()
      .input(z.object({ name: z.string(), email: z.string() }))
      .resolve(({ input }) => db.user.create(input)),
  },

  // Nested namespaces
  admin: {
    settings: {
      get: query().resolve(() => getSettings()),
    },
  },
})
```

### Context

```typescript
const server = createServer({
  router: appRouter,
  context: async (req) => ({
    db: prisma,
    user: await getUserFromToken(req.headers.authorization),
  }),
})

// Access in resolver
const getMe = query().resolve(({ ctx }) => ctx.user)
```

### Transport System

```typescript
import { createClient, http, ws, route } from '@sylphx/lens-client'

// HTTP transport
const client = createClient<AppRouter>({
  transport: http({ url: '/api' }),
})

// WebSocket for real-time
const client = createClient<AppRouter>({
  transport: ws({ url: 'ws://localhost:3000/ws' }),
})

// Route to multiple servers
const client = createClient<AppRouter>({
  transport: route({
    'auth.*': http({ url: '/auth-api' }),
    'analytics.*': http({ url: '/analytics-api' }),
    '*': http({ url: '/api' }),
  }),
})
```

### Optimistic Updates

```typescript
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .optimistic('merge')  // Immediately merge input into cache
  .resolve(({ input }) => db.user.update({ where: { id: input.id }, data: input }))

// Client automatically applies optimistic update, rollback on error
await client.user.update({ id: '123', name: 'New Name' })
```

---

## Comparison

| Feature | tRPC | GraphQL | REST | **Lens** |
|---------|------|---------|------|----------|
| Type Safety | ✅ | Codegen | ❌ | ✅ |
| Code-first | ✅ | SDL | ✅ | ✅ |
| Live Queries | ❌ | Subscriptions | ❌ | ✅ |
| Streaming | ❌ | ❌ | ❌ | ✅ |
| Optimistic Updates | Manual | Manual | Manual | **Auto** |
| Multi-Server | Manual | Federation | Manual | **Native** |
| Codegen Required | No | Yes | No | **No** |

---

## Packages

| Package | Description |
|---------|-------------|
| `@sylphx/lens-server` | Server, router, operations |
| `@sylphx/lens-client` | Client, transports |
| `@sylphx/lens-react` | React hooks |
| `@sylphx/lens-vue` | Vue composables |
| `@sylphx/lens-solid` | SolidJS primitives |
| `@sylphx/lens-svelte` | Svelte stores |
| `@sylphx/lens-next` | Next.js integration |
| `@sylphx/lens-nuxt` | Nuxt 3 integration |
| `@sylphx/lens-solidstart` | SolidStart integration |
| `@sylphx/lens-fresh` | Fresh (Deno) integration |

---

## License

MIT © Sylphx AI
