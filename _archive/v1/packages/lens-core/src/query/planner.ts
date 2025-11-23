/**
 * Query Planner
 *
 * Analyzes queries to detect N+1 patterns, calculate depth,
 * and select optimal execution strategies.
 *
 * @module @sylphx/lens-core/query/planner
 */

import type { Resource, Include, QueryOptions } from "../resource/types";
import { getRegistry } from "../resource/registry";

/**
 * Query execution strategy
 *
 * - JOIN: Use SQL joins (best for 1:1, simple 1:N)
 * - BATCH: Use DataLoader batching (best for complex 1:N, N:M)
 * - LAZY: Load on-demand (fallback for deep nesting)
 */
export type QueryStrategy = "JOIN" | "BATCH" | "LAZY";

/**
 * N+1 detection result
 */
export interface N1Detection {
	/** Is N+1 query detected */
	detected: boolean;

	/** Relationship paths that would cause N+1 */
	paths: string[];

	/** Estimated queries without optimization */
	estimatedQueries: number;

	/** Recommended strategy */
	recommendedStrategy: QueryStrategy;
}

/**
 * Query depth analysis
 */
export interface DepthAnalysis {
	/** Maximum relationship depth */
	maxDepth: number;

	/** Total number of includes */
	totalIncludes: number;

	/** Paths by depth level */
	pathsByDepth: Map<number, string[]>;

	/** Is depth excessive (>3) */
	isExcessive: boolean;
}

/**
 * Query plan
 *
 * Complete execution plan for a query with optimizations.
 */
export interface QueryPlan {
	/** Root resource */
	resource: Resource;

	/** N+1 detection results */
	n1Detection: N1Detection;

	/** Depth analysis */
	depthAnalysis: DepthAnalysis;

	/** Execution strategy per relationship path */
	strategies: Map<string, QueryStrategy>;

	/** DataLoader batch groups */
	batchGroups: Map<string, string[]>;

	/** Estimated total queries (optimized) */
	estimatedOptimizedQueries: number;
}

/**
 * Query planner
 *
 * Analyzes query structure and generates optimal execution plan.
 */
export class QueryPlanner {
	/**
	 * Analyze query for N+1 patterns
	 *
	 * @param resource - Root resource
	 * @param include - Include options
	 * @returns N+1 detection results
	 */
	static detectN1(resource: Resource, include?: Include<any>): N1Detection {
		if (!include) {
			return {
				detected: false,
				paths: [],
				estimatedQueries: 1,
				recommendedStrategy: "JOIN",
			};
		}

		const paths: string[] = [];
		let estimatedQueries = 1; // Root query

		const traverse = (
			currentResource: Resource,
			currentInclude: Include<any>,
			path: string,
			depth: number,
		) => {
			const registry = getRegistry();

			for (const [relationName, relationConfig] of Object.entries(currentInclude)) {
				if (!relationConfig) continue;

				const relationPath = path ? `${path}.${relationName}` : relationName;
				const relationship = currentResource.definition.relationships?.[relationName];

				if (!relationship) continue;

				const targetResource = registry.get(relationship.target);
				if (!targetResource) continue;

				// Detect N+1: hasMany or manyToMany relationships
				if (relationship.type === "hasMany" || relationship.type === "manyToMany") {
					paths.push(relationPath);
					// Each parent entity would trigger N queries
					estimatedQueries += Math.pow(10, depth); // Assume 10 entities per level
				}

				// Traverse nested includes
				if (typeof relationConfig === "object" && relationConfig.include) {
					traverse(targetResource, relationConfig.include, relationPath, depth + 1);
				}
			}
		};

		traverse(resource, include, "", 1);

		return {
			detected: paths.length > 0,
			paths,
			estimatedQueries,
			recommendedStrategy: paths.length > 0 ? "BATCH" : "JOIN",
		};
	}

	/**
	 * Analyze query depth
	 *
	 * @param include - Include options
	 * @returns Depth analysis
	 */
	static analyzeDepth(include?: Include<any>): DepthAnalysis {
		const pathsByDepth = new Map<number, string[]>();
		let maxDepth = 0;
		let totalIncludes = 0;

		if (!include) {
			return {
				maxDepth: 0,
				totalIncludes: 0,
				pathsByDepth,
				isExcessive: false,
			};
		}

		const traverse = (currentInclude: Include<any>, path: string, depth: number) => {
			for (const [relationName, relationConfig] of Object.entries(currentInclude)) {
				if (!relationConfig) continue;

				totalIncludes++;
				maxDepth = Math.max(maxDepth, depth);

				const relationPath = path ? `${path}.${relationName}` : relationName;

				if (!pathsByDepth.has(depth)) {
					pathsByDepth.set(depth, []);
				}
				pathsByDepth.get(depth)!.push(relationPath);

				// Traverse nested includes
				if (typeof relationConfig === "object" && relationConfig.include) {
					traverse(relationConfig.include, relationPath, depth + 1);
				}
			}
		};

		traverse(include, "", 1);

		return {
			maxDepth,
			totalIncludes,
			pathsByDepth,
			isExcessive: maxDepth > 3,
		};
	}

	/**
	 * Select optimal strategy for a relationship
	 *
	 * @param relationship - Relationship definition
	 * @param depth - Current depth
	 * @param hasNestedIncludes - Whether relationship has nested includes
	 * @returns Recommended strategy
	 */
	static selectStrategy(
		relationshipType: string,
		depth: number,
		hasNestedIncludes: boolean,
	): QueryStrategy {
		// Deep nesting (>3 levels) → LAZY load
		if (depth > 3) {
			return "LAZY";
		}

		// Relationships with nested includes → BATCH (avoid JOIN complexity)
		if (hasNestedIncludes) {
			return "BATCH";
		}

		// Simple 1:1 relationships without nested includes → JOIN
		if (relationshipType === "belongsTo" || relationshipType === "hasOne") {
			return "JOIN";
		}

		// 1:N or N:M without nested includes → BATCH (avoid N+1)
		return "BATCH";
	}

	/**
	 * Create query plan
	 *
	 * Generates complete execution plan with optimizations.
	 *
	 * @param resource - Root resource
	 * @param options - Query options
	 * @returns Query plan
	 */
	static createPlan(resource: Resource, options?: QueryOptions<any, any>): QueryPlan {
		const include = options?.include;
		const n1Detection = this.detectN1(resource, include);
		const depthAnalysis = this.analyzeDepth(include);

		const strategies = new Map<string, QueryStrategy>();
		const batchGroups = new Map<string, string[]>();

		if (include) {
			const registry = getRegistry();

			const traverse = (
				currentResource: Resource,
				currentInclude: Include<any>,
				path: string,
				depth: number,
			) => {
				for (const [relationName, relationConfig] of Object.entries(currentInclude)) {
					if (!relationConfig) continue;

					const relationPath = path ? `${path}.${relationName}` : relationName;
					const relationship = currentResource.definition.relationships?.[relationName];

					if (!relationship) continue;

					const targetResource = registry.get(relationship.target);
					if (!targetResource) continue;

					const hasNestedIncludes =
						typeof relationConfig === "object" && !!relationConfig.include;

					const strategy = this.selectStrategy(
						relationship.type,
						depth,
						hasNestedIncludes,
					);
					strategies.set(relationPath, strategy);

					// Group BATCH strategies by depth for parallel execution
					if (strategy === "BATCH") {
						const batchKey = `depth_${depth}`;
						if (!batchGroups.has(batchKey)) {
							batchGroups.set(batchKey, []);
						}
						batchGroups.get(batchKey)!.push(relationPath);
					}

					// Traverse nested includes
					if (hasNestedIncludes && typeof relationConfig === "object") {
						traverse(targetResource, relationConfig.include!, relationPath, depth + 1);
					}
				}
			};

			traverse(resource, include, "", 1);
		}

		// Calculate optimized query count
		let estimatedOptimizedQueries = 1; // Root query
		for (const [depth, paths] of batchGroups.entries()) {
			// Each batch group = 1 query (DataLoader batches all)
			estimatedOptimizedQueries += paths.length;
		}

		return {
			resource,
			n1Detection,
			depthAnalysis,
			strategies,
			batchGroups,
			estimatedOptimizedQueries,
		};
	}

	/**
	 * Explain query plan
	 *
	 * Generates human-readable explanation of query plan.
	 *
	 * @param plan - Query plan
	 * @returns Explanation string
	 */
	static explain(plan: QueryPlan): string {
		const lines: string[] = [];

		lines.push(`Query Plan for Resource: ${plan.resource.name}`);
		lines.push("");

		// N+1 Detection
		lines.push("N+1 Detection:");
		if (plan.n1Detection.detected) {
			lines.push(`  ⚠️  N+1 queries detected!`);
			lines.push(`  Paths: ${plan.n1Detection.paths.join(", ")}`);
			lines.push(`  Estimated queries (unoptimized): ${plan.n1Detection.estimatedQueries}`);
			lines.push(`  Recommended: ${plan.n1Detection.recommendedStrategy}`);
		} else {
			lines.push(`  ✅ No N+1 queries detected`);
		}
		lines.push("");

		// Depth Analysis
		lines.push("Depth Analysis:");
		lines.push(`  Max depth: ${plan.depthAnalysis.maxDepth}`);
		lines.push(`  Total includes: ${plan.depthAnalysis.totalIncludes}`);
		if (plan.depthAnalysis.isExcessive) {
			lines.push(`  ⚠️  Excessive depth (>3 levels) - performance may be impacted`);
		}
		lines.push("");

		// Strategies
		if (plan.strategies.size > 0) {
			lines.push("Execution Strategies:");
			for (const [path, strategy] of plan.strategies.entries()) {
				const icon =
					strategy === "JOIN" ? "🔗" : strategy === "BATCH" ? "📦" : "⏳";
				lines.push(`  ${icon} ${path}: ${strategy}`);
			}
			lines.push("");
		}

		// Batch Groups
		if (plan.batchGroups.size > 0) {
			lines.push("Batch Groups (Parallel Execution):");
			for (const [depth, paths] of plan.batchGroups.entries()) {
				lines.push(`  ${depth}: [${paths.join(", ")}]`);
			}
			lines.push("");
		}

		// Summary
		lines.push("Summary:");
		lines.push(`  Estimated queries (optimized): ${plan.estimatedOptimizedQueries}`);
		if (plan.n1Detection.detected) {
			const savings =
				((plan.n1Detection.estimatedQueries - plan.estimatedOptimizedQueries) /
					plan.n1Detection.estimatedQueries) *
				100;
			lines.push(
				`  Query reduction: ${Math.round(savings)}% (${plan.n1Detection.estimatedQueries} → ${plan.estimatedOptimizedQueries})`,
			);
		}

		return lines.join("\n");
	}
}
