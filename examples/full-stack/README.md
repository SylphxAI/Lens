# Full Stack Lens Example

Complete end-to-end example demonstrating:
- Type-safe API definition
- HTTP server with Express
- WebSocket server for real-time
- HTTP client transport
- WebSocket client transport
- Real-time subscriptions

## Structure

```
examples/full-stack/
├── server.ts       # Express + WebSocket server
├── client.ts       # HTTP + WebSocket client
└── api.ts          # Shared API definition
```

## Usage

```bash
# Terminal 1: Start server
bun run server.ts

# Terminal 2: Run client
bun run client.ts
```

## Features Demonstrated

- ✅ Type-safe queries
- ✅ Type-safe mutations
- ✅ Real-time subscriptions
- ✅ Auto-publish after mutations
- ✅ Field selection
- ✅ Update strategies (Delta/Patch)
- ✅ Compression
