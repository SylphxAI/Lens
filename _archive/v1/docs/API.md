# Lens API Reference

Complete API documentation for Lens.

## Table of Contents

- [Backend API](#backend-api)
- [Frontend API](#frontend-api)
- [Field Selection](#field-selection)
- [Options](#options)
- [Type Safety](#type-safety)

---

## Backend API

### Just Export Async Functions

The backend API is simply an object of async functions. No classes, no interfaces, no configuration.

```typescript
// api/index.ts
export const api = {
  user: {
    // Get single user
    async get(id: string) {
      return await db.users.findOne({ id });
    },

    // List users
    async list() {
      return await db.users.find();
    },

    // Create user
    async create(data: Omit<User, 'id'>) {
      return await db.users.create(data);
    },

    // Update user
    async update(id: string, data: Partial<User>) {
      return await db.users.update({ id }, data);
    },

    // Delete user
    async delete(id: string) {
      return await db.users.delete({ id });
    }
  },

  post: {
    async get(id: string) {
      return await db.posts.findOne({ id });
    },

    async list() {
      return await db.posts.find();
    }
  }
};
```

### Function Signature

```typescript
async functionName(...args: any[]): Promise<T>
```

**Rules:**
- Must be async or return a Promise
- Can take any number of arguments
- Return value becomes the data type

### Custom Methods

You're not limited to CRUD operations:

```typescript
export const api = {
  auth: {
    async whoami() {
      return await getCurrentUser();
    },

    async login(email: string, password: string) {
      const user = await db.users.findOne({ email });
      if (!user) throw new Error('Invalid credentials');
      return { token: generateToken(user), user };
    }
  },

  analytics: {
    async getStats(startDate: Date, endDate: Date) {
      return await calculateStats(startDate, endDate);
    }
  },

  weather: {
    async getToday(city: string) {
      return await fetchWeather(city);
    }
  }
};
```

### Nested Data

Return nested objects from your functions:

```typescript
export const api = {
  user: {
    async get(id: string) {
      const user = await db.users.findOne({ id });
      const posts = await db.posts.find({ authorId: id });
      const comments = await db.comments.find({ authorId: id });

      return {
        ...user,
        posts,
        comments
      };
    }
  }
};
```

### Error Handling

Just throw errors normally:

```typescript
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
```

---

## Frontend API

### `useLens()`

Main hook for queries (with live updates by default).

**Signature:**
```typescript
function useLens<T>(
  fn: (...args: any[]) => Promise<T>,
  ...args: any[]
): T

function useLens<T, S>(
  fn: (...args: any[]) => Promise<T>,
  ...args: any[],
  select: S
): Selected<T, S>

function useLens<T, S>(
  fn: (...args: any[]) => Promise<T>,
  ...args: any[],
  options: {
    select?: S;
    live?: boolean;
    refetchInterval?: number;
  }
): Selected<T, S>
```

**Basic Usage:**

```typescript
// Get all fields
const user = useLens(api.user.get, userId);
// Type: User

// Select specific fields
const user = useLens(api.user.get, userId, ['id', 'name', 'email']);
// Type: { id: string; name: string; email: string }

// With options
const user = useLens(api.user.get, userId, {
  select: ['id', 'name'],
  live: false,  // Disable live updates
  refetchInterval: 5000  // Refetch every 5 seconds
});
```

**No Arguments:**

```typescript
const currentUser = useLens(api.auth.whoami);
```

**Multiple Arguments:**

```typescript
const users = useLens(api.user.list, page, limit);
const weather = useLens(api.weather.getToday, 'San Francisco');
const stats = useLens(api.analytics.getStats, startDate, endDate);
```

**Return Value:**

```typescript
{
  data: T | null;        // The data (null if loading or error)
  isLoading: boolean;    // True during initial load
  error: Error | null;   // Error if failed
  refetch: () => void;   // Manual refetch
}

// Or destructure just the data:
const user = useLens(api.user.get, userId);
// user is the data directly (undefined if loading)
```

### `useLensMutation()`

Hook for mutations (create, update, delete).

**Signature:**
```typescript
function useLensMutation<T>(
  fn: (...args: any[]) => Promise<T>
): {
  mutate: (...args: any[]) => Promise<T>;
  isLoading: boolean;
  error: Error | null;
  data: T | null;
}
```

**Usage:**

```typescript
// Create
const { mutate: createUser, isLoading } = useLensMutation(api.user.create);

await createUser({ name: 'John', email: 'john@example.com' });

// Update
const { mutate: updateUser } = useLensMutation(api.user.update);

await updateUser(userId, { name: 'Jane' });

// Delete
const { mutate: deleteUser } = useLensMutation(api.user.delete);

await deleteUser(userId);
```

**With Callbacks:**

```typescript
const { mutate: createUser } = useLensMutation(api.user.create, {
  onSuccess: (data) => {
    console.log('User created:', data);
  },
  onError: (error) => {
    console.error('Failed:', error);
  },
  onSettled: () => {
    console.log('Mutation completed');
  }
});
```

**Optimistic Updates:**

```typescript
const { mutate: updateBalance } = useLensMutation(api.user.updateBalance, {
  optimistic: true  // UI updates instantly (default)
});

// UI updates immediately, syncs with server in background
await updateBalance(userId, 100);

// Auto-rollback if server fails
// Auto-retry on network errors
```

---

## Field Selection

### Array Syntax

Simplest way to select fields:

```typescript
const user = useLens(api.user.get, userId, ['id', 'name', 'email']);
// Type: { id: string; name: string; email: string }
```

### Object Syntax

More explicit:

```typescript
const user = useLens(api.user.get, userId, {
  id: true,
  name: true,
  email: true
});
// Type: { id: string; name: string; email: string }
```

### Nested Selection

Select nested fields:

```typescript
const user = useLens(api.user.get, userId, {
  id: true,
  name: true,
  posts: {
    id: true,
    title: true,
    comments: {
      id: true,
      text: true
    }
  }
});
// Type: {
//   id: string;
//   name: string;
//   posts: {
//     id: string;
//     title: string;
//     comments: { id: string; text: string }[]
//   }[]
// }
```

### Template Syntax

GraphQL-like syntax:

```typescript
const user = useLens(api.user.get, userId, `
  id
  name
  email
  posts {
    id
    title
    published
  }
`);
```

### Reusable Selections

Define once, use everywhere:

```typescript
const userFields = ['id', 'name', 'email', 'avatar'] as const;

const user1 = useLens(api.user.get, '1', userFields);
const user2 = useLens(api.user.get, '2', userFields);
const users = useLens(api.user.list, userFields);
```

---

## Options

### Query Options

```typescript
useLens(api.user.get, userId, {
  select: ['id', 'name'],     // Field selection
  live: true,                 // Live updates (default: true)
  refetchInterval: 5000,      // Refetch interval in ms
  enabled: true,              // Enable/disable query
  onSuccess: (data) => {},    // Success callback
  onError: (error) => {}      // Error callback
});
```

### Mutation Options

```typescript
useLensMutation(api.user.create, {
  optimistic: true,              // Optimistic updates (default: true)
  onSuccess: (data) => {},       // Success callback
  onError: (error) => {},        // Error callback
  onSettled: () => {},           // Always called
  retry: 3,                      // Retry attempts
  retryDelay: 1000              // Retry delay in ms
});
```

### Live Updates

```typescript
// Enable live updates (default)
const user = useLens(api.user.get, userId, {
  live: true
});

// Disable live updates (one-time fetch)
const user = useLens(api.user.get, userId, {
  live: false
});

// Custom refetch interval
const user = useLens(api.user.get, userId, {
  live: true,
  refetchInterval: 10000  // Refetch every 10 seconds
});
```

---

## Type Safety

### Automatic Type Inference

Types are automatically inferred from your backend functions:

```typescript
// Backend
export const api = {
  user: {
    async get(id: string): Promise<User> {
      return await db.users.findOne({ id });
    }
  }
};

// Frontend - automatic type inference
const user = useLens(api.user.get, userId);
// Type: User

const user = useLens(api.user.get, userId, ['id', 'name']);
// Type: { id: string; name: string }
```

### Type-Safe Field Selection

Field selection is type-checked:

```typescript
// ✅ Valid
const user = useLens(api.user.get, userId, ['id', 'name', 'email']);

// ❌ Error: 'invalid' is not a valid field
const user = useLens(api.user.get, userId, ['id', 'invalid']);
```

### Type-Safe Arguments

Function arguments are type-checked:

```typescript
// ✅ Valid
const user = useLens(api.user.get, '123');

// ❌ Error: expected string, got number
const user = useLens(api.user.get, 123);
```

### Return Types

Return types adapt to field selection:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

// All fields
const user = useLens(api.user.get, userId);
// Type: User

// Selected fields
const user = useLens(api.user.get, userId, ['id', 'name']);
// Type: { id: string; name: string }

// Nested selection
const user = useLens(api.user.get, userId, {
  id: true,
  name: true,
  posts: { title: true }
});
// Type: { id: string; name: string; posts: { title: string }[] }
```

---

## Error Handling

### Query Errors

```typescript
const { data, error, isLoading } = useLens(api.user.get, userId);

if (isLoading) return <div>Loading...</div>;
if (error) return <div>Error: {error.message}</div>;

return <div>{data.name}</div>;
```

### Mutation Errors

```typescript
const { mutate: createUser, error } = useLensMutation(api.user.create);

try {
  await createUser({ name: 'John', email: 'john@example.com' });
} catch (err) {
  console.error('Failed to create user:', err);
}

// Or use error state
if (error) {
  console.error('Failed:', error.message);
}
```

### Error Callbacks

```typescript
useLens(api.user.get, userId, {
  onError: (error) => {
    console.error('Query failed:', error);
    showToast('Failed to load user');
  }
});

useLensMutation(api.user.create, {
  onError: (error) => {
    console.error('Mutation failed:', error);
    showToast('Failed to create user');
  }
});
```

---

## Loading States

### Query Loading

```typescript
const { data, isLoading } = useLens(api.user.get, userId);

if (isLoading) {
  return <Spinner />;
}

return <div>{data.name}</div>;
```

### Mutation Loading

```typescript
const { mutate: createUser, isLoading } = useLensMutation(api.user.create);

return (
  <button onClick={() => createUser(data)} disabled={isLoading}>
    {isLoading ? 'Creating...' : 'Create User'}
  </button>
);
```

---

## Advanced Patterns

### Dependent Queries

```typescript
const { data: user } = useLens(api.user.get, userId);
const { data: posts } = useLens(
  api.post.list,
  user?.id,
  {
    enabled: !!user  // Only run when user is loaded
  }
);
```

### Parallel Queries

```typescript
const user = useLens(api.user.get, userId);
const posts = useLens(api.post.list);
const comments = useLens(api.comment.list);

// All three queries run in parallel
```

### Conditional Queries

```typescript
const { data } = useLens(
  api.user.get,
  userId,
  {
    enabled: shouldFetch  // Only fetch when shouldFetch is true
  }
);
```

### Manual Refetch

```typescript
const { data, refetch } = useLens(api.user.get, userId);

return (
  <div>
    <div>{data.name}</div>
    <button onClick={() => refetch()}>
      Refresh
    </button>
  </div>
);
```

### Pagination

```typescript
const [page, setPage] = useState(0);

const { data: users } = useLens(api.user.list, page, 10);

return (
  <div>
    {users?.map(user => <div key={user.id}>{user.name}</div>)}
    <button onClick={() => setPage(p => p + 1)}>Next Page</button>
  </div>
);
```

---

## License

MIT
