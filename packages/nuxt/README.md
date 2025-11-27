# @sylphx/lens-nuxt

Nuxt integration for the Lens API framework with SSR support.

## Installation

```bash
bun add @sylphx/lens-nuxt
```

## Usage

```vue
<script setup>
import { useQuery, useMutation } from "@sylphx/lens-nuxt";
import { client } from "./client";

const { data, loading, error } = useQuery(() => client.user.get({ id: "1" }));
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>{{ data.name }}</div>
</template>
```

## License

MIT

---

Built with [@sylphx/lens-client](https://github.com/SylphxAI/Lens), [@sylphx/lens-vue](https://github.com/SylphxAI/Lens), and [@sylphx/lens-server](https://github.com/SylphxAI/Lens).

✨ Powered by Sylphx
