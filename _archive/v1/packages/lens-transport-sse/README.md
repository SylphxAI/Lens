# @sylphx/lens-transport-sse

SSE (Server-Sent Events) transport for Lens framework.

## Features

- **Queries/Mutations**: HTTP POST (same as HTTP transport)
- **Subscriptions**: Server-Sent Events for real-time streaming
- **Auto-reconnection**: Browser handles SSE reconnection automatically
- **Simple Protocol**: Server sends JSON messages via SSE

## Installation

```bash
bun add @sylphx/lens-transport-sse
```

## Usage

### Client

```typescript
import { SSETransport } from '@sylphx/lens-transport-sse';

const transport = new SSETransport({
  url: 'http://localhost:3000/lens',
  sseUrl: 'http://localhost:3000/lens/subscribe'
});

// Queries and mutations use HTTP
const user = await transport.query({
  type: 'query',
  path: ['user', 'get'],
  input: { id: '1' }
});

// Subscriptions use SSE
const subscription = transport.subscribe({
  type: 'subscription',
  path: ['user', 'get'],
  input: { id: '1' }
});

subscription.subscribe({
  next: (user) => console.log('Updated:', user),
  error: (err) => console.error('Error:', err),
  complete: () => console.log('Done')
});
```

### Server (Node.js with Express)

```typescript
import express from 'express';
import { createLensHandler } from '@sylphx/lens-server';

const app = express();

// HTTP endpoint for queries/mutations
app.post('/lens', express.json(), async (req, res) => {
  const handler = createLensHandler({ api });
  const result = await handler.handle(req.body);
  res.json(result);
});

// SSE endpoint for subscriptions
app.get('/lens/subscribe', (req, res) => {
  const { data, id } = req.query;
  const request = JSON.parse(data as string);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Handle subscription
  const handler = createLensHandler({ api });
  const observable = handler.handleSubscription(request);

  const subscription = observable.subscribe({
    next: (value) => {
      res.write(`data: ${JSON.stringify({ type: 'update', payload: value })}\n\n`);
    },
    error: (error) => {
      res.write(`data: ${JSON.stringify({ type: 'error', payload: { message: error.message } })}\n\n`);
      res.end();
    },
    complete: () => {
      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      res.end();
    }
  });

  req.on('close', () => {
    subscription.unsubscribe();
  });
});
```

## SSE Protocol

Server sends JSON-encoded messages:

```typescript
// Update
{ "type": "update", "payload": { ...data } }

// Error
{ "type": "error", "payload": { "message": "Error message" } }

// Complete
{ "type": "complete" }
```

## Configuration

```typescript
new SSETransport({
  // Required: HTTP endpoint for queries/mutations
  url: 'http://localhost:3000/lens',

  // Optional: SSE endpoint (defaults to ${url}/subscribe)
  sseUrl: 'http://localhost:3000/lens/subscribe',

  // Optional: Custom headers
  headers: {
    'Authorization': 'Bearer token'
  },

  // Optional: Request timeout (default: 30000ms)
  timeout: 30000,

  // Optional: Custom fetch/EventSource (for testing)
  fetch: customFetch,
  EventSource: CustomEventSource
});
```

## Benefits vs WebSocket

- **Simpler**: One-way streaming, no handshake
- **HTTP/2**: Multiplexing over single connection
- **Auto-reconnect**: Built into browser EventSource API
- **Firewall-friendly**: Uses standard HTTP
- **Easier to debug**: Plain text protocol

## Limitations

- **One-way only**: Server → Client (fine for subscriptions)
- **Text only**: JSON encoding required
- **Browser support**: IE11 requires polyfill
