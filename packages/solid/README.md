# @sylphx/lens-solid

SolidJS primitives for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-solid @sylphx/lens-client
```

## Usage

### Setup Client

```typescript
// lib/client.ts
import { createClient } from "@sylphx/lens-solid";
import { http } from "@sylphx/lens-client";
import type { AppRouter } from "@/server/router";

export const client = createClient<AppRouter>({
  transport: http({ url: "/api/lens" }),
});
```

### Query (in component)

```tsx
import { client } from "@/lib/client";
import { Show } from "solid-js";

function UserProfile(props: { id: string }) {
  const { data, loading, error, refetch } = client.user.get({
    input: { id: props.id },
    select: { name: true, email: true },
  });

  return (
    <Show when={!loading()} fallback={<div>Loading...</div>}>
      <Show when={!error()} fallback={<div>Error: {error()?.message}</div>}>
        <div>{data()?.name}</div>
      </Show>
    </Show>
  );
}
```

### Mutation (in component)

```tsx
import { client } from "@/lib/client";

function CreateUser() {
  const { mutate, loading, error, data, reset } = client.user.create({
    onSuccess: (data) => console.log("Created:", data),
    onError: (error) => console.error("Failed:", error),
  });

  const handleSubmit = async () => {
    await mutate({ input: { name: "New User" } });
  };

  return (
    <button onClick={handleSubmit} disabled={loading()}>
      {loading() ? "Creating..." : "Create User"}
    </button>
  );
}
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
