/**
 * @sylphx/lens-client - Links (Legacy)
 *
 * @deprecated Use the new transport system instead.
 * This module is kept for backward compatibility with existing code.
 *
 * New code should use:
 * - http(), ws(), inProcess() from ./transport
 * - logger(), auth(), retry(), cache() plugins from ./transport
 */

export {
	// Types
	type OperationType,
	type OperationContext,
	type OperationResult,
	type NextLink,
	type LinkFn,
	type Link,
	type TerminalLink,
	type Observable,
	type Observer,
	type Unsubscribable,
	// Functions
	composeLinks,
	createOperationContext,
} from "./types";
