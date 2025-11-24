/**
 * Tests for DevTools Plugin
 */

import { describe, expect, test } from "bun:test";
import { devToolsPlugin } from "./devtools";

describe("devToolsPlugin", () => {
	describe("client", () => {
		test("creates client instance with API", () => {
			const instance = devToolsPlugin.client!({});

			expect(instance.name).toBe("devtools");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.getLogs).toBe("function");
			expect(typeof instance.api!.getStats).toBe("function");
		});

		test("getLogs returns empty array initially", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as { getLogs: () => unknown[] };

			expect(api.getLogs()).toEqual([]);
		});

		test("getStats returns initial stats", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as {
				getStats: () => {
					queries: number;
					mutations: number;
					subscriptions: number;
					errors: number;
				};
			};

			const stats = api.getStats();
			expect(stats.queries).toBe(0);
			expect(stats.mutations).toBe(0);
			expect(stats.subscriptions).toBe(0);
			expect(stats.errors).toBe(0);
		});

		test("clearLogs clears all logs", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as {
				getLogs: () => unknown[];
				clearLogs: () => void;
			};

			api.clearLogs();
			expect(api.getLogs()).toEqual([]);
		});

		test("resetStats resets all statistics", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as {
				getStats: () => { queries: number };
				resetStats: () => void;
			};

			api.resetStats();
			expect(api.getStats().queries).toBe(0);
		});

		test("isEnabled returns true in non-production", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as { isEnabled: () => boolean };

			expect(api.isEnabled()).toBe(true);
		});

		test("exportLogs returns JSON string", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as { exportLogs: () => string };

			const exported = api.exportLogs();
			expect(typeof exported).toBe("string");
			expect(JSON.parse(exported)).toEqual([]);
		});

		test("getLogsByType filters logs", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as {
				getLogsByType: (type: string) => unknown[];
			};

			expect(api.getLogsByType("error")).toEqual([]);
		});

		test("getLogsByEntity filters logs", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as {
				getLogsByEntity: (entity: string) => unknown[];
			};

			expect(api.getLogsByEntity("User")).toEqual([]);
		});

		test("getPerformanceMetrics returns empty object initially", () => {
			const instance = devToolsPlugin.client!({ profiling: true });
			const api = instance.api as {
				getPerformanceMetrics: () => Record<string, unknown>;
			};

			expect(api.getPerformanceMetrics()).toEqual({});
		});
	});

	describe("server", () => {
		test("creates server instance with API", () => {
			const instance = devToolsPlugin.server!({});

			expect(instance.name).toBe("devtools");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.getStats).toBe("function");
			expect(typeof instance.api!.getSlowQueries).toBe("function");
		});

		test("getStats returns server statistics", () => {
			const instance = devToolsPlugin.server!({});
			const api = instance.api as {
				getStats: () => {
					totalRequests: number;
					activeConnections: number;
					errors: number;
					avgResponseTime: number;
				};
			};

			const stats = api.getStats();
			expect(stats.totalRequests).toBe(0);
			expect(stats.activeConnections).toBe(0);
			expect(stats.errors).toBe(0);
			expect(stats.avgResponseTime).toBe(0);
		});

		test("getSlowQueries returns empty array initially", () => {
			const instance = devToolsPlugin.server!({});
			const api = instance.api as {
				getSlowQueries: (threshold?: number) => unknown[];
			};

			expect(api.getSlowQueries()).toEqual([]);
			expect(api.getSlowQueries(500)).toEqual([]);
		});

		test("getErrorSummary returns empty array initially", () => {
			const instance = devToolsPlugin.server!({});
			const api = instance.api as {
				getErrorSummary: () => Array<{ message: string; count: number }>;
			};

			expect(api.getErrorSummary()).toEqual([]);
		});
	});

	describe("config", () => {
		test("getClientConfig returns sanitized config", () => {
			const config = {
				logLevel: "debug" as const,
				profiling: false,
				enableInProduction: true, // Should not be exposed
			};

			const clientConfig = devToolsPlugin.getClientConfig!(config);

			expect(clientConfig.logLevel).toBe("debug");
			expect(clientConfig.profiling).toBe(false);
		});

		test("uses default config values", () => {
			const clientConfig = devToolsPlugin.getClientConfig!({});

			expect(clientConfig.logLevel).toBe("info");
			expect(clientConfig.profiling).toBe(true);
		});
	});

	describe("hooks", () => {
		test("onConnect increments subscription count", () => {
			const instance = devToolsPlugin.client!({});
			const api = instance.api as { getStats: () => { subscriptions: number } };

			// Simulate connect
			if (instance.onConnect) {
				instance.onConnect({} as never);
			}

			expect(api.getStats().subscriptions).toBe(1);
		});
	});
});
