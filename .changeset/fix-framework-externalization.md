---
"@sylphx/lens-react": patch
"@sylphx/lens-vue": patch
"@sylphx/lens-svelte": patch
"@sylphx/lens-solid": patch
"@sylphx/lens-core": patch
"@sylphx/lens-client": patch
"@sylphx/lens-server": patch
"@sylphx/lens": patch
---

Fix framework bundling and build configuration

- Fix React bundling issue: properly externalize React instead of bundling (reduces size from 109KB to 4KB)
- Add workspace bunup configuration with explicit return types for isolated declarations
- Fix Solid package build: use tsc for type generation since bun build doesn't support --dts
- Add explicit return types to satisfy TypeScript isolated declarations requirement
- All packages now build without warnings
