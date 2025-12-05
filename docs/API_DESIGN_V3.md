# Lens API v3 Design

## Overview

This document outlines the unified `{ input, select }` API pattern for Lens client.

## Core Principles

1. **Consistency**: Same pattern at all levels (top-level, nested, deeply nested)
2. **Type Safety**: Full TypeScript inference for inputs and selections
3. **No Collisions**: Reserved keys (`input`, `select`) prevent field name collisions
4. **Framework Agnostic**: Core client API works the same across all frameworks

---

## Client API

### Basic Query

```typescript
// Query with input only (return all fields)
const user = await client.user.get({
  input: { id: "user-123" },
});

// Query with select only (no input needed)
const users = await client.users.list({
  select: { name: true, email: true },
});

// Query with both input and select
const user = await client.user.get({
  input: { id: "user-123" },
  select: { name: true, email: true },
});

// Query with no input and no select
const health = await client.health.ping();
```

### Nested Selection with Input

```typescript
const user = await client.user.get({
  input: { id: "user-123" },
  select: {
    name: true,
    email: true,
    posts: {
      input: { limit: 10, published: true },  // Nested input
      select: {
        title: true,
        content: true,
        comments: {
          input: { limit: 5 },  // Deeply nested input
          select: {
            body: true,
            author: {
              select: { name: true },  // No input needed
            },
          },
        },
      },
    },
  },
});
```

### Mutations

```typescript
// Mutation with input
const result = await client.user.create({
  input: { name: "Alice", email: "alice@example.com" },
});

// Mutation with input and select (return specific fields)
const result = await client.user.create({
  input: { name: "Alice", email: "alice@example.com" },
  select: { id: true, createdAt: true },
});
```

---

## React API

### Setup (one-time)

```typescript
// lib/lens.ts
import { createClient } from "@sylphx/lens-client";
import { createLensReact } from "@sylphx/lens-react";
import type { AppRouter } from "./server";

export const client = createClient<AppRouter>({ ... });
export const { LensProvider, useQuery, useMutation, useLazyQuery } = createLensReact(client);
```

### useQuery

```tsx
import { useQuery } from "@/lib/lens";

function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error } = useQuery(
    client.user.get,
    {
      input: { id: userId },
      select: {
        name: true,
        posts: {
          input: { limit: 5 },
          select: { title: true },
        },
      },
    },
    { skip: !userId }  // Hook options
  );

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  return <h1>{data?.name}</h1>;
}
```

### useMutation

```tsx
function CreateUserForm() {
  const { mutate, loading, error } = useMutation(client.user.create);

  const handleSubmit = async (data: FormData) => {
    const result = await mutate({
      input: { name: data.name, email: data.email },
      select: { id: true },
    });
    console.log("Created user:", result.id);
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### useLazyQuery

```tsx
function SearchUsers() {
  const { execute, data, loading } = useLazyQuery(client.users.search);

  const handleSearch = async (query: string) => {
    await execute({
      input: { query },
      select: { id: true, name: true },
    });
  };

  return (
    <div>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {data?.map((user) => <div key={user.id}>{user.name}</div>)}
    </div>
  );
}
```

---

## Vue API

```vue
<script setup lang="ts">
import { useQuery, useMutation } from "@/lib/lens";

const props = defineProps<{ userId: string }>();

const { data, loading, error } = useQuery(
  () => client.user.get,
  () => ({
    input: { id: props.userId },
    select: { name: true },
  })
);

const { mutate, loading: creating } = useMutation(client.user.create);
</script>
```

---

## Solid API

```tsx
import { createQuery, createMutation } from "@/lib/lens";

function UserProfile(props: { userId: string }) {
  const user = createQuery(
    () => client.user.get,
    () => ({
      input: { id: props.userId },
      select: { name: true },
    })
  );

  return (
    <Show when={!user.loading()} fallback={<Spinner />}>
      <h1>{user.data()?.name}</h1>
    </Show>
  );
}
```

---

## Svelte API

```svelte
<script lang="ts">
  import { query, mutation } from "@/lib/lens";

  export let userId: string;

  $: userQuery = query(
    client.user.get,
    { input: { id: userId }, select: { name: true } }
  );
</script>

{#if $userQuery.loading}
  <p>Loading...</p>
{:else if $userQuery.data}
  <h1>{$userQuery.data.name}</h1>
{/if}
```

---

## Type Definitions

### SelectionObject (Updated)

```typescript
export interface SelectionObject {
  [key: string]:
    | boolean                           // Select field
    | { select: SelectionObject }       // Nested selection only
    | {                                 // Nested with input
        input?: Record<string, unknown>;
        select?: SelectionObject;
      };
}
```

### QueryDescriptor

```typescript
export interface QueryDescriptor<TInput, TSelect> {
  input?: TInput;
  select?: TSelect;
}
```

### Hook Options

```typescript
export interface UseQueryOptions {
  skip?: boolean;
  refetchInterval?: number;
  enabled?: boolean;
}
```

---

## Migration Guide

### Before (v2)

```typescript
// Old: Positional args, selector function
const { data } = useQuery(
  (client) => client.user.get,
  { id: userId },
  { select: (user) => user.name }
);

// Old: Chained .select()
const user = await client.user.get({ id: userId }).select({
  name: true,
  posts: { select: { title: true } },
});
```

### After (v3)

```typescript
// New: Unified { input, select } pattern
const { data } = useQuery(
  client.user.get,
  {
    input: { id: userId },
    select: { name: true },
  }
);

// New: Consistent at all levels
const user = await client.user.get({
  input: { id: userId },
  select: {
    name: true,
    posts: {
      input: { limit: 10 },  // Nested input supported!
      select: { title: true },
    },
  },
});
```

---

## Breaking Changes

1. `useQuery` signature changed from `(selector, params, options)` to `(query, descriptor, options)`
2. `.select()` method removed from QueryResult
3. Nested selection now uses `{ input?, select? }` instead of `{ select: ... }`
4. Framework hooks now properly track reactive dependencies

---

## Implementation Checklist

- [ ] Update `SelectionObject` type in lens-client
- [ ] Update `SelectionObject` type in lens-server
- [ ] Implement nested input handling in lens-client
- [ ] Implement nested input handling in lens-server
- [ ] Refactor lens-react with new API
- [ ] Refactor lens-vue with watchEffect
- [ ] Refactor lens-solid with createEffect
- [ ] Refactor lens-svelte with reactive statements
- [ ] Update all tests
- [ ] Update all README files
