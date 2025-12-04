---
release: minor
packages:
  - @sylphx/lens-react
  - @sylphx/lens-next
---

feat: selector-based hooks API - client auto-injected from context

BREAKING: Hooks now use selector callbacks to auto-inject client from LensProvider context.

Before:
```tsx
const client = useLensClient();
const { data } = useQuery(client.user.get, { id: userId });
```

After:
```tsx
const { data } = useQuery((client) => client.user.get, { id: userId });
```

- `useQuery`, `useMutation`, `useLazyQuery` now accept selector callbacks
- Client is automatically injected from `LensProvider` context
- No need to call `useLensClient()` separately
- Two patterns supported:
  - Route + Params: `useQuery((c) => c.user.get, { id })`
  - Accessor + Deps: `useQuery((c) => c.user.get({ id }), [id])`
