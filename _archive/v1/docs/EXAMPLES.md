# Lens Examples

Real-world examples and patterns using the simplified Lens API.

## Table of Contents

- [Basic CRUD](#basic-crud)
- [Real-time Chat](#real-time-chat)
- [E-commerce Store](#e-commerce-store)
- [Admin Dashboard](#admin-dashboard)
- [Authentication](#authentication)

## Basic CRUD

### User Management

**Backend:**

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
    const user = await db.users.create(data);
    return user;
  },

  async update(id: string, data: Partial<User>) {
    return await db.users.update({ id }, data);
  },

  async delete(id: string) {
    return await db.users.delete({ id });
  }
};
```

**Frontend:**

```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';

function UserManagement() {
  // List users
  const users = useLens(api.user.list, ['id', 'name', 'email']);

  // Mutations
  const createUser = useLensMutation(api.user.create);
  const updateUser = useLensMutation(api.user.update);
  const deleteUser = useLensMutation(api.user.delete);

  const handleCreate = async () => {
    await createUser({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    });
  };

  const handleUpdate = async (userId: string) => {
    await updateUser(userId, { name: 'John Smith' });
  };

  const handleDelete = async (userId: string) => {
    await deleteUser(userId);
  };

  return (
    <div>
      <button onClick={handleCreate}>Create User</button>

      {users?.map(user => (
        <div key={user.id}>
          <span>{user.name} ({user.email})</span>
          <button onClick={() => handleUpdate(user.id)}>Edit</button>
          <button onClick={() => handleDelete(user.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

## Real-time Chat

### Chat Room Component

**Backend:**

```typescript
// api/message.ts
export const message = {
  async list(roomId: string) {
    return await db.messages
      .find({ roomId })
      .sort({ createdAt: 1 });
  },

  async create(data: Omit<Message, 'id'>) {
    const message = await db.messages.create(data);
    // Broadcast to room subscribers
    await pubsub.publish(`room:${data.roomId}`, message);
    return message;
  }
};
```

**Frontend:**

```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';
import { useState } from 'react';

function ChatRoom({ roomId, userId }: { roomId: string; userId: string }) {
  const [inputText, setInputText] = useState('');

  // Live messages - auto-updates when new messages arrive
  const messages = useLens(
    api.message.list,
    roomId,
    ['id', 'text', 'userId', 'createdAt']
  );

  // Send message mutation
  const sendMessage = useLensMutation(api.message.create);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    await sendMessage({
      text: inputText,
      userId,
      roomId,
      createdAt: new Date()
    });

    setInputText('');
  };

  return (
    <div className="chat-room">
      <div className="messages">
        {messages?.map(msg => (
          <div
            key={msg.id}
            className={msg.userId === userId ? 'message-mine' : 'message-theirs'}
          >
            <div className="message-text">{msg.text}</div>
            <div className="message-time">
              {new Date(msg.createdAt).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
```

## E-commerce Store

### Product Catalog

**Backend:**

```typescript
// api/product.ts
export const product = {
  async list(filters?: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: 'price' | 'name';
  }) {
    let query = db.products.find({ inStock: true });

    if (filters?.category) {
      query = query.where('category').equals(filters.category);
    }

    if (filters?.minPrice || filters?.maxPrice) {
      query = query.where('price').gte(filters?.minPrice ?? 0).lte(filters?.maxPrice ?? Infinity);
    }

    if (filters?.sortBy) {
      query = query.sort({ [filters.sortBy]: 1 });
    }

    return await query.limit(20);
  },

  async get(id: string) {
    return await db.products.findOne({ id });
  }
};
```

**Frontend:**

```tsx
import { useLens } from '@sylphx/lens/react';
import { api } from './api';
import { useState } from 'react';

function ProductCatalog() {
  const [category, setCategory] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 1000 });
  const [sortBy, setSortBy] = useState<'price' | 'name'>('name');

  // Products update automatically when filters change
  const products = useLens(
    api.product.list,
    {
      category: category ?? undefined,
      minPrice: priceRange.min,
      maxPrice: priceRange.max,
      sortBy
    },
    ['id', 'name', 'description', 'price', 'imageUrl', 'category']
  );

  return (
    <div className="catalog">
      <div className="filters">
        <select
          value={category ?? ''}
          onChange={e => setCategory(e.target.value || null)}
        >
          <option value="">All Categories</option>
          <option value="electronics">Electronics</option>
          <option value="clothing">Clothing</option>
          <option value="books">Books</option>
        </select>

        <input
          type="range"
          min="0"
          max="1000"
          value={priceRange.max}
          onChange={e => setPriceRange({ ...priceRange, max: Number(e.target.value) })}
        />
        <span>Max: ${priceRange.max}</span>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'price' | 'name')}
        >
          <option value="name">Name</option>
          <option value="price">Price</option>
        </select>
      </div>

      <div className="products">
        {products?.map(product => (
          <div key={product.id} className="product-card">
            <img src={product.imageUrl} alt={product.name} />
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <div className="price">${product.price}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Shopping Cart

**Backend:**

```typescript
// api/cart.ts
export const cart = {
  async get(userId: string) {
    const cart = await db.carts.findOne({ userId });
    if (!cart) return null;

    // Populate with product details
    const items = await Promise.all(
      cart.items.map(async item => ({
        ...item,
        product: await db.products.findOne({ id: item.productId })
      }))
    );

    const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

    return { ...cart, items, total };
  },

  async updateQuantity(userId: string, productId: string, quantity: number) {
    const cart = await db.carts.findOne({ userId });
    const itemIndex = cart.items.findIndex(i => i.productId === productId);

    if (itemIndex >= 0) {
      cart.items[itemIndex].quantity = quantity;
    }

    await cart.save();
    return this.get(userId);
  }
};
```

**Frontend:**

```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';

function ShoppingCart({ userId }: { userId: string }) {
  // Live cart - updates automatically
  const cart = useLens(
    api.cart.get,
    userId,
    {
      id: true,
      items: {
        productId: true,
        quantity: true,
        product: {
          name: true,
          price: true
        }
      },
      total: true
    }
  );

  const updateQuantity = useLensMutation(api.cart.updateQuantity);

  const handleQuantityChange = async (productId: string, quantity: number) => {
    await updateQuantity(userId, productId, quantity);
  };

  return (
    <div className="cart">
      <h2>Shopping Cart</h2>

      {cart?.items.map(item => (
        <div key={item.productId} className="cart-item">
          <span>{item.product.name}</span>
          <input
            type="number"
            value={item.quantity}
            onChange={e => handleQuantityChange(item.productId, Number(e.target.value))}
            min="1"
          />
          <span>${item.product.price * item.quantity}</span>
        </div>
      ))}

      <div className="cart-total">
        Total: ${cart?.total}
      </div>
    </div>
  );
}
```

## Admin Dashboard

### Analytics

**Backend:**

```typescript
// api/analytics.ts
export const analytics = {
  async getDashboard() {
    const [
      totalUsers,
      activeUsers,
      totalRevenue,
      ordersToday
    ] = await Promise.all([
      db.users.count(),
      db.users.count({ lastActiveAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      db.orders.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      db.orders.count({ createdAt: { $gt: new Date().setHours(0, 0, 0, 0) } })
    ]);

    return {
      totalUsers,
      activeUsers,
      totalRevenue: totalRevenue[0]?.total ?? 0,
      ordersToday
    };
  },

  async getUserStats() {
    const users = await db.users.find();

    return {
      count: users.length,
      avgAge: users.reduce((sum, u) => sum + u.age, 0) / users.length,
      oldest: Math.max(...users.map(u => u.age)),
      newest: Math.min(...users.map(u => u.age))
    };
  }
};
```

**Frontend:**

```tsx
import { useLens } from '@sylphx/lens/react';
import { api } from './api';

function Analytics() {
  // Live analytics - updates automatically
  const dashboard = useLens(api.analytics.getDashboard);
  const userStats = useLens(api.analytics.getUserStats);

  return (
    <div className="analytics">
      <div className="stat-card">
        <h3>Total Users</h3>
        <div className="stat-value">{dashboard?.totalUsers}</div>
      </div>

      <div className="stat-card">
        <h3>Active Users (24h)</h3>
        <div className="stat-value">{dashboard?.activeUsers}</div>
      </div>

      <div className="stat-card">
        <h3>Total Revenue</h3>
        <div className="stat-value">${dashboard?.totalRevenue}</div>
      </div>

      <div className="stat-card">
        <h3>Orders Today</h3>
        <div className="stat-value">{dashboard?.ordersToday}</div>
      </div>

      <div className="user-stats">
        <h3>User Statistics</h3>
        <p>Average Age: {userStats?.avgAge.toFixed(1)}</p>
        <p>Oldest: {userStats?.oldest}</p>
        <p>Newest: {userStats?.newest}</p>
      </div>
    </div>
  );
}
```

## Authentication

### Login Flow

**Backend:**

```typescript
// api/auth.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const auth = {
  async login(email: string, password: string) {
    const user = await db.users.findOne({ email });

    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '7d'
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    };
  },

  async whoami() {
    // Get current user from request context
    const userId = getCurrentUserId();
    if (!userId) {
      throw new Error('Not authenticated');
    }

    return await db.users.findOne({ id: userId });
  },

  async logout() {
    // Invalidate token
    return { success: true };
  }
};
```

**Frontend:**

```tsx
import { useLens, useLensMutation } from '@sylphx/lens/react';
import { api } from './api';
import { useState } from 'react';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { mutate: login, isLoading, error } = useLensMutation(api.auth.login);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { token, user } = await login(email, password);

      // Save token
      localStorage.setItem('token', token);

      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <h1>Login</h1>

      {error && <div className="error">{error.message}</div>}

      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
        required
      />

      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
        required
      />

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}

function UserMenu() {
  // Current user - updates automatically
  const currentUser = useLens(api.auth.whoami, ['id', 'name', 'email', 'avatar']);
  const logout = useLensMutation(api.auth.logout);

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  if (!currentUser) {
    return <a href="/login">Login</a>;
  }

  return (
    <div className="user-menu">
      <img src={currentUser.avatar} alt={currentUser.name} />
      <span>{currentUser.name}</span>
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}
```

## Pagination

**Backend:**

```typescript
// api/post.ts
export const post = {
  async list(page: number = 0, limit: number = 10) {
    const posts = await db.posts
      .find({ published: true })
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit);

    const total = await db.posts.count({ published: true });

    return {
      posts,
      total,
      hasMore: (page + 1) * limit < total
    };
  }
};
```

**Frontend:**

```tsx
import { useLens } from '@sylphx/lens/react';
import { api } from './api';
import { useState } from 'react';

function PostList() {
  const [page, setPage] = useState(0);

  const { posts, total, hasMore } = useLens(
    api.post.list,
    page,
    10,
    {
      posts: {
        id: true,
        title: true,
        excerpt: true,
        createdAt: true
      },
      total: true,
      hasMore: true
    }
  );

  return (
    <div>
      <h1>Posts ({total})</h1>

      {posts?.map(post => (
        <div key={post.id} className="post-card">
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
          <small>{new Date(post.createdAt).toLocaleDateString()}</small>
        </div>
      ))}

      <div className="pagination">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Previous
        </button>

        <span>Page {page + 1}</span>

        <button
          onClick={() => setPage(p => p + 1)}
          disabled={!hasMore}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

## Search

**Backend:**

```typescript
// api/search.ts
export const search = {
  async users(query: string) {
    return await db.users.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).limit(10);
  },

  async posts(query: string) {
    return await db.posts.find({
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } }
      ],
      published: true
    }).limit(10);
  }
};
```

**Frontend:**

```tsx
import { useLens } from '@sylphx/lens/react';
import { api } from './api';
import { useState } from 'react';

function SearchPage() {
  const [query, setQuery] = useState('');

  const users = useLens(
    api.search.users,
    query,
    ['id', 'name', 'email', 'avatar'],
    { enabled: query.length >= 2 }
  );

  const posts = useLens(
    api.search.posts,
    query,
    ['id', 'title', 'excerpt'],
    { enabled: query.length >= 2 }
  );

  return (
    <div className="search">
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search..."
      />

      {query.length >= 2 && (
        <>
          <section>
            <h2>Users ({users?.length ?? 0})</h2>
            {users?.map(user => (
              <div key={user.id}>
                <img src={user.avatar} alt={user.name} />
                <span>{user.name}</span>
                <small>{user.email}</small>
              </div>
            ))}
          </section>

          <section>
            <h2>Posts ({posts?.length ?? 0})</h2>
            {posts?.map(post => (
              <div key={post.id}>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
```

## License

MIT
