/**
 * Performance Monitoring
 *
 * Utilities for tracking and analyzing performance metrics.
 * Helps identify bottlenecks and optimize query patterns.
 *
 * @module @sylphx/lens-core/performance
 */

/**
 * Performance metric
 */
export interface PerformanceMetric {
	/** Operation name */
	operation: string;
	/** Resource name */
	resource?: string;
	/** Start time (ms) */
	startTime: number;
	/** End time (ms) */
	endTime?: number;
	/** Duration (ms) */
	duration?: number;
	/** Success status */
	success?: boolean;
	/** Error if failed */
	error?: Error;
	/** Additional metadata */
	meta?: Record<string, any>;
}

/**
 * Performance monitor
 *
 * Tracks and aggregates performance metrics for operations.
 */
export class PerformanceMonitor {
	private metrics: PerformanceMetric[] = [];
	private activeOperations: Map<string, PerformanceMetric> = new Map();
	private enabled: boolean = true;

	/**
	 * Enable/disable monitoring
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	/**
	 * Check if monitoring is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Start tracking an operation
	 *
	 * @param operation - Operation name
	 * @param meta - Additional metadata
	 * @returns Operation ID for ending the operation
	 */
	start(operation: string, meta?: Record<string, any>): string {
		if (!this.enabled) return "";

		const id = `${operation}:${Date.now()}:${Math.random()}`;
		const metric: PerformanceMetric = {
			operation,
			startTime: performance.now(),
			meta,
		};

		this.activeOperations.set(id, metric);
		return id;
	}

	/**
	 * End tracking an operation
	 *
	 * @param id - Operation ID from start()
	 * @param success - Whether operation succeeded
	 * @param error - Error if operation failed
	 */
	end(id: string, success: boolean = true, error?: Error): void {
		if (!this.enabled || !id) return;

		const metric = this.activeOperations.get(id);
		if (!metric) return;

		metric.endTime = performance.now();
		metric.duration = metric.endTime - metric.startTime;
		metric.success = success;
		metric.error = error;

		this.metrics.push(metric);
		this.activeOperations.delete(id);
	}

	/**
	 * Measure an async operation
	 *
	 * @param operation - Operation name
	 * @param fn - Async function to measure
	 * @param meta - Additional metadata
	 * @returns Result of the function
	 */
	async measure<T>(
		operation: string,
		fn: () => Promise<T>,
		meta?: Record<string, any>,
	): Promise<T> {
		if (!this.enabled) return fn();

		const id = this.start(operation, meta);
		try {
			const result = await fn();
			this.end(id, true);
			return result;
		} catch (error) {
			this.end(id, false, error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Get all metrics
	 */
	getMetrics(): PerformanceMetric[] {
		return [...this.metrics];
	}

	/**
	 * Get metrics for specific operation
	 */
	getMetricsFor(operation: string): PerformanceMetric[] {
		return this.metrics.filter((m) => m.operation === operation);
	}

	/**
	 * Get metrics for specific resource
	 */
	getMetricsForResource(resource: string): PerformanceMetric[] {
		return this.metrics.filter((m) => m.meta?.resource === resource);
	}

	/**
	 * Get summary statistics
	 */
	getSummary(operation?: string): PerformanceSummary {
		const metrics = operation ? this.getMetricsFor(operation) : this.metrics;

		if (metrics.length === 0) {
			return {
				count: 0,
				successRate: 0,
				avgDuration: 0,
				minDuration: 0,
				maxDuration: 0,
				p50: 0,
				p95: 0,
				p99: 0,
			};
		}

		const durations = metrics
			.filter((m) => m.duration !== undefined)
			.map((m) => m.duration!)
			.sort((a, b) => a - b);

		const successCount = metrics.filter((m) => m.success).length;

		return {
			count: metrics.length,
			successRate: successCount / metrics.length,
			avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
			minDuration: durations[0] || 0,
			maxDuration: durations[durations.length - 1] || 0,
			p50: this.percentile(durations, 0.5),
			p95: this.percentile(durations, 0.95),
			p99: this.percentile(durations, 0.99),
		};
	}

	/**
	 * Calculate percentile
	 */
	private percentile(sorted: number[], p: number): number {
		if (sorted.length === 0) return 0;
		const index = Math.ceil(sorted.length * p) - 1;
		return sorted[Math.max(0, index)];
	}

	/**
	 * Clear all metrics
	 */
	clear(): void {
		this.metrics = [];
		this.activeOperations.clear();
	}

	/**
	 * Get report of slow operations (> threshold ms)
	 */
	getSlowOperations(thresholdMs: number = 100): PerformanceMetric[] {
		return this.metrics.filter((m) => m.duration && m.duration > thresholdMs);
	}

	/**
	 * Get report of failed operations
	 */
	getFailedOperations(): PerformanceMetric[] {
		return this.metrics.filter((m) => !m.success);
	}
}

/**
 * Performance summary statistics
 */
export interface PerformanceSummary {
	/** Total operation count */
	count: number;
	/** Success rate (0-1) */
	successRate: number;
	/** Average duration (ms) */
	avgDuration: number;
	/** Minimum duration (ms) */
	minDuration: number;
	/** Maximum duration (ms) */
	maxDuration: number;
	/** 50th percentile (median) */
	p50: number;
	/** 95th percentile */
	p95: number;
	/** 99th percentile */
	p99: number;
}

/**
 * Global performance monitor instance
 */
let globalMonitor: PerformanceMonitor | null = null;

/**
 * Get global performance monitor
 *
 * Creates one if it doesn't exist.
 */
export function getPerformanceMonitor(): PerformanceMonitor {
	if (!globalMonitor) {
		globalMonitor = new PerformanceMonitor();
	}
	return globalMonitor;
}

/**
 * Set global performance monitor
 *
 * Useful for providing custom monitor instance.
 */
export function setPerformanceMonitor(monitor: PerformanceMonitor): void {
	globalMonitor = monitor;
}

/**
 * Decorator for measuring method performance
 *
 * @example
 * ```ts
 * class MyClass {
 *   @measure("myMethod")
 *   async myMethod() {
 *     // ...
 *   }
 * }
 * ```
 */
export function measure(operation: string) {
	return function (
		target: any,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	) {
		const originalMethod = descriptor.value;

		descriptor.value = async function (...args: any[]) {
			const monitor = getPerformanceMonitor();
			const id = monitor.start(operation, {
				class: target.constructor.name,
				method: propertyKey,
			});

			try {
				const result = await originalMethod.apply(this, args);
				monitor.end(id, true);
				return result;
			} catch (error) {
				monitor.end(id, false, error instanceof Error ? error : new Error(String(error)));
				throw error;
			}
		};

		return descriptor;
	};
}
