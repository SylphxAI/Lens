---
release: patch
packages:
  - "@sylphx/lens-react"
---

fix(react): use production JSX runtime in build output

Previously, the build output used jsxDEV from react/jsx-dev-runtime,
which only exists in development mode. Now uses NODE_ENV=production
to ensure the build uses jsx from react/jsx-runtime.
