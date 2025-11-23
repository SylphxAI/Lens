/**
 * @lens/core - Type-Safe Where/OrderBy Tests
 *
 * Tests for type inference of WhereInput and OrderByInput.
 * These are compile-time type tests - if they compile, the types are correct.
 */

import { describe, it, expect } from "bun:test";
import { t } from "./types";
import { createSchema } from "./create";
import type {
	WhereInput,
	OrderByInput,
	InferEntity,
} from "./infer";

// =============================================================================
// Test Schema
// =============================================================================

const schema = createSchema({
	User: {
		id: t.id(),
		name: t.string(),
		email: t.string(),
		age: t.int().nullable(),
		score: t.float(),
		isActive: t.boolean(),
		createdAt: t.datetime(),
		role: t.enum(["admin", "user", "guest"] as const),
		posts: t.hasMany("Post"),
	},
	Post: {
		id: t.id(),
		title: t.string(),
		content: t.string(),
		views: t.int(),
		published: t.boolean(),
		author: t.belongsTo("User"),
	},
});

type UserDef = (typeof schema)["definition"]["User"];
type PostDef = (typeof schema)["definition"]["Post"];

// =============================================================================
// Type-Level Tests (compile-time)
// =============================================================================

describe("WhereInput type safety", () => {
	it("allows string filters on string fields", () => {
		const where: WhereInput<UserDef> = {
			name: { equals: "John" },
		};
		expect(where).toBeDefined();
	});

	it("allows string filters with contains, startsWith, endsWith", () => {
		const where: WhereInput<UserDef> = {
			name: { contains: "oh" },
			email: { startsWith: "john", endsWith: ".com" },
		};
		expect(where).toBeDefined();
	});

	it("allows direct value for simple equality", () => {
		const where: WhereInput<UserDef> = {
			name: "John",
			isActive: true,
		};
		expect(where).toBeDefined();
	});

	it("allows number filters on int/float fields", () => {
		const where: WhereInput<UserDef> = {
			age: { gt: 18, lte: 65 },
			score: { gte: 0, lt: 100 },
		};
		expect(where).toBeDefined();
	});

	it("allows boolean filters", () => {
		const where: WhereInput<UserDef> = {
			isActive: { equals: true },
		};
		expect(where).toBeDefined();
	});

	it("allows datetime filters", () => {
		const where: WhereInput<UserDef> = {
			createdAt: { gt: new Date("2024-01-01") },
		};
		expect(where).toBeDefined();
	});

	it("allows enum filters with type-safe values", () => {
		const where: WhereInput<UserDef> = {
			role: { equals: "admin" },
		};
		expect(where).toBeDefined();

		const where2: WhereInput<UserDef> = {
			role: { in: ["admin", "user"] },
		};
		expect(where2).toBeDefined();
	});

	it("allows AND/OR/NOT logical operators", () => {
		const where: WhereInput<UserDef> = {
			AND: [{ name: { contains: "John" } }, { isActive: true }],
		};
		expect(where).toBeDefined();

		const where2: WhereInput<UserDef> = {
			OR: [{ role: "admin" }, { role: "user" }],
		};
		expect(where2).toBeDefined();

		const where3: WhereInput<UserDef> = {
			NOT: { isActive: false },
		};
		expect(where3).toBeDefined();
	});

	it("allows in/notIn array filters", () => {
		const where: WhereInput<UserDef> = {
			name: { in: ["John", "Jane", "Bob"] },
			age: { notIn: [0, 1, 2] },
		};
		expect(where).toBeDefined();
	});

	it("allows complex nested filters", () => {
		const where: WhereInput<UserDef> = {
			AND: [
				{ isActive: true },
				{
					OR: [{ role: "admin" }, { age: { gte: 21 } }],
				},
			],
			name: { contains: "John", mode: "insensitive" },
		};
		expect(where).toBeDefined();
	});
});

describe("OrderByInput type safety", () => {
	it("allows sorting on scalar fields", () => {
		const orderBy: OrderByInput<UserDef> = {
			name: "asc",
		};
		expect(orderBy).toBeDefined();
	});

	it("allows multiple sort fields", () => {
		const orderBy: OrderByInput<UserDef> = {
			role: "desc",
			name: "asc",
		};
		expect(orderBy).toBeDefined();
	});

	it("allows sort with null handling", () => {
		const orderBy: OrderByInput<UserDef> = {
			age: { sort: "asc", nulls: "last" },
		};
		expect(orderBy).toBeDefined();
	});

	it("works on Post entity too", () => {
		const orderBy: OrderByInput<PostDef> = {
			views: "desc",
			title: "asc",
		};
		expect(orderBy).toBeDefined();
	});
});

// =============================================================================
// Type Error Tests (should NOT compile - commented out)
// =============================================================================

// These would cause compile errors if uncommented (which is correct):

// ERROR: 'invalid' is not a valid field
// const badWhere1: WhereInput<UserDef> = {
//   invalid: { equals: 'foo' }
// };

// ERROR: 'posts' is a relation, not allowed in where
// const badWhere2: WhereInput<UserDef> = {
//   posts: { equals: [] }
// };

// ERROR: number filter on string field
// const badWhere3: WhereInput<UserDef> = {
//   name: { gt: 5 }
// };

// ERROR: 'superadmin' is not a valid enum value
// const badWhere4: WhereInput<UserDef> = {
//   role: { equals: 'superadmin' }
// };

// ERROR: cannot orderBy relation field
// const badOrderBy: OrderByInput<UserDef> = {
//   posts: 'asc'
// };

describe("Runtime behavior", () => {
	it("where objects are plain JavaScript objects", () => {
		const where: WhereInput<UserDef> = {
			name: { contains: "test" },
			age: { gt: 18 },
		};

		expect(typeof where).toBe("object");
		expect(where.name).toEqual({ contains: "test" });
		expect(where.age).toEqual({ gt: 18 });
	});

	it("orderBy objects are plain JavaScript objects", () => {
		const orderBy: OrderByInput<UserDef> = {
			createdAt: "desc",
		};

		expect(typeof orderBy).toBe("object");
		expect(orderBy.createdAt).toBe("desc");
	});
});
