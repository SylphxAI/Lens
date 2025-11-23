/**
 * Tests for Query Planner
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { z } from "zod";
import { defineResource, hasMany, belongsTo, getRegistry } from "../resource/index";
import { QueryPlanner } from "../query/planner";

describe("QueryPlanner", () => {
	beforeEach(() => {
		getRegistry().clear();
	});

	describe("N+1 Detection", () => {
		test("should not detect N+1 for simple query", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
			});

			const result = QueryPlanner.detectN1(User);

			expect(result.detected).toBe(false);
			expect(result.paths).toHaveLength(0);
			expect(result.estimatedQueries).toBe(1);
		});

		test("should detect N+1 for hasMany relationship", () => {
			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			const Message = defineResource({
				name: "message",
				fields: z.object({ id: z.string() }),
				relationships: {
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			const result = QueryPlanner.detectN1(Message, { steps: true });

			expect(result.detected).toBe(true);
			expect(result.paths).toContain("steps");
			expect(result.recommendedStrategy).toBe("BATCH");
		});

		test("should detect N+1 for nested relationships", () => {
			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			defineResource({
				name: "message",
				fields: z.object({ id: z.string(), sessionId: z.string() }),
				relationships: {
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			const Session = defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
				relationships: {
					messages: hasMany("message", { foreignKey: "sessionId" }),
				},
			});

			const result = QueryPlanner.detectN1(Session, {
				messages: {
					include: {
						steps: true,
					},
				},
			});

			expect(result.detected).toBe(true);
			expect(result.paths).toContain("messages");
			expect(result.paths).toContain("messages.steps");
		});

		test("should not detect N+1 for belongsTo", () => {
			defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
			});

			const Message = defineResource({
				name: "message",
				fields: z.object({ id: z.string(), sessionId: z.string() }),
				relationships: {
					session: belongsTo("session", { foreignKey: "sessionId" }),
				},
			});

			const result = QueryPlanner.detectN1(Message, { session: true });

			expect(result.detected).toBe(false);
		});
	});

	describe("Depth Analysis", () => {
		test("should analyze simple query depth", () => {
			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			const Message = defineResource({
				name: "message",
				fields: z.object({ id: z.string() }),
				relationships: {
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			const result = QueryPlanner.analyzeDepth({ steps: true });

			expect(result.maxDepth).toBe(1);
			expect(result.totalIncludes).toBe(1);
			expect(result.isExcessive).toBe(false);
		});

		test("should detect excessive depth", () => {
			defineResource({
				name: "level3",
				fields: z.object({ id: z.string(), level2Id: z.string() }),
			});

			defineResource({
				name: "level2",
				fields: z.object({ id: z.string(), level1Id: z.string() }),
				relationships: {
					level3: hasMany("level3", { foreignKey: "level2Id" }),
				},
			});

			defineResource({
				name: "level1",
				fields: z.object({ id: z.string(), rootId: z.string() }),
				relationships: {
					level2: hasMany("level2", { foreignKey: "level1Id" }),
				},
			});

			const Root = defineResource({
				name: "root",
				fields: z.object({ id: z.string() }),
				relationships: {
					level1: hasMany("level1", { foreignKey: "rootId" }),
				},
			});

			const result = QueryPlanner.analyzeDepth({
				level1: {
					include: {
						level2: {
							include: {
								level3: true,
							},
						},
					},
				},
			});

			expect(result.maxDepth).toBe(3);
			expect(result.totalIncludes).toBe(3);
			expect(result.isExcessive).toBe(false); // 3 is not excessive

			// Test depth 4 (excessive)
			defineResource({
				name: "level4",
				fields: z.object({ id: z.string(), level3Id: z.string() }),
			});

			getRegistry().clear();

			defineResource({
				name: "level4",
				fields: z.object({ id: z.string(), level3Id: z.string() }),
			});

			defineResource({
				name: "level3",
				fields: z.object({ id: z.string(), level2Id: z.string() }),
				relationships: {
					level4: hasMany("level4", { foreignKey: "level3Id" }),
				},
			});

			defineResource({
				name: "level2",
				fields: z.object({ id: z.string(), level1Id: z.string() }),
				relationships: {
					level3: hasMany("level3", { foreignKey: "level2Id" }),
				},
			});

			defineResource({
				name: "level1",
				fields: z.object({ id: z.string(), rootId: z.string() }),
				relationships: {
					level2: hasMany("level2", { foreignKey: "level1Id" }),
				},
			});

			defineResource({
				name: "root",
				fields: z.object({ id: z.string() }),
				relationships: {
					level1: hasMany("level1", { foreignKey: "rootId" }),
				},
			});

			const resultExcessive = QueryPlanner.analyzeDepth({
				level1: {
					include: {
						level2: {
							include: {
								level3: {
									include: {
										level4: true,
									},
								},
							},
						},
					},
				},
			});

			expect(resultExcessive.maxDepth).toBe(4);
			expect(resultExcessive.isExcessive).toBe(true);
		});

		test("should track paths by depth", () => {
			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			defineResource({
				name: "message",
				fields: z.object({ id: z.string(), sessionId: z.string() }),
				relationships: {
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			const Session = defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
				relationships: {
					messages: hasMany("message", { foreignKey: "sessionId" }),
				},
			});

			const result = QueryPlanner.analyzeDepth({
				messages: {
					include: {
						steps: true,
					},
				},
			});

			expect(result.pathsByDepth.get(1)).toContain("messages");
			expect(result.pathsByDepth.get(2)).toContain("messages.steps");
		});
	});

	describe("Strategy Selection", () => {
		test("should select JOIN for belongsTo", () => {
			const strategy = QueryPlanner.selectStrategy("belongsTo", 1, false);
			expect(strategy).toBe("JOIN");
		});

		test("should select JOIN for hasOne", () => {
			const strategy = QueryPlanner.selectStrategy("hasOne", 1, false);
			expect(strategy).toBe("JOIN");
		});

		test("should select BATCH for hasMany", () => {
			const strategy = QueryPlanner.selectStrategy("hasMany", 1, false);
			expect(strategy).toBe("BATCH");
		});

		test("should select BATCH for manyToMany", () => {
			const strategy = QueryPlanner.selectStrategy("manyToMany", 1, false);
			expect(strategy).toBe("BATCH");
		});

		test("should select LAZY for deep nesting", () => {
			const strategy = QueryPlanner.selectStrategy("hasMany", 4, false);
			expect(strategy).toBe("LAZY");
		});

		test("should select BATCH for nested includes", () => {
			const strategy = QueryPlanner.selectStrategy("belongsTo", 1, true);
			expect(strategy).toBe("BATCH");
		});
	});

	describe("Query Plan Creation", () => {
		test("should create plan for simple query", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
			});

			const plan = QueryPlanner.createPlan(User);

			expect(plan.resource).toBe(User);
			expect(plan.n1Detection.detected).toBe(false);
			expect(plan.depthAnalysis.maxDepth).toBe(0);
		});

		test("should create plan with optimizations", () => {
			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			defineResource({
				name: "message",
				fields: z.object({ id: z.string(), sessionId: z.string() }),
				relationships: {
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			const Session = defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
				relationships: {
					messages: hasMany("message", { foreignKey: "sessionId" }),
				},
			});

			const plan = QueryPlanner.createPlan(Session, {
				include: {
					messages: {
						include: {
							steps: true,
						},
					},
				},
			});

			expect(plan.n1Detection.detected).toBe(true);
			expect(plan.strategies.get("messages")).toBe("BATCH");
			expect(plan.strategies.get("messages.steps")).toBe("BATCH");
		});

		test("should group batches by depth", () => {
			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			defineResource({
				name: "tag",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			const Message = defineResource({
				name: "message",
				fields: z.object({ id: z.string() }),
				relationships: {
					steps: hasMany("step", { foreignKey: "messageId" }),
					tags: hasMany("tag", { foreignKey: "messageId" }),
				},
			});

			const plan = QueryPlanner.createPlan(Message, {
				include: {
					steps: true,
					tags: true,
				},
			});

			const depth1Batches = plan.batchGroups.get("depth_1");
			expect(depth1Batches).toContain("steps");
			expect(depth1Batches).toContain("tags");
		});
	});

	describe("Plan Explanation", () => {
		test("should explain simple plan", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			const plan = QueryPlanner.createPlan(User);
			const explanation = QueryPlanner.explain(plan);

			expect(explanation).toContain("Resource: user");
			expect(explanation).toContain("No N+1 queries detected");
		});

		test("should explain plan with N+1", () => {
			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			const Message = defineResource({
				name: "message",
				fields: z.object({ id: z.string() }),
				relationships: {
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			const plan = QueryPlanner.createPlan(Message, {
				include: { steps: true },
			});

			const explanation = QueryPlanner.explain(plan);

			expect(explanation).toContain("N+1 queries detected");
			expect(explanation).toContain("steps");
			expect(explanation).toContain("BATCH");
		});
	});
});
