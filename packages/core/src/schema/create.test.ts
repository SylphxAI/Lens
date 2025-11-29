/**
 * @sylphx/lens-core - Schema Creation Tests
 *
 * Tests for the Schema class and validation.
 */

import { describe, expect, it } from "bun:test";
import { Schema, SchemaValidationError } from "./create";
import { t } from "./types";

// =============================================================================
// Test: Schema Class - Entity Metadata
// =============================================================================

describe("Schema", () => {
	it("builds entity metadata from definition", () => {
		const schema = new Schema({
			User: {
				id: t.id(),
				name: t.string(),
				email: t.string(),
			},
		});

		expect(schema.entities.size).toBe(1);
		const userMeta = schema.entities.get("User");
		expect(userMeta).toBeDefined();
		expect(userMeta?.name).toBe("User");
		expect(userMeta?.primaryKey).toBe("id");
		expect(userMeta?.fields.size).toBe(3);
	});

	it("tracks custom primary key", () => {
		const schema = new Schema({
			Post: {
				postId: t.id(),
				title: t.string(),
			},
		});

		const postMeta = schema.entities.get("Post");
		expect(postMeta?.primaryKey).toBe("postId");
	});

	it("builds relation metadata", () => {
		const schema = new Schema({
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

		const userMeta = schema.entities.get("User");
		expect(userMeta?.relations.size).toBe(1);

		const postsRelation = userMeta?.relations.get("posts");
		expect(postsRelation).toBeDefined();
		expect(postsRelation?.kind).toBe("hasMany");
		expect(postsRelation?.target).toBe("Post");

		const postMeta = schema.entities.get("Post");
		const authorRelation = postMeta?.relations.get("author");
		expect(authorRelation).toBeDefined();
		expect(authorRelation?.kind).toBe("belongsTo");
		expect(authorRelation?.target).toBe("User");
	});

	it("builds relation graph", () => {
		const schema = new Schema({
			User: {
				id: t.id(),
				posts: t.hasMany("Post"),
				profile: t.hasOne("Profile"),
			},
			Post: {
				id: t.id(),
				author: t.belongsTo("User"),
			},
			Profile: {
				id: t.id(),
				userId: t.string(),
			},
		});

		const userTargets = schema.relationGraph.get("User");
		expect(userTargets).toBeDefined();
		expect(userTargets?.has("Post")).toBe(true);
		expect(userTargets?.has("Profile")).toBe(true);
		expect(userTargets?.size).toBe(2);

		const postTargets = schema.relationGraph.get("Post");
		expect(postTargets?.has("User")).toBe(true);
		expect(postTargets?.size).toBe(1);
	});
});

// =============================================================================
// Test: Schema Validation
// =============================================================================

describe("Schema Validation", () => {
	it("throws SchemaValidationError for invalid relation target", () => {
		expect(() => {
			new Schema({
				User: {
					id: t.id(),
					posts: t.hasMany("Post"), // Post doesn't exist
				},
			});
		}).toThrow(SchemaValidationError);
	});

	it("includes all validation errors in SchemaValidationError", () => {
		try {
			new Schema({
				User: {
					id: t.id(),
					posts: t.hasMany("Post"),
					comments: t.hasMany("Comment"),
				},
				Article: {
					id: t.id(),
					author: t.belongsTo("Writer"), // Writer doesn't exist
				},
			});
			expect(true).toBe(false); // Should not reach here
		} catch (error) {
			expect(error).toBeInstanceOf(SchemaValidationError);
			const validationError = error as SchemaValidationError;
			expect(validationError.errors.length).toBe(3);
			expect(validationError.errors).toContain('User.posts: Target entity "Post" does not exist');
			expect(validationError.errors).toContain('User.comments: Target entity "Comment" does not exist');
			expect(validationError.errors).toContain('Article.author: Target entity "Writer" does not exist');
		}
	});

	it("validates hasOne relations", () => {
		expect(() => {
			new Schema({
				User: {
					id: t.id(),
					profile: t.hasOne("Profile"), // Profile doesn't exist
				},
			});
		}).toThrow(SchemaValidationError);
	});

	it("validates belongsTo relations", () => {
		expect(() => {
			new Schema({
				Post: {
					id: t.id(),
					author: t.belongsTo("User"), // User doesn't exist
				},
			});
		}).toThrow(SchemaValidationError);
	});

	it("passes validation when all relations are valid", () => {
		expect(() => {
			new Schema({
				User: {
					id: t.id(),
					posts: t.hasMany("Post"),
				},
				Post: {
					id: t.id(),
					author: t.belongsTo("User"),
				},
			});
		}).not.toThrow();
	});
});

// =============================================================================
// Test: Schema Query Methods
// =============================================================================

describe("Schema Query Methods", () => {
	describe("getEntity", () => {
		it("returns entity metadata by name", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
					name: t.string(),
				},
			});

			const userMeta = schema.getEntity("User");
			expect(userMeta).toBeDefined();
			expect(userMeta?.name).toBe("User");
		});

		it("returns undefined for non-existent entity", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
			});

			expect(schema.getEntity("Post" as any)).toBeUndefined();
		});
	});

	describe("getEntityNames", () => {
		it("returns all entity names", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
				Post: {
					id: t.id(),
				},
				Comment: {
					id: t.id(),
				},
			});

			const names = schema.getEntityNames();
			expect(names).toContain("User");
			expect(names).toContain("Post");
			expect(names).toContain("Comment");
			expect(names.length).toBe(3);
		});

		it("returns empty array for empty schema", () => {
			const schema = new Schema({});
			const names = schema.getEntityNames();
			expect(names).toEqual([]);
		});
	});

	describe("hasEntity", () => {
		it("returns true for existing entity", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
			});

			expect(schema.hasEntity("User")).toBe(true);
		});

		it("returns false for non-existent entity", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
			});

			expect(schema.hasEntity("Post")).toBe(false);
		});
	});

	describe("getField", () => {
		it("returns field metadata for existing field", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
					name: t.string(),
					age: t.int(),
				},
			});

			const nameField = schema.getField("User", "name");
			expect(nameField).toBeDefined();
			expect(nameField?._type).toBe("string");

			const ageField = schema.getField("User", "age");
			expect(ageField).toBeDefined();
			expect(ageField?._type).toBe("int");
		});

		it("returns undefined for non-existent field", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
			});

			expect(schema.getField("User", "nonExistent")).toBeUndefined();
		});

		it("returns undefined for non-existent entity", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
			});

			expect(schema.getField("Post", "title")).toBeUndefined();
		});
	});

	describe("getRelation", () => {
		it("returns relation metadata for existing relation", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
					posts: t.hasMany("Post"),
					profile: t.hasOne("Profile"),
				},
				Post: {
					id: t.id(),
					author: t.belongsTo("User"),
				},
				Profile: {
					id: t.id(),
				},
			});

			const postsRelation = schema.getRelation("User", "posts");
			expect(postsRelation).toBeDefined();
			expect(postsRelation?.kind).toBe("hasMany");
			expect(postsRelation?.target).toBe("Post");

			const profileRelation = schema.getRelation("User", "profile");
			expect(profileRelation).toBeDefined();
			expect(profileRelation?.kind).toBe("hasOne");
			expect(profileRelation?.target).toBe("Profile");

			const authorRelation = schema.getRelation("Post", "author");
			expect(authorRelation).toBeDefined();
			expect(authorRelation?.kind).toBe("belongsTo");
			expect(authorRelation?.target).toBe("User");
		});

		it("returns undefined for non-relation field", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
					name: t.string(),
				},
			});

			expect(schema.getRelation("User", "name")).toBeUndefined();
		});

		it("returns undefined for non-existent field", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
			});

			expect(schema.getRelation("User", "nonExistent")).toBeUndefined();
		});

		it("returns undefined for non-existent entity", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
			});

			expect(schema.getRelation("Post", "author")).toBeUndefined();
		});
	});

	describe("getRelatedEntities", () => {
		it("returns entities that have relations to target entity", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
					posts: t.hasMany("Post"),
					profile: t.hasOne("Profile"),
				},
				Comment: {
					id: t.id(),
					post: t.belongsTo("Post"),
				},
				Post: {
					id: t.id(),
					author: t.belongsTo("User"),
				},
				Profile: {
					id: t.id(),
				},
			});

			const relatedToPost = schema.getRelatedEntities("Post");
			expect(relatedToPost).toContain("User");
			expect(relatedToPost).toContain("Comment");
			expect(relatedToPost.length).toBe(2);

			const relatedToUser = schema.getRelatedEntities("User");
			expect(relatedToUser).toContain("Post");
			expect(relatedToUser.length).toBe(1);

			const relatedToProfile = schema.getRelatedEntities("Profile");
			expect(relatedToProfile).toContain("User");
			expect(relatedToProfile.length).toBe(1);
		});

		it("returns empty array when no entities relate to target", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
				Post: {
					id: t.id(),
				},
			});

			const related = schema.getRelatedEntities("User");
			expect(related).toEqual([]);
		});

		it("returns empty array for non-existent entity", () => {
			const schema = new Schema({
				User: {
					id: t.id(),
				},
			});

			const related = schema.getRelatedEntities("NonExistent");
			expect(related).toEqual([]);
		});
	});
});

// =============================================================================
// Test: Complex Schema Scenarios
// =============================================================================

describe("Complex Schema Scenarios", () => {
	it("handles multiple entity types with various relations", () => {
		const schema = new Schema({
			User: {
				id: t.id(),
				name: t.string(),
				email: t.string(),
				posts: t.hasMany("Post"),
				profile: t.hasOne("Profile"),
				comments: t.hasMany("Comment"),
			},
			Post: {
				id: t.id(),
				title: t.string(),
				content: t.string(),
				author: t.belongsTo("User"),
				comments: t.hasMany("Comment"),
				tags: t.hasMany("Tag"),
			},
			Comment: {
				id: t.id(),
				text: t.string(),
				author: t.belongsTo("User"),
				post: t.belongsTo("Post"),
			},
			Profile: {
				id: t.id(),
				bio: t.string().nullable(),
				avatar: t.string().optional(),
			},
			Tag: {
				id: t.id(),
				name: t.string(),
			},
		});

		expect(schema.entities.size).toBe(5);
		expect(schema.getEntityNames().length).toBe(5);

		// Verify User relations
		const userMeta = schema.getEntity("User");
		expect(userMeta?.relations.size).toBe(3);
		expect(schema.getRelation("User", "posts")?.target).toBe("Post");
		expect(schema.getRelation("User", "profile")?.target).toBe("Profile");
		expect(schema.getRelation("User", "comments")?.target).toBe("Comment");

		// Verify Post relations
		const postMeta = schema.getEntity("Post");
		expect(postMeta?.relations.size).toBe(3);

		// Verify relation graph
		const relatedToPost = schema.getRelatedEntities("Post");
		expect(relatedToPost).toContain("User");
		expect(relatedToPost).toContain("Comment");

		const relatedToUser = schema.getRelatedEntities("User");
		expect(relatedToUser).toContain("Post");
		expect(relatedToUser).toContain("Comment");
	});

	it("handles schema with nullable and optional fields", () => {
		const schema = new Schema({
			User: {
				id: t.id(),
				name: t.string(),
				bio: t.string().nullable(),
				nickname: t.string().optional(),
				age: t.int().nullable().optional(),
			},
		});

		const bioField = schema.getField("User", "bio");
		expect(bioField?._nullable).toBe(true);

		const nicknameField = schema.getField("User", "nickname");
		expect(nicknameField?._optional).toBe(true);

		const ageField = schema.getField("User", "age");
		expect(ageField?._nullable).toBe(true);
		expect(ageField?._optional).toBe(true);
	});

	it("handles self-referential relations", () => {
		const schema = new Schema({
			User: {
				id: t.id(),
				name: t.string(),
				followers: t.hasMany("User"),
				following: t.hasMany("User"),
			},
		});

		const followersRelation = schema.getRelation("User", "followers");
		expect(followersRelation?.target).toBe("User");

		const followingRelation = schema.getRelation("User", "following");
		expect(followingRelation?.target).toBe("User");

		const relatedToUser = schema.getRelatedEntities("User");
		expect(relatedToUser).toContain("User");
	});
});

// =============================================================================
// Test: Edge Cases
// =============================================================================

describe("Edge Cases", () => {
	it("handles empty schema", () => {
		const schema = new Schema({});
		expect(schema.entities.size).toBe(0);
		expect(schema.relationGraph.size).toBe(0);
		expect(schema.getEntityNames()).toEqual([]);
	});

	it("handles entity with only ID field", () => {
		const schema = new Schema({
			Minimal: {
				id: t.id(),
			},
		});

		const meta = schema.getEntity("Minimal");
		expect(meta?.fields.size).toBe(1);
		expect(meta?.relations.size).toBe(0);
		expect(meta?.primaryKey).toBe("id");
	});

	it("handles entity with all scalar types", () => {
		const schema = new Schema({
			AllTypes: {
				id: t.id(),
				name: t.string(),
				age: t.int(),
				score: t.float(),
				active: t.boolean(),
				createdAt: t.datetime(),
				birthDate: t.date(),
				balance: t.decimal(),
				bigNumber: t.bigint(),
				data: t.bytes(),
				metadata: t.json(),
				status: t.enum(["active", "inactive"]),
			},
		});

		const meta = schema.getEntity("AllTypes");
		expect(meta?.fields.size).toBe(12);
		expect(meta?.relations.size).toBe(0);

		expect(schema.getField("AllTypes", "name")?._type).toBe("string");
		expect(schema.getField("AllTypes", "age")?._type).toBe("int");
		expect(schema.getField("AllTypes", "score")?._type).toBe("float");
		expect(schema.getField("AllTypes", "active")?._type).toBe("boolean");
		expect(schema.getField("AllTypes", "createdAt")?._type).toBe("datetime");
		expect(schema.getField("AllTypes", "birthDate")?._type).toBe("date");
		expect(schema.getField("AllTypes", "balance")?._type).toBe("decimal");
		expect(schema.getField("AllTypes", "bigNumber")?._type).toBe("bigint");
		expect(schema.getField("AllTypes", "data")?._type).toBe("bytes");
		expect(schema.getField("AllTypes", "metadata")?._type).toBe("json");
		expect(schema.getField("AllTypes", "status")?._type).toBe("enum");
	});

	it("stores original definition for type inference", () => {
		const definition = {
			User: {
				id: t.id(),
				name: t.string(),
			},
		};

		const schema = new Schema(definition);
		expect(schema.definition).toBe(definition);
	});
});
