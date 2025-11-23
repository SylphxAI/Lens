/**
 * @sylphx/lens-server
 *
 * Server runtime for Lens - Type-safe, real-time API framework
 */

// Server
export { createLensServer } from "./server.js";
export type { LensServer, LensServerConfig } from "./server.js";

// Subscription
export type {
	PubSubAdapter,
	PubSubEvent,
} from "./subscription/pubsub.js";

export { InMemoryPubSub } from "./subscription/pubsub.js";

export type {
	AutoSubscribeConfig,
} from "./subscription/auto-subscribe.js";

export {
	createAutoSubscription,
	autoPublishMutation,
} from "./subscription/auto-subscribe.js";

export type { ChannelNamingStrategy } from "./subscription/channel.js";

export {
	defaultChannelNaming,
	simpleChannelNaming,
	idBasedChannelNaming,
} from "./subscription/channel.js";

// Utilities
export { applyFieldSelection } from "./utils/field-selection.js";
