# @sylphx/lens-vue

Vue composables for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-vue @sylphx/lens-client
```

## Usage

### Setup Client

```typescript
// lib/client.ts
import { createClient } from "@sylphx/lens-vue";
import { http } from "@sylphx/lens-client";
import type { AppRouter } from "@/server/router";

export const client = createClient<AppRouter>({
  transport: http({ url: "/api/lens" }),
});
```

### Query (in component)

```vue
<script setup lang="ts">
import { client } from "@/lib/client";

const props = defineProps<{ id: string }>();

const { data, loading, error, refetch } = client.user.get({
  input: { id: props.id },
  select: { name: true, email: true },
});
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>{{ data?.name }}</div>
</template>
```

### Mutation (in component)

```vue
<script setup lang="ts">
import { client } from "@/lib/client";

const { mutate, loading, error, data, reset } = client.user.create({
  onSuccess: (data) => console.log("Created:", data),
  onError: (error) => console.error("Failed:", error),
});

const handleSubmit = async () => {
  await mutate({ input: { name: "New User" } });
};
</script>

<template>
  <button @click="handleSubmit" :disabled="loading">
    {{ loading ? "Creating..." : "Create User" }}
  </button>
</template>
```

### SSR / Server-side

```typescript
// Use .fetch() for promise-based calls
const user = await client.user.get.fetch({ input: { id } });
```

## License

MIT

---

Built with [@sylphx/lens-client](https://github.com/SylphxAI/Lens).

Powered by Sylphx
