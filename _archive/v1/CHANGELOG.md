# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of Lens
- `@sylphx/lens-core` - Core type system
- `@sylphx/lens-server` - Server runtime
- `@sylphx/lens-client` - Client SDK
- `@sylphx/lens-react` - React hooks
- `@sylphx/lens` - Main package
- In-memory transport for embedded scenarios
- HTTP transport for queries/mutations
- WebSocket transport for subscriptions
- Hybrid transport combining HTTP and WebSocket
- GraphQL-like field selection with full TypeScript inference
- Prisma-like where clauses (equals, in, contains, gt, gte, lt, lte, AND, OR, NOT)
- Aggregations (_count, _sum, _avg, _min, _max)
- Real-time subscriptions with delta/patch modes
- React hooks (useGet, useFindMany, useCreate, useUpdate, useDelete, useLive)
- Complete documentation and examples

## [0.1.0] - 2024-01-XX

### Added
- Initial development release
- Core functionality
- Documentation
- Examples

[Unreleased]: https://github.com/SylphxAI/code/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SylphxAI/code/releases/tag/v0.1.0
