# @sylphx/lens-svelte

Svelte stores for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-svelte
```

## Usage

```svelte
<script>
  import { query, mutation } from "@sylphx/lens-svelte";
  import { client } from "./client";

  const user = query(() => client.user.get({ id: "1" }));
  const createUser = mutation(client.user.create);
</script>

{#if $user.loading}
  <div>Loading...</div>
{:else if $user.error}
  <div>Error: {$user.error.message}</div>
{:else}
  <div>{$user.data.name}</div>
{/if}
```

## License

MIT

---

Built with [@sylphx/lens-client](https://github.com/SylphxAI/Lens).

✨ Powered by Sylphx
