# Getting Started with Lens

Complete guide to building your first Lens application.

## What is Lens?

Lens is **the simplest way to build type-safe, real-time APIs**. It combines:
- tRPC's simplicity and type safety
- GraphQL's field selection
- Built-in real-time updates

**Zero config. Zero codegen. Pure TypeScript.**

## Installation

```bash
bun add @sylphx/lens
```

## 5-Minute Tutorial

### Step 1: Backend - Just Write Functions

```typescript
// api/index.ts
export const api = {
  user: {
    async get(id: string) {
      return await db.users.findOne({ id });
    },

    async list() {
      return await db.users.find();
    },

    async update(id: string, data: Partial<User>) {
      return await db.users.update({ id }, data);
    },

    async create(data: Omit<User, 'id'>) {
      return await db.users.create(data);
    }
  },

  post: {
    async get(id: string) {
      return await db.posts.findOne({ id });
    },

    async create(data: Omit<Post, 'id'>) {
      return await db.posts.create(data);
    }
  }
};

// That's it! No schema, no resolvers, no config.
```

### Step 2: Frontend - Use It!

```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';

function UserProfile({ userId }) {
  // Simple mode - get all fields
  const user = useLens(api.user.get, userId);

  // Frontend-driven - choose exact fields
  const user = useLens(api.user.get, userId, ['id', 'name', 'balance']);

  // Mutation
  const updateUser = useLensMutation(api.user.update);

  return (
    <div>
      <h1>{user.name}</h1>
      <p>Balance: ${user.balance}</p>

      <button onClick={() => updateUser(userId, { balance: user.balance + 10 })}>
        Add $10
      </button>
    </div>
  );
}
```

## Field Selection (Frontend-Driven)

### Array Syntax (Simplest!)

```typescript
const user = useLens(api.user.get, userId, ['id', 'name', 'email']);
// Type: { id: string; name: string; email: string }
```

### Object Syntax (Clear!)

```typescript
const user = useLens(api.user.get, userId, {
  id: true,
  name: true,
  email: true
});
// Type: { id: string; name: string; email: string }
```

### Nested Selection

```typescript
const user = useLens(api.user.get, userId, {
  id: true,
  name: true,
  posts: {
    id: true,
    title: true,
    comments: {
      text: true
    }
  }
});
// Type: { id: string; name: string; posts: { id: string; title: string; comments: { text: string }[] }[] }
```

### Template Syntax (GraphQL-like!)

```typescript
const user = useLens(api.user.get, userId, `
  id
  name
  posts {
    id
    title
  }
`);
```

## Real-time Updates

```typescript
// Just use useLens() - it's live by default!
const user = useLens(api.user.get, userId, ['id', 'name', 'balance']);

// When anyone updates the user, your UI auto-updates!
// No manual subscriptions, no polling, just works.

// Want to disable live updates?
const user = useLens(api.user.get, userId, {
  select: ['id', 'name'],
  live: false  // One-time fetch
});
```

## Optimistic Updates

```typescript
// Mutations are optimistic by default
const updateUser = useLensMutation(api.user.update);

// UI updates instantly, syncs with server in background
await updateUser(userId, { balance: 100 });

// Auto-rollback on error
// Auto-retry on network issues
// Just works!
```

## Advanced Features

### Custom Methods (Non-CRUD)

```typescript
// Backend
export const api = {
  auth: {
    async whoami() {
      return await getCurrentUser();
    },

    async login(email: string, password: string) {
      return await authenticate(email, password);
    }
  },

  weather: {
    async getToday(city: string) {
      return await fetchWeather(city);
    }
  }
};

// Frontend
const currentUser = useLens(api.auth.whoami);
const weather = useLens(api.weather.getToday, 'San Francisco');
```

### Nested Queries

```typescript
// Backend
export const api = {
  user: {
    async get(id: string) {
      const user = await db.users.findOne({ id });
      const posts = await db.posts.find({ authorId: id });
      return { ...user, posts };
    }
  }
};

// Frontend - select nested fields
const user = useLens(api.user.get, userId, {
  id: true,
  name: true,
  posts: {
    id: true,
    title: true
  }
});
```

## Database Integration

### With Prisma

```typescript
// api/user.ts
import { prisma } from './db';

export const user = {
  async get(id: string) {
    return await prisma.user.findUnique({ where: { id } });
  },

  async list() {
    return await prisma.user.findMany();
  },

  async create(data: Omit<User, 'id'>) {
    return await prisma.user.create({ data });
  },

  async update(id: string, data: Partial<User>) {
    return await prisma.user.update({ where: { id }, data });
  }
};
```

### With Drizzle ORM

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { users } from './schema';
import { eq } from 'drizzle-orm';

const db = drizzle(sqlite);

export const user = {
  async get(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async list() {
    return await db.select().from(users);
  },

  async create(data: typeof users.$inferInsert) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  },

  async update(id: string, data: Partial<typeof users.$inferInsert>) {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }
};
```

### With Raw SQL

```typescript
import { db } from './db';

export const user = {
  async get(id: string) {
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return user;
  },

  async list() {
    return await db.query('SELECT * FROM users');
  },

  async create(data: Omit<User, 'id'>) {
    const result = await db.query(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [data.name, data.email]
    );
    return { id: result.insertId, ...data };
  }
};
```

## Common Patterns

### Pagination

```typescript
// Backend
export const api = {
  user: {
    async list(page: number = 0, limit: number = 10) {
      return await db.users.find()
        .skip(page * limit)
        .limit(limit);
    }
  }
};

// Frontend
const users = useLens(api.user.list, page, limit, ['id', 'name']);
```

### Search

```typescript
// Backend
export const api = {
  user: {
    async search(query: string) {
      return await db.users.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } }
        ]
      });
    }
  }
};

// Frontend
const results = useLens(api.user.search, searchTerm, ['id', 'name', 'email']);
```

### Authentication

```typescript
// Backend
export const api = {
  auth: {
    async login(email: string, password: string) {
      const user = await db.users.findOne({ email });
      if (!user || !await bcrypt.compare(password, user.passwordHash)) {
        throw new Error('Invalid credentials');
      }
      const token = jwt.sign({ userId: user.id }, SECRET);
      return { token, user };
    },

    async whoami() {
      // Get current user from request context
      return await getCurrentUser();
    }
  }
};

// Frontend
const login = useLensMutation(api.auth.login);
const currentUser = useLens(api.auth.whoami);

const handleLogin = async () => {
  const { token, user } = await login(email, password);
  localStorage.setItem('token', token);
};
```

## Error Handling

```typescript
// Backend - throw errors
export const api = {
  user: {
    async get(id: string) {
      const user = await db.users.findOne({ id });
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    }
  }
};

// Frontend - catch errors
function UserProfile({ userId }) {
  const { data: user, error, isLoading } = useLens(api.user.get, userId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{user.name}</div>;
}
```

## Next Steps

- [API Reference](./API.md) - Complete API documentation
- [Examples](./EXAMPLES.md) - Real-world examples
- [Migration Guide](./MIGRATION.md) - From GraphQL/tRPC/REST

## Tips

1. **Start simple** - Just write async functions
2. **Let the client choose fields** - Frontend-driven field selection
3. **Live by default** - Real-time updates automatically
4. **Optimistic mutations** - Instant UI feedback

## Philosophy

**Lens believes in:**

1. **Simplicity over features** - One way to do things
2. **Functions over configuration** - Just write async functions
3. **Convention over configuration** - Zero config, smart defaults
4. **Progressive enhancement** - Simple by default, powerful when needed
5. **Type inference over codegen** - Let TypeScript do the work

## License

MIT
