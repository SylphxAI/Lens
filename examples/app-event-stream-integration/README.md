# Lens + AppEventStream Integration Example

This example demonstrates how Lens integrates with the existing AppEventStream architecture from @sylphx/code-server.

## Architecture

```
┌─────────────────┐
│  Lens Server    │
│  (Auto-Publish) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AppEventStream  │
│  (Pub/Sub)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Lens Client    │
│ (Auto-Subscribe)│
└─────────────────┘
```

## Features

- **Auto-Subscription**: Queries automatically subscribe to AppEventStream channels
- **Auto-Publish**: Mutations automatically publish to AppEventStream
- **Channel Naming**: Convention-based channel naming from query paths
- **Real-Time Updates**: Live updates via RxJS Observables
- **Type Safety**: End-to-end type inference from Zod schemas

## Usage

### 1. Create AppEventStream Adapter

```typescript
import { AppEventStream } from '@sylphx/code-server';
import type { PubSubAdapter, PubSubEvent } from '@sylphx/lens-server';

const eventStream = new AppEventStream();

const appEventStreamAdapter: PubSubAdapter = {
  async publish(channel: string, event: PubSubEvent) {
    await eventStream.publish(channel, {
      type: event.type,
      ...event.payload,
      timestamp: event.timestamp || Date.now(),
    });
  },

  subscribe(channel: string) {
    return eventStream.subscribe(channel);
  },

  async close() {
    // AppEventStream doesn't need explicit cleanup
  }
};
```

### 2. Configure Lens Server

```typescript
import { createLensServer } from '@sylphx/lens-server';
import { api } from './api';

const server = createLensServer(api, {
  autoSubscribe: {
    // Channel naming: query:user:get:id:123
    channelFor: (path, input) => {
      const pathStr = `query:${path.join(':')}`;
      if (input && typeof input === 'object' && 'id' in input) {
        return `${pathStr}:id:${input.id}`;
      }
      return pathStr;
    },
    pubsub: appEventStreamAdapter
  },
  updateMode: 'auto',
  compression: {
    enabled: true,
    algorithm: 'brotli',
    threshold: 1024
  }
});
```

### 3. Use in Frontend

```typescript
import { useLens, useLensMutation } from '@sylphx/lens-react';

function UserProfile({ userId }: { userId: string }) {
  // Auto-subscribes to channel: query:user:get:id:123
  const user = useLens(
    api.user.get,
    { id: userId },
    {
      select: ['id', 'name', 'email', 'bio'],
      live: true // Enable real-time updates
    }
  );

  // Auto-publishes to channel after mutation
  const updateUser = useLensMutation(api.user.update);

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.bio}</p>
      <button onClick={() => updateUser({
        id: userId,
        data: { bio: 'Updated bio!' }
      })}>
        Update Bio
      </button>
    </div>
  );
}
```

## How It Works

### Query Flow (Auto-Subscribe)

1. Frontend calls `useLens(api.user.get, { id: '123' })`
2. Lens creates subscription to channel: `query:user:get:id:123`
3. AppEventStream delivers events on that channel
4. Frontend receives real-time updates

### Mutation Flow (Auto-Publish)

1. Frontend calls `updateUser({ id: '123', data: { bio: '...' } })`
2. Lens executes mutation
3. Lens auto-publishes result to channel: `query:user:get:id:123`
4. All subscribed clients receive update in real-time

## Channel Naming Examples

```typescript
// Default naming strategy
api.user.get({ id: '123' })
// → Channel: "query:user:get:id:123"

api.post.list({ authorId: '456', published: true })
// → Channel: "query:post:list:authorId:456:published:true"

api.comment.get({ id: '789' })
// → Channel: "query:comment:get:id:789"
```

## Benefits

1. **Zero Configuration**: Works out of the box with existing AppEventStream
2. **Type Safety**: Full TypeScript inference
3. **Real-Time**: Automatic live updates
4. **Efficient**: Delta/Patch strategies reduce bandwidth
5. **Compatible**: Integrates seamlessly with existing architecture
