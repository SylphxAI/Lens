/**
 * @lens/client - Middleware
 *
 * Middleware for Lens client.
 * These work with the OperationContext.
 */

import type { MiddlewareFn, Middleware, OperationContext } from "./create";

// =============================================================================
// Logger Link
// =============================================================================

export interface LoggerOptions {
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
 *     loggerMiddleware({ enabled: process.env.NODE_ENV === "development" }),
 *     websocketLink({ url: "ws://localhost:3000" }),
 *   ],
 * });
 * ```
 */
export function loggerMiddleware(options: LoggerOptions = {}): Middleware {
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

export interface RetryOptions {
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
 *     retryMiddleware({ maxRetries: 3 }),
 *     websocketLink({ url: "ws://localhost:3000" }),
 *   ],
 * });
 * ```
 */
export function retryMiddleware(options: RetryOptions = {}): Middleware {
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

export interface TimingOptions {
	/** Callback when operation completes */
	onTiming?: (ctx: OperationContext, durationMs: number) => void;
	/** Add timing to meta */
	addToMeta?: boolean;
}

/**
 * Timing link for performance monitoring.
 */
export function timingMiddleware(options: TimingOptions = {}): Middleware {
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

export interface ErrorHandlerOptions {
	/** Handle error */
	onError?: (error: unknown, ctx: OperationContext) => void;
	/** Transform error */
	transformError?: (error: unknown, ctx: OperationContext) => unknown;
}

/**
 * Error handler link for centralized error handling.
 */
export function errorHandlerMiddleware(options: ErrorHandlerOptions = {}): Middleware {
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
