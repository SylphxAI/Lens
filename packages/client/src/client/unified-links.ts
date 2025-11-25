/**
 * @lens/client - Unified Links
 *
 * Middleware links for unified client.
 * These work with the UnifiedOperationContext.
 */

import type { UnifiedLinkFn, UnifiedLink, UnifiedOperationContext } from "./unified";

// =============================================================================
// Logger Link
// =============================================================================

export interface UnifiedLoggerOptions {
	/** Enable/disable logging (default: true) */
	enabled?: boolean;
	/** Log prefix */
	prefix?: string;
	/** Custom logger */
	logger?: {
		log: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
	/** Log request details */
	logRequest?: boolean;
	/** Log response details */
	logResponse?: boolean;
}

/**
 * Logger link for debugging and devtools.
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   queries,
 *   mutations,
 *   links: [
 *     unifiedLoggerLink({ enabled: process.env.NODE_ENV === "development" }),
 *     websocketLink({ url: "ws://localhost:3000" }),
 *   ],
 * });
 * ```
 */
export function unifiedLoggerLink(options: UnifiedLoggerOptions = {}): UnifiedLink {
	const {
		enabled = true,
		prefix = "[Lens]",
		logger = console,
		logRequest = true,
		logResponse = true,
	} = options;

	return () => async (ctx, next) => {
		if (!enabled) {
			return next(ctx);
		}

		const startTime = Date.now();
		const requestId = ctx.id.slice(-8);

		if (logRequest) {
			logger.log(
				`${prefix} → ${ctx.type.toUpperCase()} ${ctx.operation}`,
				ctx.input !== undefined ? ctx.input : "",
				ctx.select ? `select: ${JSON.stringify(ctx.select)}` : "",
				`[${requestId}]`,
			);
		}

		try {
			const result = await next(ctx);
			const duration = Date.now() - startTime;

			if (logResponse) {
				logger.log(
					`${prefix} ← ${ctx.type.toUpperCase()} ${ctx.operation}`,
					`${duration}ms`,
					result,
					`[${requestId}]`,
				);
			}

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error(
				`${prefix} ✗ ${ctx.type.toUpperCase()} ${ctx.operation}`,
				`${duration}ms`,
				error,
				`[${requestId}]`,
			);
			throw error;
		}
	};
}

// =============================================================================
// Retry Link
// =============================================================================

export interface UnifiedRetryOptions {
	/** Maximum number of retries (default: 3) */
	maxRetries?: number;
	/** Base delay between retries in ms (default: 1000) */
	baseDelay?: number;
	/** Use exponential backoff (default: true) */
	exponentialBackoff?: boolean;
	/** Only retry these operation types (default: ["query"]) */
	retryOn?: ("query" | "mutation")[];
	/** Custom retry condition */
	shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Retry link for automatic retries on failure.
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   queries,
 *   mutations,
 *   links: [
 *     unifiedRetryLink({ maxRetries: 3 }),
 *     websocketLink({ url: "ws://localhost:3000" }),
 *   ],
 * });
 * ```
 */
export function unifiedRetryLink(options: UnifiedRetryOptions = {}): UnifiedLink {
	const {
		maxRetries = 3,
		baseDelay = 1000,
		exponentialBackoff = true,
		retryOn = ["query"],
		shouldRetry = () => true,
	} = options;

	return () => async (ctx, next) => {
		// Only retry specified operation types
		if (!retryOn.includes(ctx.type as "query" | "mutation")) {
			return next(ctx);
		}

		let lastError: unknown;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await next(ctx);
			} catch (error) {
				lastError = error;

				// Check if we should retry
				if (attempt < maxRetries && shouldRetry(error, attempt)) {
					const delay = exponentialBackoff
						? baseDelay * Math.pow(2, attempt)
						: baseDelay;
					await new Promise((resolve) => setTimeout(resolve, delay));
					continue;
				}

				throw error;
			}
		}

		throw lastError;
	};
}

// =============================================================================
// Timing Link
// =============================================================================

export interface UnifiedTimingOptions {
	/** Callback when operation completes */
	onTiming?: (ctx: UnifiedOperationContext, durationMs: number) => void;
	/** Add timing to meta */
	addToMeta?: boolean;
}

/**
 * Timing link for performance monitoring.
 */
export function unifiedTimingLink(options: UnifiedTimingOptions = {}): UnifiedLink {
	const { onTiming, addToMeta = true } = options;

	return () => async (ctx, next) => {
		const startTime = performance.now();

		try {
			const result = await next(ctx);
			const duration = performance.now() - startTime;

			if (addToMeta) {
				ctx.meta.duration = duration;
			}

			if (onTiming) {
				onTiming(ctx, duration);
			}

			return result;
		} catch (error) {
			const duration = performance.now() - startTime;

			if (addToMeta) {
				ctx.meta.duration = duration;
			}

			if (onTiming) {
				onTiming(ctx, duration);
			}

			throw error;
		}
	};
}

// =============================================================================
// Error Handler Link
// =============================================================================

export interface UnifiedErrorHandlerOptions {
	/** Handle error */
	onError?: (error: unknown, ctx: UnifiedOperationContext) => void;
	/** Transform error */
	transformError?: (error: unknown, ctx: UnifiedOperationContext) => unknown;
}

/**
 * Error handler link for centralized error handling.
 */
export function unifiedErrorHandlerLink(options: UnifiedErrorHandlerOptions = {}): UnifiedLink {
	const { onError, transformError } = options;

	return () => async (ctx, next) => {
		try {
			return await next(ctx);
		} catch (error) {
			if (onError) {
				onError(error, ctx);
			}

			if (transformError) {
				throw transformError(error, ctx);
			}

			throw error;
		}
	};
}
