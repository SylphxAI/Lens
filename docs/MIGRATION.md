# Migration Guide

Migrate to Lens from other data fetching solutions.

## Table of Contents

- [From GraphQL](#from-graphql)
- [From tRPC](#from-trpc)
- [From REST](#from-rest)
- [From React Query / SWR](#from-react-query--swr)
- [From Prisma (Backend)](#from-prisma-backend)

---

## From GraphQL

### Backend Comparison

**GraphQL** (Schema Required):
```graphql
# schema.graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
}

type Query {
  user(id: ID!): User
  users: [User!]!
}

type Mutation {
  createUser(name: String!, email: String!): User!
}
```

```typescript
// resolver.ts
export const resolvers = {
  Query: {
    user: async (_, { id }) => {
      return await db.users.findUnique({ where: { id } });
    },
    users: async () => {
      return await db.users.findMany();
    }
  },
  Mutation: {
    createUser: async (_, { name, email }) => {
      return await db.users.create({ data: { name, email } });
    }
  },
  User: {
    posts: async (user) => {
      return await db.posts.findMany({ where: { authorId: user.id } });
    }
  }
};
```

**Lens** (Just Functions):
```typescript
// api/user.ts
export const user = {
  async get(id: string) {
    return await db.users.findUnique({ where: { id } });
  },

  async list() {
    return await db.users.findMany();
  },

  async create(data: { name: string; email: string }) {
    return await db.users.create({ data });
  }
};
```

### Frontend Comparison

**GraphQL**:
```tsx
import { useQuery, useMutation, gql } from '@apollo/client';

const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
      posts {
        id
        title
      }
    }
  }
`;

function UserProfile({ userId }) {
  const { data, loading, error } = useQuery(GET_USER, {
    variables: { id: userId }
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{data.user.name}</div>;
}
```

**Lens**:
```tsx
import { useLens } from '@sylphx/lens/react';
import { api } from './api';

function UserProfile({ userId }) {
  const user = useLens(api.user.get, userId, {
    id: true,
    name: true,
    email: true,
    posts: {
      id: true,
      title: true
    }
  });

  if (!user) return <div>Loading...</div>;

  return <div>{user.name}</div>;
}
```

### Key Benefits

| Feature | GraphQL | Lens |
|---------|---------|------|
| Schema | Required (SDL) | Not required (TypeScript) |
| Codegen | Required | Not required |
| Setup | Complex | Simple |
| Field Selection | ✅ Yes | ✅ Yes |
| Real-time | Subscriptions (complex) | Built-in (automatic) |
| Type Safety | Via codegen | Native TypeScript |

---

## From tRPC

### Backend Comparison

**tRPC**:
```typescript
import { router, publicProcedure } from './trpc';
import { z } from 'zod';

export const appRouter = router({
  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return await db.users.findUnique({ where: { id: input.id } });
    }),

  createUser: publicProcedure
    .input(z.object({
      name: z.string(),
      email: z.string().email()
    }))
    .mutation(async ({ input }) => {
      return await db.users.create({ data: input });
    })
});
```

**Lens**:
```typescript
export const user = {
  async get(id: string) {
    return await db.users.findUnique({ where: { id } });
  },

  async create(data: { name: string; email: string }) {
    return await db.users.create({ data });
  }
};
```

### Frontend Comparison

**tRPC**:
```tsx
import { trpc } from './trpc';

function UserProfile({ userId }) {
  const { data: user, isLoading } = trpc.getUser.useQuery({ id: userId });
  const createUser = trpc.createUser.useMutation();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div>{user.name}</div>
      <button onClick={() => createUser.mutate({ name: 'John', email: 'john@example.com' })}>
        Create
      </button>
    </div>
  );
}
```

**Lens**:
```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';

function UserProfile({ userId }) {
  const user = useLens(api.user.get, userId, ['id', 'name', 'email']);
  const createUser = useLensMutation(api.user.create);

  if (!user) return <div>Loading...</div>;

  return (
    <div>
      <div>{user.name}</div>
      <button onClick={() => createUser({ name: 'John', email: 'john@example.com' })}>
        Create
      </button>
    </div>
  );
}
```

### Key Differences

| Feature | tRPC | Lens |
|---------|------|------|
| Backend Complexity | Medium (procedures, routers) | Low (just functions) |
| Field Selection | ❌ No | ✅ Yes |
| Frontend-Driven | ❌ No | ✅ Yes |
| Real-time | Manual subscriptions | Built-in |
| Validation | Zod (manual) | TypeScript (automatic) |

---

## From REST

### Backend Comparison

**REST**:
```typescript
app.get('/api/users/:id', async (req, res) => {
  const user = await db.users.findUnique({ where: { id: req.params.id } });
  res.json(user);
});

app.get('/api/users', async (req, res) => {
  const users = await db.users.findMany({
    where: {
      age: { gte: Number(req.query.minAge) }
    },
    take: Number(req.query.limit) || 10
  });
  res.json(users);
});

app.post('/api/users', async (req, res) => {
  const user = await db.users.create({ data: req.body });
  res.json(user);
});
```

**Lens**:
```typescript
export const user = {
  async get(id: string) {
    return await db.users.findUnique({ where: { id } });
  },

  async list(filters: { minAge?: number; limit?: number }) {
    return await db.users.findMany({
      where: filters.minAge ? { age: { gte: filters.minAge } } : undefined,
      take: filters.limit || 10
    });
  },

  async create(data: Omit<User, 'id'>) {
    return await db.users.create({ data });
  }
};
```

### Frontend Comparison

**REST**:
```tsx
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(setUser)
      .finally(() => setLoading(false));
  }, [userId]);

  const handleCreate = async () => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'John', email: 'john@example.com' })
    });
    const newUser = await response.json();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div>{user.name}</div>
      <button onClick={handleCreate}>Create</button>
    </div>
  );
}
```

**Lens**:
```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';

function UserProfile({ userId }) {
  const user = useLens(api.user.get, userId, ['id', 'name', 'email']);
  const createUser = useLensMutation(api.user.create);

  if (!user) return <div>Loading...</div>;

  return (
    <div>
      <div>{user.name}</div>
      <button onClick={() => createUser({ name: 'John', email: 'john@example.com' })}>
        Create
      </button>
    </div>
  );
}
```

### Key Benefits

| Feature | REST | Lens |
|---------|------|------|
| Endpoints | Manual routing | Auto-generated |
| Field Selection | ❌ No (over-fetching) | ✅ Yes (frontend-driven) |
| Type Safety | ❌ Manual typing | ✅ Full inference |
| Real-time | ❌ Manual polling/SSE | ✅ Built-in |
| Code Amount | More boilerplate | Less code |

---

## From React Query / SWR

### Frontend Comparison

**React Query**:
```tsx
import { useQuery, useMutation } from '@tanstack/react-query';

function UserProfile({ userId }) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetch(`/api/users/${userId}`).then(r => r.json())
  });

  const createUser = useMutation({
    mutationFn: (data) =>
      fetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(data)
      }).then(r => r.json())
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div>{user.name}</div>
      <button onClick={() => createUser.mutate({ name: 'John', email: 'john@example.com' })}>
        Create
      </button>
    </div>
  );
}
```

**Lens**:
```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';

function UserProfile({ userId }) {
  const user = useLens(api.user.get, userId, ['id', 'name', 'email']);
  const createUser = useLensMutation(api.user.create);

  if (!user) return <div>Loading...</div>;

  return (
    <div>
      <div>{user.name}</div>
      <button onClick={() => createUser({ name: 'John', email: 'john@example.com' })}>
        Create
      </button>
    </div>
  );
}
```

### Key Differences

| Feature | React Query/SWR | Lens |
|---------|-----------------|------|
| Type Safety | ❌ Manual | ✅ Automatic |
| Field Selection | ❌ No | ✅ Yes |
| Backend Integration | ❌ Manual fetch | ✅ Integrated |
| Real-time | ❌ Manual | ✅ Built-in |
| Query Keys | Manual | Not needed |

---

## From Prisma (Backend)

If you're using Prisma on the backend, Lens becomes your frontend-to-backend layer.

**Before** (Prisma + REST):
```typescript
// Backend
app.get('/api/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      email: true
    }
  });
  res.json(user);
});

// Frontend
const response = await fetch(`/api/users/${userId}`);
const user = await response.json();
```

**After** (Prisma + Lens):
```typescript
// Backend
export const user = {
  async get(id: string) {
    return await prisma.user.findUnique({ where: { id } });
  }
};

// Frontend
const user = useLens(api.user.get, userId, ['id', 'name', 'email']);
// Field selection happens automatically!
```

### Prisma-like API

Lens syntax is inspired by Prisma:

```typescript
// Prisma (Backend only)
const user = await prisma.user.findUnique({
  where: { id: '123' },
  select: { id: true, name: true, email: true }
});

// Lens (Frontend-to-backend)
const user = useLens(api.user.get, '123', {
  id: true,
  name: true,
  email: true
});
```

---

## Migration Steps

### 1. Install Lens

```bash
bun add @sylphx/lens
```

### 2. Create API Functions

**Replace your REST endpoints / tRPC procedures / GraphQL resolvers with simple functions:**

```typescript
// api/user.ts
export const user = {
  async get(id: string) {
    return await db.users.findOne({ id });
  },

  async list() {
    return await db.users.find();
  },

  async create(data: Omit<User, 'id'>) {
    return await db.users.create(data);
  },

  async update(id: string, data: Partial<User>) {
    return await db.users.update({ id }, data);
  },

  async delete(id: string) {
    return await db.users.delete({ id });
  }
};

// api/index.ts
export { user } from './user';
export { post } from './post';
// ... export all your APIs
```

### 3. Replace Frontend Calls

**Before** (Any solution):
```tsx
// Various patterns...
const { data } = useQuery({ queryKey: ['user'], queryFn: fetchUser });
const user = await trpc.user.get.query({ id: '123' });
const response = await fetch('/api/users/123');
```

**After** (Lens):
```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';

// Query
const user = useLens(api.user.get, userId, ['id', 'name', 'email']);

// Mutation
const createUser = useLensMutation(api.user.create);
await createUser({ name: 'John', email: 'john@example.com' });
```

### 4. Incremental Migration

You don't have to migrate everything at once:

```typescript
// Old REST endpoints continue to work
app.get('/api/legacy/users/:id', ...);

// New Lens API alongside
export const user = {
  async get(id: string) { ... }
};

// Use both in frontend
const legacyData = await fetch('/api/legacy/users/123');
const newData = useLens(api.user.get, '123');
```

---

## Common Patterns

### Authenticated Requests

**Before**:
```typescript
const response = await fetch('/api/users/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**After**:
```typescript
// Backend - get user from context
export const auth = {
  async whoami() {
    const userId = getCurrentUserId(); // From request context
    return await db.users.findOne({ id: userId });
  }
};

// Frontend
const currentUser = useLens(api.auth.whoami);
```

### Nested Data

**Before** (Multiple requests):
```typescript
const user = await fetch(`/api/users/${userId}`).then(r => r.json());
const posts = await fetch(`/api/posts?authorId=${userId}`).then(r => r.json());
```

**After** (Single request with field selection):
```typescript
// Backend
export const user = {
  async get(id: string) {
    const user = await db.users.findOne({ id });
    const posts = await db.posts.find({ authorId: id });
    return { ...user, posts };
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

---

## Tips

1. **Start with one model** - Migrate user-related endpoints first
2. **Coexist peacefully** - Lens works alongside existing REST/GraphQL/tRPC
3. **Trust TypeScript** - Let type inference guide the migration
4. **Field selection** - Use it to optimize data transfer
5. **Real-time** - Enable live updates by default (just use useLens)

---

## License

MIT
