# @sylphx/lens-svelte

Svelte stores for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-svelte @sylphx/lens-client
```

## Usage

### Setup Client

```typescript
// lib/client.ts
import { createClient } from "@sylphx/lens-svelte";
import { http } from "@sylphx/lens-client";
import type { AppRouter } from "@/server/router";

export const client = createClient<AppRouter>({
  transport: http({ url: "/api/lens" }),
});
```

### Query (in component)

```svelte
<script lang="ts">
  import { client } from "$lib/client";

  export let id: string;

  $: userStore = client.user.get({
    input: { id },
    select: { name: true, email: true },
  });
</script>

{#if $userStore.loading}
  <div>Loading...</div>
{:else if $userStore.error}
  <div>Error: {$userStore.error.message}</div>
{:else}
  <div>{$userStore.data?.name}</div>
{/if}
```

### Mutation (in component)

```svelte
<script lang="ts">
  import { client } from "$lib/client";

  const createUser = client.user.create({
    onSuccess: (data) => console.log("Created:", data),
    onError: (error) => console.error("Failed:", error),
  });

  async function handleSubmit() {
    await createUser.mutate({ input: { name: "New User" } });
  }
</script>

<button on:click={handleSubmit} disabled={$createUser.loading}>
  {$createUser.loading ? "Creating..." : "Create User"}
</button>
```

### SSR / Server-side

```typescript
// Use .fetch() for promise-based calls (e.g., in +page.server.ts)
const user = await client.user.get.fetch({ input: { id } });
```

## License

MIT

---

Built with [@sylphx/lens-client](https://github.com/SylphxAI/Lens).

Powered by Sylphx
