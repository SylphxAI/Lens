/**
 * Tests for ResourceRegistry
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { z } from "zod";
import {
	defineResource,
	validateAllResources,
	getResource,
	getAllResources,
	ResourceRegistryError,
	hasMany,
	belongsTo,
	getRegistry,
} from "../resource/index";

describe("ResourceRegistry", () => {
	beforeEach(() => {
		getRegistry().clear();
	});

	describe("Registration", () => {
		test("should register resource", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			const registered = getResource("user");
			expect(registered).toBe(User);
		});

		test("should reject duplicate resource names", () => {
			defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			expect(() => {
				defineResource({
					name: "user",
					fields: z.object({ id: z.string(), email: z.string() }),
				});
			}).toThrow(ResourceRegistryError);
		});

		test("should get all registered resources", () => {
			defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
			});

			const all = getAllResources();
			expect(all).toHaveLength(2);
			expect(all.map((r) => r.name).sort()).toEqual(["session", "user"]);
		});

		test("should check if resource exists", () => {
			defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			const registry = getRegistry();
			expect(registry.has("user")).toBe(true);
			expect(registry.has("nonexistent")).toBe(false);
		});
	});

	describe("Relationship Validation", () => {
		test("should validate valid relationships", () => {
			defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
			});

			defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					sessionId: z.string(),
				}),
				relationships: {
					session: belongsTo("session", { foreignKey: "sessionId" }),
				},
			});

			expect(() => {
				validateAllResources();
			}).not.toThrow();
		});

		test("should detect missing relationship targets", () => {
			defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					sessionId: z.string(),
				}),
				relationships: {
					session: belongsTo("session", { foreignKey: "sessionId" }),
				},
			});

			expect(() => {
				validateAllResources();
			}).toThrow(ResourceRegistryError);
		});

		test("should validate multiple relationships", () => {
			defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
			});

			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					sessionId: z.string(),
				}),
				relationships: {
					session: belongsTo("session", { foreignKey: "sessionId" }),
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			expect(() => {
				validateAllResources();
			}).not.toThrow();
		});
	});

	describe("Relationship Graph", () => {
		test("should build relationship graph", () => {
			defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
			});

			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			const Message = defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					sessionId: z.string(),
				}),
				relationships: {
					session: belongsTo("session", { foreignKey: "sessionId" }),
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			const registry = getRegistry();
			const graph = registry.getRelationshipGraph("message");

			expect(graph.size).toBe(2);
			expect(graph.has("session")).toBe(true);
			expect(graph.has("steps")).toBe(true);
		});

		test("should build nested relationship graph", () => {
			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					sessionId: z.string(),
				}),
				relationships: {
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
				relationships: {
					messages: hasMany("message", { foreignKey: "sessionId" }),
				},
			});

			const registry = getRegistry();
			const graph = registry.getRelationshipGraph("session");

			// Should include: messages, messages.steps
			expect(graph.has("messages")).toBe(true);
			expect(graph.has("messages.steps")).toBe(true);
		});

		test("should respect max depth", () => {
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

			defineResource({
				name: "root",
				fields: z.object({ id: z.string() }),
				relationships: {
					level1: hasMany("level1", { foreignKey: "rootId" }),
				},
			});

			const registry = getRegistry();
			const graphDepth2 = registry.getRelationshipGraph("root", 2);

			expect(graphDepth2.has("level1")).toBe(true);
			expect(graphDepth2.has("level1.level2")).toBe(true);
			expect(graphDepth2.has("level1.level2.level3")).toBe(false); // Beyond depth 2
		});
	});

	describe("Statistics", () => {
		test("should calculate registry statistics", () => {
			defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
			});

			defineResource({
				name: "step",
				fields: z.object({ id: z.string(), messageId: z.string() }),
			});

			defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					sessionId: z.string(),
				}),
				relationships: {
					session: belongsTo("session", { foreignKey: "sessionId" }),
					steps: hasMany("step", { foreignKey: "messageId" }),
				},
			});

			const registry = getRegistry();
			const stats = registry.getStats();

			expect(stats.totalResources).toBe(3);
			expect(stats.totalRelationships).toBe(2);
			expect(stats.relationshipsByType.belongsTo).toBe(1);
			expect(stats.relationshipsByType.hasMany).toBe(1);
		});
	});

	describe("Clear", () => {
		test("should clear all resources", () => {
			defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			defineResource({
				name: "session",
				fields: z.object({ id: z.string() }),
			});

			const registry = getRegistry();
			registry.clear();

			expect(getAllResources()).toHaveLength(0);
			expect(getResource("user")).toBeUndefined();
		});
	});
});
