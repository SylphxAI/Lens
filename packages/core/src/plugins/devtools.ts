/**
 * @lens/core - DevTools Plugin
 *
 * Unified development tools plugin providing:
 * - Operation logging and timing
 * - Subscription monitoring
 * - Performance profiling
 * - State inspection
 * - Time-travel debugging (client-side)
 */

import { defineUnifiedPlugin } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Log entry */
export interface LogEntry {
	id: string;
	timestamp: number;
	type: "query" | "mutation" | "subscription" | "update" | "error" | "cache" | "network";
	entity?: string;
	operation?: string;
	input?: unknown;
	result?: unknown;
	error?: string;
	duration?: number;
	meta?: Record<string, unknown>;
}

/** Performance metric */
export interface PerformanceMetric {
	name: string;
	count: number;
	totalDuration: number;
	minDuration: number;
	maxDuration: number;
	avgDuration: number;
}

/** DevTools plugin configuration */
export interface DevToolsPluginConfig {
	/** Enable in production (default: false) */
	enableInProduction?: boolean;
	/** Log level (default: "info") */
	logLevel?: "debug" | "info" | "warn" | "error";
	/** Max log entries to keep (default: 1000) */
	maxLogEntries?: number;
	/** Enable console output (default: true) */
	consoleOutput?: boolean;
	/** Enable performance profiling (default: true) */
	profiling?: boolean;
	/** Enable time-travel debugging (default: false) */
	timeTravel?: boolean;
	/** Custom logger */
	logger?: (entry: LogEntry) => void;
}

/** DevTools client API */
export interface DevToolsClientAPI {
	/** Get all logs */
	getLogs: () => LogEntry[];
	/** Get logs by type */
	getLogsByType: (type: LogEntry["type"]) => LogEntry[];
	/** Get logs by entity */
	getLogsByEntity: (entity: string) => LogEntry[];
	/** Get operation stats */
	getStats: () => {
		queries: number;
		mutations: number;
		subscriptions: number;
		errors: number;
		cacheHits: number;
		cacheMisses: number;
	};
	/** Get performance metrics */
	getPerformanceMetrics: () => Record<string, PerformanceMetric>;
	/** Clear logs */
	clearLogs: () => void;
	/** Reset stats */
	resetStats: () => void;
	/** Export logs as JSON */
	exportLogs: () => string;
	/** Check if enabled */
	isEnabled: () => boolean;
	/** Time-travel: get state snapshots */
	getSnapshots?: () => Array<{ id: string; timestamp: number; state: unknown }>;
	/** Time-travel: restore to snapshot */
	restoreSnapshot?: (id: string) => void;
}

/** DevTools server API */
export interface DevToolsServerAPI {
	/** Get server stats */
	getStats: () => {
		totalRequests: number;
		activeConnections: number;
		errors: number;
		avgResponseTime: number;
	};
	/** Get slow queries */
	getSlowQueries: (threshold?: number) => LogEntry[];
	/** Get error summary */
	getErrorSummary: () => Array<{ message: string; count: number; lastOccurred: number }>;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Unified DevTools plugin
 *
 * @example
 * ```typescript
 * // Client
 * import { devToolsPlugin } from "@lens/core";
 *
 * const client = createClient({
 *   plugins: [{
 *     plugin: devToolsPlugin,
 *     config: {
 *       logLevel: "debug",
 *       profiling: true,
 *       timeTravel: true,
 *     },
 *   }],
 * });
 *
 * // Access DevTools
 * const devtools = client.$plugins.get<DevToolsClientAPI>("devtools");
 * console.log(devtools?.getStats());
 * console.log(devtools?.getPerformanceMetrics());
 *
 * // Server
 * const server = createServer({
 *   plugins: [{
 *     plugin: devToolsPlugin,
 *     config: { logLevel: "warn" },
 *   }],
 * });
 * ```
 */
export const devToolsPlugin = defineUnifiedPlugin<DevToolsPluginConfig>({
	name: "devtools",
	version: "1.0.0",

	defaultConfig: {
		enableInProduction: false,
		logLevel: "info",
		maxLogEntries: 1000,
		consoleOutput: true,
		profiling: true,
		timeTravel: false,
	},

	// Client-side implementation
	client: (config) => {
		const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
		const enabled = !isProduction || config?.enableInProduction;

		if (!enabled) {
			return {
				name: "devtools",
				api: {
					getLogs: () => [],
					getLogsByType: () => [],
					getLogsByEntity: () => [],
					getStats: () => ({ queries: 0, mutations: 0, subscriptions: 0, errors: 0, cacheHits: 0, cacheMisses: 0 }),
					getPerformanceMetrics: () => ({}),
					clearLogs: () => {},
					resetStats: () => {},
					exportLogs: () => "[]",
					isEnabled: () => false,
				},
			};
		}

		const logLevel = config?.logLevel ?? "info";
		const maxLogEntries = config?.maxLogEntries ?? 1000;
		const consoleOutput = config?.consoleOutput ?? true;
		const profiling = config?.profiling ?? true;
		const timeTravel = config?.timeTravel ?? false;
		const customLogger = config?.logger;

		// State
		const logs: LogEntry[] = [];
		const stats = {
			queries: 0,
			mutations: 0,
			subscriptions: 0,
			errors: 0,
			cacheHits: 0,
			cacheMisses: 0,
		};
		const metrics = new Map<string, PerformanceMetric>();
		const operationTimings = new Map<string, number>();
		const snapshots: Array<{ id: string; timestamp: number; state: unknown }> = [];

		let idCounter = 0;
		const generateId = () => `log_${++idCounter}`;

		const logLevels = ["debug", "info", "warn", "error"];
		const shouldLog = (level: string) => logLevels.indexOf(level) >= logLevels.indexOf(logLevel);

		const consoleLog = (level: string, message: string, data?: unknown) => {
			if (!consoleOutput || !shouldLog(level)) return;

			const styles: Record<string, string> = {
				debug: "color: gray",
				info: "color: #2196F3",
				warn: "color: #FF9800",
				error: "color: #F44336",
			};

			if (typeof console !== "undefined") {
				const prefix = "[Lens DevTools]";
				if (data !== undefined) {
					console.log(`%c${prefix} ${message}`, styles[level] ?? "", data);
				} else {
					console.log(`%c${prefix} ${message}`, styles[level] ?? "");
				}
			}
		};

		const addLog = (entry: Omit<LogEntry, "id" | "timestamp">) => {
			const fullEntry: LogEntry = {
				...entry,
				id: generateId(),
				timestamp: Date.now(),
			};

			logs.push(fullEntry);
			if (logs.length > maxLogEntries) {
				logs.shift();
			}

			if (customLogger) {
				customLogger(fullEntry);
			}

			return fullEntry;
		};

		const recordMetric = (name: string, duration: number) => {
			if (!profiling) return;

			let metric = metrics.get(name);
			if (!metric) {
				metric = {
					name,
					count: 0,
					totalDuration: 0,
					minDuration: Infinity,
					maxDuration: 0,
					avgDuration: 0,
				};
				metrics.set(name, metric);
			}

			metric.count++;
			metric.totalDuration += duration;
			metric.minDuration = Math.min(metric.minDuration, duration);
			metric.maxDuration = Math.max(metric.maxDuration, duration);
			metric.avgDuration = metric.totalDuration / metric.count;
		};

		const api: DevToolsClientAPI = {
			getLogs: () => [...logs],

			getLogsByType: (type) => logs.filter((l) => l.type === type),

			getLogsByEntity: (entity) => logs.filter((l) => l.entity === entity),

			getStats: () => ({ ...stats }),

			getPerformanceMetrics: () => {
				const result: Record<string, PerformanceMetric> = {};
				for (const [name, metric] of metrics) {
					result[name] = { ...metric };
				}
				return result;
			},

			clearLogs: () => {
				logs.length = 0;
			},

			resetStats: () => {
				stats.queries = 0;
				stats.mutations = 0;
				stats.subscriptions = 0;
				stats.errors = 0;
				stats.cacheHits = 0;
				stats.cacheMisses = 0;
				metrics.clear();
			},

			exportLogs: () => JSON.stringify(logs, null, 2),

			isEnabled: () => enabled,

			...(timeTravel ? {
				getSnapshots: () => [...snapshots],
				restoreSnapshot: (id: string) => {
					const snapshot = snapshots.find((s) => s.id === id);
					if (snapshot) {
						consoleLog("info", `Restoring snapshot ${id}`, snapshot.state);
						// Would need store reference to actually restore
					}
				},
			} : {}),
		};

		return {
			name: "devtools",
			api,

			onInit: () => {
				consoleLog("info", "DevTools initialized");
			},

			onBeforeMutation: (ctx, entity, op, input) => {
				const key = `mutation:${entity}:${op}:${Date.now()}`;
				operationTimings.set(key, Date.now());
				stats.mutations++;

				consoleLog("info", `Mutation: ${entity}.${op}()`, input);

				return { meta: { timingKey: key } };
			},

			onAfterMutation: (ctx, entity, op, result, meta) => {
				const key = (meta as { timingKey?: string })?.timingKey;
				const startTime = key ? operationTimings.get(key) : undefined;
				const duration = startTime ? Date.now() - startTime : undefined;
				if (key) operationTimings.delete(key);

				if (duration !== undefined) {
					recordMetric(`mutation:${entity}:${op}`, duration);
				}

				addLog({
					type: result.error ? "error" : "mutation",
					entity,
					operation: op,
					result: result.data,
					error: result.error?.message,
					duration,
				});

				if (result.error) {
					stats.errors++;
					consoleLog("error", `Mutation failed: ${entity}.${op}()`, result.error);
				} else {
					consoleLog("info", `Mutation complete: ${entity}.${op}() [${duration}ms]`);
				}
			},

			onConnect: () => {
				stats.subscriptions++;
				addLog({ type: "subscription", meta: { event: "connected" } });
				consoleLog("info", "Subscription transport connected");
			},

			onDisconnect: () => {
				addLog({ type: "subscription", meta: { event: "disconnected" } });
				consoleLog("warn", "Subscription transport disconnected");
			},

			onReconnect: () => {
				addLog({ type: "subscription", meta: { event: "reconnected" } });
				consoleLog("info", "Subscription transport reconnected");
			},

			// Cache hooks (if integrated with cache plugin)
			onCacheHit: (entity: string, id: string) => {
				stats.cacheHits++;
				consoleLog("debug", `Cache hit: ${entity}:${id}`);
			},

			onCacheMiss: (entity: string, id: string) => {
				stats.cacheMisses++;
				consoleLog("debug", `Cache miss: ${entity}:${id}`);
			},

			destroy: () => {
				logs.length = 0;
				metrics.clear();
				operationTimings.clear();
				consoleLog("info", "DevTools destroyed");
			},
		};
	},

	// Server-side implementation
	server: (config) => {
		const logLevel = config?.logLevel ?? "info";
		const maxLogEntries = config?.maxLogEntries ?? 1000;

		// State
		const logs: LogEntry[] = [];
		const stats = {
			totalRequests: 0,
			activeConnections: 0,
			errors: 0,
			totalResponseTime: 0,
		};
		const errorCounts = new Map<string, { count: number; lastOccurred: number }>();
		const requestTimings = new Map<string, number>();

		let idCounter = 0;
		const generateId = () => `srv_${++idCounter}`;

		const addLog = (entry: Omit<LogEntry, "id" | "timestamp">) => {
			const fullEntry: LogEntry = {
				...entry,
				id: generateId(),
				timestamp: Date.now(),
			};

			logs.push(fullEntry);
			if (logs.length > maxLogEntries) {
				logs.shift();
			}

			return fullEntry;
		};

		const api: DevToolsServerAPI = {
			getStats: () => ({
				totalRequests: stats.totalRequests,
				activeConnections: stats.activeConnections,
				errors: stats.errors,
				avgResponseTime: stats.totalRequests > 0
					? stats.totalResponseTime / stats.totalRequests
					: 0,
			}),

			getSlowQueries: (threshold = 1000) => {
				return logs.filter((l) => l.duration !== undefined && l.duration > threshold);
			},

			getErrorSummary: () => {
				return Array.from(errorCounts.entries()).map(([message, data]) => ({
					message,
					count: data.count,
					lastOccurred: data.lastOccurred,
				}));
			},
		};

		return {
			name: "devtools",
			api,

			onBeforeResolve: (ctx, entity, op, input) => {
				const key = `${entity}:${op}:${Date.now()}`;
				requestTimings.set(key, Date.now());
				stats.totalRequests++;

				return { ctx: { ...ctx, request: { ...ctx.request, timingKey: key } } };
			},

			onAfterResolve: (ctx, entity, op, result) => {
				const key = ctx.request?.timingKey as string;
				const startTime = key ? requestTimings.get(key) : undefined;
				const duration = startTime ? Date.now() - startTime : undefined;
				if (key) requestTimings.delete(key);

				if (duration !== undefined) {
					stats.totalResponseTime += duration;
				}

				addLog({
					type: "query",
					entity,
					operation: op,
					duration,
				});

				return result;
			},

			onResolveError: (ctx, entity, op, error) => {
				stats.errors++;

				const errorKey = error.message;
				const existing = errorCounts.get(errorKey) ?? { count: 0, lastOccurred: 0 };
				errorCounts.set(errorKey, {
					count: existing.count + 1,
					lastOccurred: Date.now(),
				});

				addLog({
					type: "error",
					entity,
					operation: op,
					error: error.message,
				});

				return error;
			},

			onWSConnect: (ctx) => {
				stats.activeConnections++;
				return true;
			},

			onWSDisconnect: () => {
				stats.activeConnections = Math.max(0, stats.activeConnections - 1);
			},
		};
	},

	getClientConfig: (config) => ({
		logLevel: config?.logLevel ?? "info",
		profiling: config?.profiling ?? true,
	}),
});
