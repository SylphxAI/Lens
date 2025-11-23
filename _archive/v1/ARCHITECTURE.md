# Lens Implementation Architecture

**Status:** 🚧 Design Complete - Ready for Implementation

---

## Package Structure

```
packages/lens/
├── lens-core/           # Core types, schema builder, client runtime
├── lens-server/         # Server-side runtime, auto-subscription
├── lens-transport-http/ # HTTP transport implementation
├── lens-transport-ws/   # WebSocket transport implementation
├── lens-react/          # React hooks (useLens, useLensMutation)
└── lens-vue/            # Vue composables (optional)
```

---

## Implementation Phases

### Phase 1: Core Type System (lens-core)
**Goal:** Type-safe schema builder with Zod integration

**Files to Create:**
```
lens-core/src/
├── schema/
│   ├── builder.ts           # lens.object(), lens.query(), lens.mutation()
│   ├── types.ts             # Core type definitions
│   └── inference.ts         # Type inference utilities
├── transport/
│   ├── interface.ts         # LensTransport interface
│   ├── router.ts            # TransportRouter
│   ├── middleware.ts        # MiddlewareTransport
│   └── in-process.ts        # InProcessTransport
├── update-strategy/
│   ├── types.ts             # UpdateMode, UpdateStrategy
│   ├── value.ts             # ValueStrategy
│   ├── delta.ts             # DeltaStrategy (text delta)
│   ├── patch.ts             # PatchStrategy (JSON Patch RFC 6902)
│   └── auto.ts              # AutoStrategy (intelligent selection)
├── client/
│   ├── client.ts            # createLensClient()
│   ├── request.ts           # Request building
│   └── response.ts          # Response handling
└── index.ts
```

**Core Types:**
```typescript
// schema/types.ts
export interface LensQuery<TInput, TOutput> {
  type: 'query';
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  resolve: (input: TInput) => Promise<TOutput>;
  subscribe?: (input: TInput) => Observable<TOutput>;
}

export interface LensMutation<TInput, TOutput> {
  type: 'mutation';
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  resolve: (input: TInput) => Promise<TOutput>;
}

export interface LensObject<T> {
  [key: string]: LensQuery<any, any> | LensMutation<any, any> | LensObject<any>;
}

// transport/interface.ts
export interface LensTransport {
  send<T>(request: LensRequest): Promise<T> | Observable<T>;
  close?: () => void;
}

export interface LensRequest {
  type: 'query' | 'mutation' | 'subscription';
  path: string[];
  input: unknown;
  select?: FieldSelection;
  updateMode?: UpdateMode;
}

// update-strategy/types.ts
export type UpdateMode = 'value' | 'delta' | 'patch' | 'auto';

export interface UpdateStrategy {
  mode: UpdateMode;
  encode(current: unknown, next: unknown): unknown;
  decode(current: unknown, update: unknown): unknown;
}
```

**Implementation Priority:**
1. ✅ Schema builder (lens.query, lens.mutation, lens.object)
2. ✅ Type inference from Zod schemas
3. ✅ Transport interface
4. ✅ Update strategies (value, delta, patch, auto)
5. ✅ Client runtime

---

### Phase 2: Server Runtime (lens-server)
**Goal:** Handle requests, auto-subscription, field selection

**Files to Create:**
```
lens-server/src/
├── handler/
│   ├── request-handler.ts   # Process incoming requests
│   ├── field-selector.ts    # Apply field selection to results
│   └── validator.ts         # Zod validation
├── subscription/
│   ├── auto-subscribe.ts    # Auto-subscription logic
│   ├── channel.ts           # Channel naming conventions
│   └── pubsub.ts            # PubSub adapter interface
├── compression/
│   ├── middleware.ts        # Compression middleware
│   ├── brotli.ts           # Brotli compression
│   └── gzip.ts             # Gzip compression
├── server.ts                # createLensServer()
└── index.ts
```

**Server Configuration:**
```typescript
// server.ts
export interface LensServerConfig {
  // Auto-subscription
  autoSubscribe?: {
    channelFor: (path: string[], input: unknown) => string;
    pubsub: PubSubAdapter;
  };

  // Update mode
  updateMode?: UpdateMode;

  // Compression
  compression?: {
    enabled: boolean;
    algorithm: 'brotli' | 'gzip';
    threshold: number;
  };
}

export function createLensServer<T extends LensObject<any>>(
  api: T,
  config?: LensServerConfig
): LensServer;
```

**Implementation Priority:**
1. ✅ Request handler (parse, validate, execute)
2. ✅ Field selection implementation
3. ✅ Auto-subscription system
4. ✅ Compression middleware
5. ✅ HTTP/WebSocket handlers

---

### Phase 3: Transport Implementations

#### HTTP Transport (lens-transport-http)
```
lens-transport-http/src/
├── transport.ts             # HTTPTransport class
├── fetch.ts                 # Fetch wrapper
└── index.ts
```

```typescript
export class HTTPTransport implements LensTransport {
  constructor(config: {
    url: string;
    headers?: Record<string, string>;
    fetch?: typeof fetch;
  });

  send<T>(request: LensRequest): Promise<T>;
}
```

#### WebSocket Transport (lens-transport-ws)
```
lens-transport-ws/src/
├── transport.ts             # WebSocketTransport class
├── reconnect.ts             # Auto-reconnect logic
└── index.ts
```

```typescript
export class WebSocketTransport implements LensTransport {
  constructor(config: {
    url: string;
    reconnect?: boolean;
    compress?: 'brotli' | 'gzip';
  });

  send<T>(request: LensRequest): Observable<T>;
  close(): void;
}
```

---

### Phase 4: React Integration (lens-react)
**Goal:** Hooks for queries and mutations with optimistic updates

**Files to Create:**
```
lens-react/src/
├── hooks/
│   ├── useLens.ts           # Query hook with live updates
│   ├── useLensMutation.ts   # Mutation hook with optimistic updates
│   └── useLensSubscription.ts # Direct subscription hook
├── context/
│   └── LensProvider.tsx     # React context provider
├── optimistic/
│   ├── manager.ts           # Optimistic update manager
│   ├── effects.ts           # Effect system integration
│   └── rollback.ts          # Auto-rollback logic
└── index.ts
```

**Hook Signatures:**
```typescript
// hooks/useLens.ts
export function useLens<T, S>(
  fn: LensQuery<any, T>,
  input?: unknown,
  options?: {
    select?: S;
    live?: boolean;
    refetchInterval?: number;
    enabled?: boolean;
    onSuccess?: (data: Selected<T, S>) => void;
    onError?: (error: Error) => void;
  }
): {
  data: Selected<T, S> | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

// hooks/useLensMutation.ts
export function useLensMutation<TInput, TOutput>(
  fn: LensMutation<TInput, TOutput>,
  options?: {
    optimistic?: boolean;
    onSuccess?: (data: TOutput) => void;
    onError?: (error: Error) => void;
    onSettled?: () => void;
    retry?: number;
    retryDelay?: number;
  }
): {
  mutate: (input: TInput) => Promise<TOutput>;
  isLoading: boolean;
  error: Error | null;
  data: TOutput | null;
};
```

**Optimistic Update Integration:**
```typescript
// Integrate with existing @sylphx/optimistic system
import { runOptimisticEffects } from '@sylphx/optimistic';

export function useLensMutation<TInput, TOutput>(
  fn: LensMutation<TInput, TOutput>,
  options?: MutationOptions<TInput, TOutput>
) {
  const mutate = async (input: TInput) => {
    if (options?.optimistic) {
      // 1. Generate optimistic effects
      const effects = generateOptimisticEffects(fn, input);

      // 2. Apply optimistically
      runOptimisticEffects(effects);

      // 3. Send to server
      try {
        const result = await client.send(request);
        // Confirm optimistic update
        return result;
      } catch (error) {
        // Rollback on error
        runOptimisticEffects(generateRollbackEffects(fn, input));
        throw error;
      }
    }

    // Non-optimistic path
    return await client.send(request);
  };

  return { mutate, isLoading, error, data };
}
```

---

## Key Implementation Details

### 1. Field Selection Implementation

**Server-side (lens-server/handler/field-selector.ts):**
```typescript
export function applyFieldSelection<T>(
  data: T,
  select: FieldSelection
): Selected<T, typeof select> {
  if (Array.isArray(select)) {
    // Array syntax: ['id', 'name']
    return Object.fromEntries(
      select.map(key => [key, data[key as keyof T]])
    );
  }

  if (typeof select === 'object') {
    // Object syntax: { id: true, posts: { title: true } }
    const result: any = {};
    for (const [key, value] of Object.entries(select)) {
      if (value === true) {
        result[key] = data[key as keyof T];
      } else if (typeof value === 'object') {
        // Nested selection
        const nested = data[key as keyof T];
        if (Array.isArray(nested)) {
          result[key] = nested.map(item => applyFieldSelection(item, value));
        } else {
          result[key] = applyFieldSelection(nested, value);
        }
      }
    }
    return result;
  }

  // No selection - return all
  return data;
}
```

### 2. Auto-Subscription Implementation

**Server-side (lens-server/subscription/auto-subscribe.ts):**
```typescript
export function createAutoSubscription<TInput, TOutput>(
  query: LensQuery<TInput, TOutput>,
  config: AutoSubscribeConfig
) {
  return (input: TInput): Observable<TOutput> => {
    // If query has explicit subscribe, use it
    if (query.subscribe) {
      return query.subscribe(input);
    }

    // Otherwise, use convention-based channel
    const channel = config.channelFor(query.path, input);

    return config.pubsub.subscribe(channel).pipe(
      map(event => event.payload as TOutput)
    );
  };
}
```

**Auto-publish on mutation:**
```typescript
export async function executeMutation<TInput, TOutput>(
  mutation: LensMutation<TInput, TOutput>,
  input: TInput,
  config: LensServerConfig
): Promise<TOutput> {
  // 1. Execute mutation
  const result = await mutation.resolve(input);

  // 2. Auto-publish if configured
  if (config.autoSubscribe) {
    const channel = config.autoSubscribe.channelFor(mutation.path, input);
    await config.autoSubscribe.pubsub.publish(channel, {
      type: 'mutation',
      payload: result
    });
  }

  return result;
}
```

### 3. Update Strategy - Auto Selection

**lens-core/update-strategy/auto.ts:**
```typescript
export class AutoStrategy implements UpdateStrategy {
  mode = 'auto' as const;

  encode(current: unknown, next: unknown): { mode: UpdateMode; data: unknown } {
    // String growth (LLM streaming) → delta
    if (
      typeof current === 'string' &&
      typeof next === 'string' &&
      next.startsWith(current) &&
      next.length > current.length
    ) {
      return {
        mode: 'delta',
        data: next.slice(current.length)
      };
    }

    // Object update → patch
    if (
      typeof current === 'object' &&
      typeof next === 'object' &&
      current !== null &&
      next !== null
    ) {
      const patch = jsonPatch.compare(current, next);
      const patchSize = JSON.stringify(patch).length;
      const valueSize = JSON.stringify(next).length;

      // Use patch if >50% savings
      if (patchSize < valueSize * 0.5) {
        return { mode: 'patch', data: patch };
      }
    }

    // Default: full value
    return { mode: 'value', data: next };
  }

  decode(current: unknown, update: { mode: UpdateMode; data: unknown }): unknown {
    switch (update.mode) {
      case 'delta':
        return current + update.data;
      case 'patch':
        return jsonPatch.applyPatch(current, update.data);
      case 'value':
        return update.data;
    }
  }
}
```

### 4. Compression Middleware

**lens-server/compression/middleware.ts:**
```typescript
export function compressionMiddleware(config: CompressionConfig): LensMiddleware {
  return async (request, next) => {
    const result = await next(request);

    if (!config.enabled) return result;

    const serialized = JSON.stringify(result);
    if (serialized.length < config.threshold) {
      // Too small, don't compress
      return result;
    }

    const compressed = await compress(serialized, config.algorithm);

    return {
      compressed: true,
      algorithm: config.algorithm,
      data: compressed
    };
  };
}

async function compress(data: string, algorithm: 'brotli' | 'gzip'): Promise<Uint8Array> {
  if (algorithm === 'brotli') {
    return brotliCompress(Buffer.from(data));
  } else {
    return gzipCompress(Buffer.from(data));
  }
}
```

---

## Integration with Existing Architecture

### Event Stream Integration

**Connect Lens to existing AppEventStream:**
```typescript
// lens-server config
import { AppEventStream } from '@sylphx/code-server';

const eventStream = new AppEventStream();

const server = createLensServer(api, {
  autoSubscribe: {
    channelFor: (path, input) => {
      // Convention: `query:user:get:123`
      return `query:${path.join(':')}:${input.id}`;
    },
    pubsub: {
      subscribe: (channel) => eventStream.subscribe(channel),
      publish: (channel, event) => eventStream.publish(channel, event)
    }
  }
});
```

### Zen Signal Integration

**Client-side integration with @sylphx/zen:**
```typescript
// lens-react with zen signals
import { zen, computed } from '@sylphx/zen';

export function useLens<T>(fn, input, options) {
  const dataSignal = zen<T | null>(null);
  const isLoadingSignal = zen(true);
  const errorSignal = zen<Error | null>(null);

  useEffect(() => {
    const subscription = client.send(request).subscribe({
      next: (data) => {
        dataSignal.value = data;
        isLoadingSignal.value = false;
      },
      error: (error) => {
        errorSignal.value = error;
        isLoadingSignal.value = false;
      }
    });

    return () => subscription.unsubscribe();
  }, [/* deps */]);

  return {
    data: useZen(dataSignal),
    isLoading: useZen(isLoadingSignal),
    error: useZen(errorSignal)
  };
}
```

---

## Testing Strategy

### Unit Tests
- Schema builder type inference
- Field selection logic
- Update strategy selection
- Transport implementations
- Compression/decompression

### Integration Tests
- Client-server communication
- Auto-subscription flow
- Optimistic updates with rollback
- Real-time updates via WebSocket
- Field selection with nested data

### Performance Tests
- Bandwidth savings (delta vs patch vs value)
- Compression ratio (brotli vs gzip)
- Update strategy overhead
- Large payload handling

---

## Implementation Order

**Week 1: Core Foundation**
1. ✅ Schema builder (lens.query, lens.mutation, lens.object)
2. ✅ Type inference system
3. ✅ Transport interface
4. ✅ InProcessTransport (for testing)

**Week 2: Update Strategies**
1. ✅ ValueStrategy
2. ✅ DeltaStrategy (text delta)
3. ✅ PatchStrategy (JSON Patch)
4. ✅ AutoStrategy (intelligent selection)

**Week 3: Server Runtime**
1. ✅ Request handler
2. ✅ Field selector
3. ✅ Validation
4. ✅ Auto-subscription

**Week 4: Transport Layer**
1. ✅ HTTPTransport
2. ✅ WebSocketTransport
3. ✅ TransportRouter
4. ✅ Compression middleware

**Week 5: React Integration**
1. ✅ useLens hook
2. ✅ useLensMutation hook
3. ✅ Optimistic updates
4. ✅ LensProvider

**Week 6: Polish & Testing**
1. ✅ Integration tests
2. ✅ Performance benchmarks
3. ✅ Documentation examples
4. ✅ Migration guides

---

## Success Metrics

- ✅ Type inference works without codegen
- ✅ Field selection reduces payload size
- ✅ Delta mode achieves 50%+ bandwidth savings on LLM streaming
- ✅ Patch mode achieves 90%+ bandwidth savings on object updates
- ✅ Auto-subscription works with AppEventStream
- ✅ Optimistic updates integrate with @sylphx/optimistic
- ✅ Custom transports can be implemented in <100 LOC
- ✅ API is simpler than tRPC/GraphQL

---

## Open Questions

1. **Caching strategy** - Should Lens have built-in cache? Or rely on React Query patterns?
2. **Subscription lifecycle** - How to handle connection drops and replay?
3. **Authentication** - Middleware pattern or config-based?
4. **Error codes** - Standard error format like tRPC?
5. **Batching** - Should Lens batch multiple queries like GraphQL?

---

## Next Steps

1. Create package scaffolding (package.json, tsconfig, etc.)
2. Implement core schema builder
3. Write type inference tests
4. Implement InProcessTransport for testing
5. Create first example application
