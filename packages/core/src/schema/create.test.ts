/**
 * Tests for Schema Creation
 */

import { describe, expect, test } from "bun:test";
import { createSchema, Schema, SchemaValidationError } from "./create";
import { t } from "./types";

describe("createSchema", () => {
	test("creates schema from valid definition", () => {
		const schema = createSchema({
			User: {
				id: t.id(),
				name: t.string(),
				email: t.string(),
			},
		});

		expect(schema).toBeInstanceOf(Schema);
		expect(schema.getEntityNames()).toEqual(["User"]);
	});

	test("handles relations correctly", () => {
		const schema = createSchema({
			User: {
				id: t.id(),
				name: t.string(),
				posts: t.hasMany("Post"),
				profile: t.hasOne("Profile"),
			},
			Post: {
				id: t.id(),
				title: t.string(),
				author: t.belongsTo("User"),
			},
			Profile: {
				id: t.id(),
				bio: t.string(),
				user: t.belongsTo("User"),
			},
		});

		expect(schema.getEntityNames()).toContain("User");
		expect(schema.getEntityNames()).toContain("Post");
		expect(schema.getEntityNames()).toContain("Profile");

		const userMeta = schema.getEntity("User");
		expect(userMeta?.relations.size).toBe(2);
		expect(userMeta?.relations.get("posts")?.target).toBe("Post");
		expect(userMeta?.relations.get("profile")?.target).toBe("Profile");
	});

	test("throws on invalid relation target", () => {
		expect(() => {
			createSchema({
				User: {
					id: t.id(),
					posts: t.hasMany("NonExistent"),
				},
			});
		}).toThrow(SchemaValidationError);
	});

	test("builds relation graph correctly", () => {
		const schema = createSchema({
			User: {
				id: t.id(),
				posts: t.hasMany("Post"),
			},
			Post: {
				id: t.id(),
				author: t.belongsTo("User"),
				comments: t.hasMany("Comment"),
			},
			Comment: {
				id: t.id(),
				post: t.belongsTo("Post"),
			},
		});

		expect(schema.relationGraph.get("User")?.has("Post")).toBe(true);
		expect(schema.relationGraph.get("Post")?.has("User")).toBe(true);
		expect(schema.relationGraph.get("Post")?.has("Comment")).toBe(true);
	});
});

describe("Schema instance methods", () => {
	const schema = createSchema({
		User: {
			id: t.id(),
			name: t.string(),
			email: t.string().nullable(),
			age: t.int().default(0),
			posts: t.hasMany("Post"),
		},
		Post: {
			id: t.id(),
			title: t.string(),
			content: t.string(),
			author: t.belongsTo("User"),
		},
	});

	test("getEntity() returns entity metadata", () => {
		const userMeta = schema.getEntity("User");
		expect(userMeta).toBeDefined();
		expect(userMeta?.name).toBe("User");
		expect(userMeta?.fields.size).toBe(5);
		expect(userMeta?.primaryKey).toBe("id");
	});

	test("hasEntity() checks entity existence", () => {
		expect(schema.hasEntity("User")).toBe(true);
		expect(schema.hasEntity("Post")).toBe(true);
		expect(schema.hasEntity("NonExistent")).toBe(false);
	});

	test("getField() returns field definition", () => {
		const nameField = schema.getField("User", "name");
		expect(nameField?._type).toBe("string");

		const postsField = schema.getField("User", "posts");
		expect(postsField?._type).toBe("hasMany");
	});

	test("getRelation() returns relation metadata", () => {
		const postsRelation = schema.getRelation("User", "posts");
		expect(postsRelation?.kind).toBe("hasMany");
		expect(postsRelation?.target).toBe("Post");

		const authorRelation = schema.getRelation("Post", "author");
		expect(authorRelation?.kind).toBe("belongsTo");
		expect(authorRelation?.target).toBe("User");
	});

	test("getRelatedEntities() finds entities with relations to target", () => {
		const relatedToPost = schema.getRelatedEntities("Post");
		expect(relatedToPost).toContain("User");

		const relatedToUser = schema.getRelatedEntities("User");
		expect(relatedToUser).toContain("Post");
	});
});

describe("Schema type inference", () => {
	test("definition is preserved for type inference", () => {
		const schema = createSchema({
			User: {
				id: t.id(),
				name: t.string(),
			},
		});

		// Runtime check that definition is accessible
		expect(schema.definition.User).toBeDefined();
		expect(schema.definition.User.id._type).toBe("id");
		expect(schema.definition.User.name._type).toBe("string");
	});
});
