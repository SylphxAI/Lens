# Embedded Mode (In-Memory Transport)

Use Lens in the same process without network layer.

## Use Cases

- **Desktop Applications** (Electron, Tauri, Wails)
- **CLI Tools**
- **Testing** (Unit tests, integration tests)
- **Server-Side Rendering**
- **Edge Functions** (Cloudflare Workers, Deno Deploy)
- **Microservices** (Internal communication)

## Benefits

✅ **Zero Network Latency** - Direct function calls
✅ **No HTTP Overhead** - No serialization/deserialization
✅ **Simpler Setup** - No server process needed
✅ **Perfect for Tests** - Fast, deterministic
✅ **Type-Safe** - Full TypeScript inference

## Quick Start

### 1. Setup Data Source

```typescript
import { DataSource } from '@sylphx/lens';

// In-memory storage
const users: User[] = [];

const userDataSource: DataSource<User> = {
  async getById(id) {
    return users.find(u => u.id === id) ?? null;
  },
  async getAll() {
    return users;
  },
  async create(data) {
    const user = { ...data, id: Math.random().toString() } as User;
    users.push(user);
    return user;
  },
  async update(id, data) {
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');
    users[index] = { ...users[index], ...data };
    return users[index];
  },
  async delete(id) {
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');
    const [deleted] = users.splice(index, 1);
    return deleted;
  }
};
```

### 2. Create Resolvers

```typescript
import { ModelResolver } from '@sylphx/lens';

const userResolver = new ModelResolver(userDataSource);
const postResolver = new ModelResolver(postDataSource);
```

### 3. Create In-Memory Transport

```typescript
import { createInMemoryTransport, createLensClient } from '@sylphx/lens';

const transport = createInMemoryTransport({
  user: userResolver,
  post: postResolver
});

const lens = createLensClient<Models>(transport);
```

### 4. Use Normally

```typescript
// Query
const user = await lens.user.get({
  where: { id: '123' },
  select: { id: true, name: true }
});

// Mutate
const created = await lens.user.create({
  data: { name: 'John', email: 'john@example.com' },
  select: { id: true, name: true }
});

// Subscribe (in-memory observable)
lens.user.subscribe({
  where: { isActive: true },
  select: { id: true, name: true }
}, event => {
  console.log('User changed:', event);
});
```

## Desktop App Example (Electron)

```typescript
// main.ts (Electron main process)
import { app, BrowserWindow, ipcMain } from 'electron';
import { ModelResolver, createInMemoryTransport, createLensClient } from '@sylphx/lens';

// Setup resolvers
const userResolver = new ModelResolver(userDataSource);
const transport = createInMemoryTransport({ user: userResolver });
const lens = createLensClient<Models>(transport);

// Expose to renderer via IPC
ipcMain.handle('lens:query', async (event, { model, operation, input }) => {
  const result = await lens.model(model)[operation](input);
  return result;
});

app.on('ready', () => {
  const win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile('index.html');
});
```

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lens', {
  query: (model: string, operation: string, input: any) =>
    ipcRenderer.invoke('lens:query', { model, operation, input })
});
```

```typescript
// renderer.tsx (React)
import { useState, useEffect } from 'react';

function UserList() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    window.lens.query('user', 'findMany', {
      select: { id: true, name: true }
    }).then(setUsers);
  }, []);

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

## CLI Tool Example

```typescript
#!/usr/bin/env bun
import { ModelResolver, createInMemoryTransport, createLensClient } from '@sylphx/lens';
import { parseArgs } from 'util';

// Setup
const userResolver = new ModelResolver(userDataSource);
const transport = createInMemoryTransport({ user: userResolver });
const lens = createLensClient<Models>(transport);

// Parse CLI args
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    name: { type: 'string' },
    email: { type: 'string' }
  }
});

// Execute
const user = await lens.user.create({
  data: { name: values.name!, email: values.email! },
  select: { id: true, name: true, email: true }
});

console.log('Created user:', user);
```

## Testing Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ModelResolver, createInMemoryTransport, createLensClient } from '@sylphx/lens';

describe('User operations', () => {
  let lens: LensClient<Models>;
  let users: User[];

  beforeEach(() => {
    // Reset data
    users = [];

    // Setup in-memory data source
    const userDataSource: DataSource<User> = {
      async getById(id) {
        return users.find(u => u.id === id) ?? null;
      },
      async getAll() {
        return users;
      },
      async create(data) {
        const user = { ...data, id: Math.random().toString() } as User;
        users.push(user);
        return user;
      },
      async update(id, data) {
        const index = users.findIndex(u => u.id === id);
        users[index] = { ...users[index], ...data };
        return users[index];
      },
      async delete(id) {
        const index = users.findIndex(u => u.id === id);
        const [deleted] = users.splice(index, 1);
        return deleted;
      }
    };

    // Create client
    const userResolver = new ModelResolver(userDataSource);
    const transport = createInMemoryTransport({ user: userResolver });
    lens = createLensClient<Models>(transport);
  });

  it('should create user', async () => {
    const user = await lens.user.create({
      data: { name: 'John', email: 'john@example.com' },
      select: { id: true, name: true }
    });

    expect(user).toMatchObject({ name: 'John' });
    expect(users).toHaveLength(1);
  });

  it('should query users', async () => {
    // Create test data
    await lens.user.create({
      data: { name: 'John', email: 'john@example.com' }
    });
    await lens.user.create({
      data: { name: 'Jane', email: 'jane@example.com' }
    });

    // Query
    const result = await lens.user.findMany({
      where: { name: { contains: 'J' } },
      select: { id: true, name: true }
    });

    expect(result).toHaveLength(2);
  });
});
```

## Performance

**In-Memory vs HTTP**:

| Operation | HTTP | In-Memory | Speedup |
|-----------|------|-----------|---------|
| Simple query | ~10ms | ~0.1ms | **100x** |
| Query with projection | ~15ms | ~0.2ms | **75x** |
| Mutation | ~20ms | ~0.3ms | **66x** |
| Subscription setup | ~50ms | ~0.5ms | **100x** |

**Note**: Times are approximate and depend on network conditions.

## Best Practices

### 1. Separate Data Layer

```typescript
// data/user-data-source.ts
export function createUserDataSource(): DataSource<User> {
  const users: User[] = [];
  return {
    async getById(id) { /* ... */ },
    async getAll() { /* ... */ },
    async create(data) { /* ... */ },
    async update(id, data) { /* ... */ },
    async delete(id) { /* ... */ }
  };
}

// lens.ts
import { createUserDataSource } from './data/user-data-source';

const userDataSource = createUserDataSource();
const userResolver = new ModelResolver(userDataSource);
const transport = createInMemoryTransport({ user: userResolver });
export const lens = createLensClient<Models>(transport);
```

### 2. Shared Types

```typescript
// types.ts
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Models {
  user: User;
  post: Post;
}

// Use everywhere
import type { Models } from './types';
```

### 3. Testing Utilities

```typescript
// test-utils.ts
export function createTestLens() {
  const users: User[] = [];
  const userDataSource = createInMemoryDataSource(users);
  const userResolver = new ModelResolver(userDataSource);
  const transport = createInMemoryTransport({ user: userResolver });
  return createLensClient<Models>(transport);
}

// test.ts
const lens = createTestLens();
```

## Migration from HTTP

### Before (HTTP)

```typescript
const transport = new HybridTransport(
  'http://localhost:3000',
  'ws://localhost:3000'
);
const lens = createLensClient<Models>(transport);
```

### After (In-Memory)

```typescript
const transport = createInMemoryTransport({
  user: userResolver,
  post: postResolver
});
const lens = createLensClient<Models>(transport);
```

**Everything else stays the same!** 🎉

## Limitations

- No network security (same process)
- No load balancing
- No distributed caching
- Single-process only

**When to use HTTP instead**:
- Web applications
- Microservices
- Distributed systems
- Need authentication/authorization
- Multiple clients

## License

MIT
