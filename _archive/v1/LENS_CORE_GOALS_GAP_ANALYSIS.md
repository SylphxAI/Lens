# Lens 核心目標與當前實現差距分析

**日期**: 2025-01-23
**狀態**: Critical Gap Analysis

---

## 🎯 Lens 的核心目標（用戶提醒）

### 問題背景
Code 項目使用 tRPC，面臨以下問題：

1. **粒度不一致** - 混亂的更新粒度
   - Model level: `session.update`
   - Status level: `session.status.updated`
   - Field level: `session.title.start`, `session.title.delta`, `session.title.end`
   - Usage level: `session.usage.updates`
   - 有時最細粒度（字符級），有時模型粒度（整個對象）

2. **Streaming 混亂**
   - title 更新：start → delta → delta → end（4個事件）
   - status 更新：單一事件
   - usage 更新：定期批量
   - 沒有統一的模式

3. **Optimistic Updates 困難**
   - 每個操作需要手動處理
   - 不同粒度的更新難以合併
   - 容易出錯和不一致

4. **傳輸量大**
   - 經常傳輸整個對象
   - 沒有自動壓縮
   - 沒有增量更新

### Lens 的解決方案目標

✅ **Frontend-Driven**: 前端決定需要什麼數據，什麼粒度
✅ **統一 Optimistic Updates**: 自動處理，不需要手動
✅ **粒度一致性**: 統一的模式處理所有更新
✅ **傳輸最小化**: 只傳輸變更，自動壓縮
✅ **TypeScript-First**: 像 tRPC 的完整類型推斷
✅ **根本性解決**: 不做 workaround，架構級別的解決方案

---

## 📊 當前實現狀態

### ✅ 已完成的核心功能

#### 1. Resource Definition & API Generation
```typescript
const Session = defineResource({
  name: 'session',
  fields: z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['active', 'completed']),
  }),
  relationships: {
    messages: hasMany('message'),
  },
});

// ✅ Auto-generated CRUD API
Session.api.get.query({ id: "1" });
Session.api.list.query({ where: { status: 'active' } });
Session.api.create.mutate({ title: "New" });
Session.api.update.mutate({ id: "1", data: { title: "Updated" } });
```

#### 2. DataLoader & N+1 Elimination
```typescript
// ✅ Automatic batching
const sessions = await Promise.all([
  Session.api.get.query({ id: "1" }),  // \
  Session.api.get.query({ id: "2" }),  //  } Batched into single query
  Session.api.get.query({ id: "3" }),  // /
]);

// ✅ Relationship loading
const session = await Session.api.get.query(
  { id: "1" },
  { select: { id: true, messages: { select: { id: true, content: true } } } }
);
```

#### 3. Event Stream (Pub/Sub)
```typescript
// ✅ Real-time subscriptions
Session.api.get.subscribe(
  { id: "1" },
  { select: { id: true, title: true } },
  {
    onData: (session) => console.log('Updated:', session),
  }
);
```

#### 4. Error Handling & Monitoring
```typescript
// ✅ Structured errors with codes
try {
  await Session.api.get.query({ id: "invalid" });
} catch (error) {
  if (LensError.isLensError(error)) {
    console.error(error.code, error.meta); // LENS_2002, { resource: "session", entityId: "invalid" }
  }
}

// ✅ Performance monitoring
const monitor = getPerformanceMonitor();
const stats = monitor.getSummary("session.get");
// { count: 1000, avgDuration: 25.5ms, p95: 45.2ms }
```

#### 5. Strong Typing
```typescript
// ✅ Full type inference
interface QueryContext<TUser> {
  db: DatabaseAdapter;              // Strongly typed
  eventStream?: EventStreamInterface;
  user?: TUser;
}
```

---

## ❌ 核心功能缺口（Critical Gaps）

### 1. ❌ Update Strategy 沒有整合到 Resource API

**現狀**: Update strategies (Value, Delta, Patch, Auto) 已實現，但**沒有整合到 Resource**

```typescript
// ❌ 當前：Update strategies 是獨立的，沒有自動應用
const strategy = new DeltaStrategy();
const optimisticValue = strategy.createOptimisticValue(
  { title: "Hello" },
  { title: "Hello World" }
);
// 需要手動處理

// ✅ 應該：自動整合到 Resource 定義
const Session = defineResource({
  name: 'session',
  fields: z.object({
    title: z.string(),    // 自動使用 Delta strategy
    status: z.enum(...),  // 自動使用 Value strategy
    metadata: z.object(), // 自動使用 Patch strategy
  }),
  optimistic: {
    strategy: 'auto',  // ❌ 這個還沒實現！
  },
});
```

**影響**:
- ❌ 無法自動選擇最優的更新策略
- ❌ 傳輸量沒有最小化
- ❌ Optimistic updates 需要手動處理

**需要實現**:
1. 自動分析 field types → 選擇策略
2. 整合到 mutation API
3. 整合到 subscription updates
4. 自動應用於 optimistic updates

---

### 2. ❌ Field-Level Subscriptions 沒有實現

**現狀**: 只能訂閱整個 resource 或選擇的 fields，**沒有 field-level 事件**

```typescript
// ❌ 當前：訂閱整個對象或選擇的 fields
Session.api.get.subscribe(
  { id: "1" },
  { select: { title: true } },  // 只選擇 title，但還是收到整個 title
  { onData: (data) => console.log(data.title) }
);

// ✅ 應該：支持 field-level 事件（解決粒度問題）
Session.api.get.subscribe(
  { id: "1" },
  {
    fields: {
      title: {
        // 🎯 解決 session.title.start/delta/end 的問題
        streaming: true,  // title 使用 streaming (start/delta/end)
        onStart: (title) => console.log('Title started:', title),
        onDelta: (delta) => console.log('Title delta:', delta),
        onEnd: (title) => console.log('Title completed:', title),
      },
      status: {
        // 🎯 status 直接更新，不需要 streaming
        onChange: (status) => console.log('Status:', status),
      }
    }
  }
);
```

**影響**:
- ❌ 無法統一處理不同粒度的更新
- ❌ session.title.start/delta/end 需要手動處理
- ❌ 沒有標準模式處理 streaming fields

**需要實現**:
1. Field-level subscription API
2. Streaming field support (start/delta/end)
3. Field update merging
4. Event aggregation

---

### 3. ❌ Frontend-Driven Optimistic Updates 沒有實現

**現狀**: Optimistic updates 定義在 Resource，但**沒有 client-side 整合**

```typescript
// ❌ 當前：Server-side 定義，client 需要手動處理
const Session = defineResource({
  optimistic: {
    idField: 'id',
    apply: (draft, mutation) => {
      Object.assign(draft, mutation.data);
    }
  }
});

// Client 需要手動：
// 1. 創建 optimistic entity
// 2. 應用到 cache
// 3. 處理成功/失敗
// 4. 回滾如果失敗

// ✅ 應該：Frontend-driven，自動處理
const { mutate, isOptimistic } = useSessionUpdate();

mutate(
  { id: "1", data: { title: "New Title" } },
  {
    // 🎯 前端決定 optimistic behavior
    optimistic: true,  // 自動創建 optimistic update
    rollbackOnError: true,  // 自動回滾
    // 自動應用 update strategy (Delta for title)
  }
);
```

**影響**:
- ❌ Frontend 需要大量 boilerplate code
- ❌ 無法一致性地處理 optimistic updates
- ❌ 容易出錯和不一致

**需要實現**:
1. Client SDK with hooks (useQuery, useMutation, useSubscription)
2. Automatic optimistic updates
3. Cache management
4. Rollback mechanism
5. Type inference from server schema

---

### 4. ❌ Transport Layer 沒有整合 Update Strategies

**現狀**: Transport (HTTP, SSE, WebSocket) 是獨立的，**沒有自動應用壓縮**

```typescript
// ❌ 當前：Transport 只是傳輸，沒有優化
transport.send({
  type: 'update',
  data: {
    id: "1",
    title: "New very long title...",  // 完整傳輸
    status: "active",
    metadata: { ... }  // 完整對象
  }
});

// ✅ 應該：自動應用 update strategy
transport.send({
  type: 'update',
  strategy: 'delta',  // 自動選擇
  data: {
    id: "1",
    title: {
      op: 'insert',
      pos: 4,
      text: 'New '  // ✅ 只傳輸 delta (57% 節省)
    },
    status: "active",  // Value strategy
    // metadata 沒變，不傳輸
  }
});
```

**影響**:
- ❌ 傳輸量沒有最小化
- ❌ 帶寬浪費
- ❌ 特別是 streaming updates (title deltas)

**需要實現**:
1. Transport middleware for update strategies
2. Automatic compression
3. Delta encoding/decoding
4. Patch operations
5. Minimal payload generation

---

### 5. ❌ 沒有 Client SDK

**現狀**: 只有 server-side 實現，**沒有 React hooks 和 client utilities**

```typescript
// ❌ 當前：沒有 client SDK，需要手動：
const [session, setSession] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch('/api/session/1')
    .then(r => r.json())
    .then(setSession)
    .finally(() => setLoading(false));
}, []);

// 手動處理 subscriptions
// 手動處理 optimistic updates
// 手動處理 cache
// 沒有類型推斷

// ✅ 應該：完整的 React integration（像 tRPC）
const { data: session, isLoading } = useSession({ id: "1" });

const { mutate } = useUpdateSession();
mutate(
  { id: "1", data: { title: "New" } },
  { optimistic: true }  // 自動處理
);

const { data: sessions } = useSessionSubscription({
  where: { status: 'active' },
  select: { id: true, title: true },
  // 自動處理 reconnection, backoff, etc.
});
```

**影響**:
- ❌ 沒有 tRPC 般的 DX
- ❌ 沒有類型推斷
- ❌ 需要大量 boilerplate
- ❌ 無法實現 "frontend-driven" 的目標

**需要實現**:
1. `@sylphx/lens-react` package
2. `useQuery`, `useMutation`, `useSubscription` hooks
3. Automatic cache management
4. Type inference (從 server schema)
5. Optimistic updates integration
6. Error boundaries
7. Loading states
8. Retry logic

---

### 6. ❌ 沒有從 tRPC 遷移的實際整合

**現狀**: Lens 是獨立實現，**沒有整合到 Code 項目**

```typescript
// ❌ 當前：Code 項目還在用 tRPC
// ~/code/packages/code-server/src/trpc/routers/session.router.ts
export const sessionRouter = router({
  getById: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // 手動處理
    }),

  update: publicProcedure
    .input(...)
    .mutation(async ({ ctx, input }) => {
      // 手動處理
      // 手動發送事件
      publishTitleUpdate(...)  // 不一致的粒度
    }),
});

// ✅ 應該：遷移到 Lens
// ~/code/packages/code-server/src/lens/resources/session.ts
const Session = defineResource({
  name: 'session',
  fields: z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['active', 'completed']),
  }),
  optimistic: {
    strategy: 'auto',
  },
});

// 自動生成所有 API
// 自動處理 streaming updates
// 自動處理 optimistic updates
// 統一的粒度
```

**影響**:
- ❌ Lens 沒有實際應用
- ❌ Code 項目的問題沒有解決
- ❌ 無法驗證 Lens 的設計

**需要實現**:
1. 在 Code 項目中定義 Lens resources
2. 遷移 session router 到 Lens
3. 遷移 message router 到 Lens
4. 整合到現有的 database (Prisma)
5. 替換 tRPC endpoints
6. 更新 frontend 使用 Lens hooks

---

## 🎯 優先級排序

### Phase 4.1: Update Strategy Integration (最高優先級)
**為什麼**: 核心功能，解決傳輸量和 optimistic updates

1. 整合 update strategies 到 Resource definition
2. 自動選擇策略 based on field types
3. 應用到 mutations
4. 應用到 subscriptions

### Phase 4.2: Field-Level Subscriptions
**為什麼**: 解決粒度不一致問題

1. Field-level subscription API
2. Streaming field support (start/delta/end)
3. Event merging and aggregation

### Phase 4.3: Client SDK (React Hooks)
**為什麼**: 實現 frontend-driven，提供 tRPC 般的 DX

1. Create `@sylphx/lens-react` package
2. Implement useQuery, useMutation, useSubscription
3. Automatic optimistic updates
4. Type inference

### Phase 4.4: Transport Integration
**為什麼**: 最小化傳輸量

1. Transport middleware for strategies
2. Automatic compression
3. Delta/Patch encoding

### Phase 4.5: Code Project Integration
**為什麼**: 實際應用和驗證

1. Define Session, Message resources
2. Migrate routers
3. Update frontend
4. Test and validate

---

## 📝 結論

### 已完成 (✅)
- Resource definition & API generation
- DataLoader & batching
- Event stream
- Error handling
- Performance monitoring
- Strong typing

### 核心缺口 (❌)
1. **Update Strategy Integration** - 傳輸優化的核心
2. **Field-Level Subscriptions** - 粒度控制的核心
3. **Frontend Optimistic Updates** - 用戶體驗的核心
4. **Client SDK** - DX 和類型推斷的核心
5. **Transport Integration** - 傳輸最小化的核心
6. **Code Project Integration** - 實際應用的驗證

### 下一步
**立即開始 Phase 4.1**: Update Strategy Integration
- 這是解決核心問題的基礎
- 影響所有後續功能
- 必須先完成才能實現真正的 optimistic updates 和傳輸優化
