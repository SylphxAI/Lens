# React Client Example

Demonstrates Lens React hooks with HTTP and WebSocket transports.

## Features

- **useQuery**: Fetch user data with loading states and refetch
- **useMutation**: Update user status with callbacks
- **useSubscription**: Real-time user updates via WebSocket

## Setup

```bash
# Install dependencies
bun install

# Start the full-stack server (in examples/full-stack)
cd ../full-stack
bun run dev

# In another terminal, start this client
cd ../react-client
bun run dev
```

Open http://localhost:3001

## Components

- `UserProfile`: Demonstrates useQuery with refetch button
- `UserStatusUpdater`: Demonstrates useMutation with status buttons
- `UserSubscription`: Demonstrates useSubscription with real-time updates

When you click "Set Online/Away/Offline" in the mutation example, the subscription component will receive the update in real-time.
