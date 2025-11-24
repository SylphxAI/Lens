/**
 * @lens/core - Two-Phase Schema Definition Tests
 *
 * Tests for the Drizzle-style API that uses direct entity references.
 */

import { describe, it, expect } from "bun:test";
import { t } from "./types";
import { defineEntity, createSchemaFrom, hasMany, hasOne, belongsTo } from "./define";
import type { InferEntity } from "./infer";

// =============================================================================
// Test: defineEntity
// =============================================================================

describe("defineEntity", () => {
	it("creates an entity definition with name and fields", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
			email: t.string(),
		});

		expect(User.name).toBe("User");
		expect(User.fields.id).toBeDefined();
		expect(User.fields.name).toBeDefined();
		expect(User.fields.email).toBeDefined();
	});

	it("provides .with() method to add relations", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = defineEntity("Post", {
			id: t.id(),
			title: t.string(),
		});

		const UserWithRelations = User.with({
			posts: hasMany(Post),
		});

		expect(UserWithRelations.id).toBeDefined();
		expect(UserWithRelations.name).toBeDefined();
		expect(UserWithRelations.posts).toBeDefined();
		expect(UserWithRelations.posts._type).toBe("hasMany");
	});
});

// =============================================================================
// Test: Relation Helpers
// =============================================================================

describe("Relation helpers", () => {
	const User = defineEntity("User", {
		id: t.id(),
		name: t.string(),
	});

	const Post = defineEntity("Post", {
		id: t.id(),
		title: t.string(),
	});

	const Profile = defineEntity("Profile", {
		id: t.id(),
		bio: t.string(),
	});

	it("hasMany creates a hasMany relation", () => {
		const relation = hasMany(Post);
		expect(relation._type).toBe("hasMany");
		expect(relation.target).toBe("Post");
	});

	it("hasOne creates a hasOne relation", () => {
		const relation = hasOne(Profile);
		expect(relation._type).toBe("hasOne");
		expect(relation.target).toBe("Profile");
	});

	it("belongsTo creates a belongsTo relation", () => {
		const relation = belongsTo(User);
		expect(relation._type).toBe("belongsTo");
		expect(relation.target).toBe("User");
	});

	it("Entity methods also work", () => {
		expect(User.hasMany(Post).target).toBe("Post");
		expect(Post.belongsTo(User).target).toBe("User");
		expect(User.hasOne(Profile).target).toBe("Profile");
	});
});

// =============================================================================
// Test: createSchemaFrom
// =============================================================================

describe("createSchemaFrom", () => {
	it("creates a schema from entity definitions", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = defineEntity("Post", {
			id: t.id(),
			title: t.string(),
		});

		const schema = createSchemaFrom({
			User: User.with({
				posts: hasMany(Post),
			}),
			Post: Post.with({
				author: belongsTo(User),
			}),
		});

		expect(schema.entities.size).toBe(2);
		expect(schema.hasEntity("User")).toBe(true);
		expect(schema.hasEntity("Post")).toBe(true);

		// Check relations
		const userMeta = schema.getEntity("User");
		expect(userMeta?.relations.has("posts")).toBe(true);
		expect(userMeta?.relations.get("posts")?.target).toBe("Post");

		const postMeta = schema.getEntity("Post");
		expect(postMeta?.relations.has("author")).toBe(true);
		expect(postMeta?.relations.get("author")?.target).toBe("User");
	});

	it("validates relations at runtime", () => {
		const User = defineEntity("User", {
			id: t.id(),
		});

		// This should throw because 'InvalidEntity' doesn't exist
		expect(() =>
			createSchemaFrom({
				User: User.with({
					// @ts-expect-error - Testing runtime validation
					invalid: t.hasMany("InvalidEntity"),
				}),
			}),
		).toThrow("does not exist");
	});
});

// =============================================================================
// Test: Type Inference
// =============================================================================

describe("Type inference with defineEntity", () => {
	it("infers entity types correctly", () => {
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
			age: t.int().nullable(),
		});

		const Post = defineEntity("Post", {
			id: t.id(),
			title: t.string(),
			views: t.int(),
		});

		const schema = createSchemaFrom({
			User: User.with({
				posts: hasMany(Post),
			}),
			Post: Post.with({
				author: belongsTo(User),
			}),
		});

		// Type-level test
		type UserType = InferEntity<(typeof schema)["definition"]["User"], (typeof schema)["definition"]>;

		const user: UserType = {
			id: "1",
			name: "John",
			age: 30,
			posts: [{ id: "p1", title: "Hello", views: 100, author: {} as any }],
		};

		expect(user.name).toBe("John");
	});
});

// =============================================================================
// Test: Comparison with String-based API
// =============================================================================

describe("Comparison: String vs Direct Reference", () => {
	it("both APIs produce the same schema", () => {
		// String-based (old way)
		const { createSchema } = require("./create");
		const stringSchema = createSchema({
			User: {
				id: t.id(),
				name: t.string(),
				posts: t.hasMany("Post"),
			},
			Post: {
				id: t.id(),
				title: t.string(),
				author: t.belongsTo("User"),
			},
		});

		// Direct reference (new way)
		const User = defineEntity("User", {
			id: t.id(),
			name: t.string(),
		});

		const Post = defineEntity("Post", {
			id: t.id(),
			title: t.string(),
		});

		const directSchema = createSchemaFrom({
			User: User.with({ posts: hasMany(Post) }),
			Post: Post.with({ author: belongsTo(User) }),
		});

		// Both should have same structure
		expect(stringSchema.entities.size).toBe(directSchema.entities.size);
		expect(stringSchema.getEntity("User")?.relations.get("posts")?.target).toBe(
			directSchema.getEntity("User")?.relations.get("posts")?.target,
		);
	});
});
