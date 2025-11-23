/**
 * Tests for relationship helpers
 */

import { describe, test, expect } from "bun:test";
import { hasMany, belongsTo, hasOne, manyToMany } from "../resource/index";

describe("Relationship Helpers", () => {
	describe("hasMany", () => {
		test("should create hasMany relationship", () => {
			const rel = hasMany("step", { foreignKey: "message_id" });

			expect(rel.type).toBe("hasMany");
			expect(rel.target).toBe("step");
			expect(rel.foreignKey).toBe("message_id");
		});

		test("should create hasMany with orderBy", () => {
			const rel = hasMany("step", {
				foreignKey: "message_id",
				orderBy: { created_at: "asc" },
			});

			expect(rel.orderBy).toEqual({ created_at: "asc" });
		});

		test("should create hasMany with multiple orderBy", () => {
			const rel = hasMany("message", {
				foreignKey: "session_id",
				orderBy: {
					priority: "desc",
					created_at: "asc",
				},
			});

			expect(rel.orderBy).toEqual({
				priority: "desc",
				created_at: "asc",
			});
		});
	});

	describe("belongsTo", () => {
		test("should create belongsTo relationship", () => {
			const rel = belongsTo("session", { foreignKey: "session_id" });

			expect(rel.type).toBe("belongsTo");
			expect(rel.target).toBe("session");
			expect(rel.foreignKey).toBe("session_id");
		});
	});

	describe("hasOne", () => {
		test("should create hasOne relationship", () => {
			const rel = hasOne("profile", { foreignKey: "user_id" });

			expect(rel.type).toBe("hasOne");
			expect(rel.target).toBe("profile");
			expect(rel.foreignKey).toBe("user_id");
		});
	});

	describe("manyToMany", () => {
		test("should create manyToMany relationship", () => {
			const rel = manyToMany("tag", {
				through: "message_tags",
				foreignKey: "message_id",
				targetForeignKey: "tag_id",
			});

			expect(rel.type).toBe("manyToMany");
			expect(rel.target).toBe("tag");
			expect(rel.through).toBe("message_tags");
			expect(rel.foreignKey).toBe("message_id");
			expect(rel.targetForeignKey).toBe("tag_id");
		});
	});

	describe("Type Safety", () => {
		test("hasMany should match HasManyRelationship type", () => {
			const rel = hasMany("step", { foreignKey: "message_id" });

			// TypeScript should infer correct type
			const _typeCheck: typeof rel extends { type: "hasMany" } ? true : false = true;
		});

		test("belongsTo should match BelongsToRelationship type", () => {
			const rel = belongsTo("session", { foreignKey: "session_id" });

			const _typeCheck: typeof rel extends { type: "belongsTo" } ? true : false = true;
		});

		test("hasOne should match HasOneRelationship type", () => {
			const rel = hasOne("profile", { foreignKey: "user_id" });

			const _typeCheck: typeof rel extends { type: "hasOne" } ? true : false = true;
		});

		test("manyToMany should match ManyToManyRelationship type", () => {
			const rel = manyToMany("tag", {
				through: "message_tags",
				foreignKey: "message_id",
				targetForeignKey: "tag_id",
			});

			const _typeCheck: typeof rel extends { type: "manyToMany" } ? true : false = true;
		});
	});
});
