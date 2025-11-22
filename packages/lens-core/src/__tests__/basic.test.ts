/**
 * Basic integration tests for Lens core
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { lens } from "../schema/builder.js";
import { InProcessTransport } from "../transport/in-process.js";
import type { LensObject } from "../schema/types.js";

// Test schemas
const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().email(),
	bio: z.string(),
});

type User = z.infer<typeof UserSchema>;

// Mock database
const mockDb: Record<string, User> = {
	"1": {
		id: "1",
		name: "Alice",
		email: "alice@example.com",
		bio: "Software engineer",
	},
	"2": {
		id: "2",
		name: "Bob",
		email: "bob@example.com",
		bio: "Product manager",
	},
};

// Test API
const api = lens.object({
	user: lens.object({
		get: lens.query({
			input: z.object({ id: z.string() }),
			output: UserSchema,
			resolve: async ({ id }) => {
				const user = mockDb[id];
				if (!user) {
					throw new Error("User not found");
				}
				return user;
			},
		}),

		update: lens.mutation({
			input: z.object({
				id: z.string(),
				data: z.object({
					name: z.string().optional(),
					bio: z.string().optional(),
				}),
			}),
			output: UserSchema,
			resolve: async ({ id, data }) => {
				const user = mockDb[id];
				if (!user) {
					throw new Error("User not found");
				}

				const updated = { ...user, ...data };
				mockDb[id] = updated;
				return updated;
			},
		}),
	}),
});

describe("Lens Core", () => {
	test("schema builder creates correct structure", () => {
		expect(api.user.get.type).toBe("query");
		expect(api.user.update.type).toBe("mutation");
		expect(api.user.get.path).toEqual(["user", "get"]);
		expect(api.user.update.path).toEqual(["user", "update"]);
	});

	test("query with InProcessTransport", async () => {
		const transport = new InProcessTransport({ api });

		const result = await transport.query({
			type: "query",
			path: ["user", "get"],
			input: { id: "1" },
		});

		expect(result).toEqual(mockDb["1"]);
	});

	test("query with field selection (array syntax)", async () => {
		const transport = new InProcessTransport({ api });

		const result = await transport.query({
			type: "query",
			path: ["user", "get"],
			input: { id: "1" },
			select: ["id", "name"],
		});

		expect(result).toEqual({
			id: "1",
			name: "Alice",
		});
	});

	test("query with field selection (object syntax)", async () => {
		const transport = new InProcessTransport({ api });

		const result = await transport.query({
			type: "query",
			path: ["user", "get"],
			input: { id: "1" },
			select: {
				id: true,
				email: true,
			},
		});

		expect(result).toEqual({
			id: "1",
			email: "alice@example.com",
		});
	});

	test("mutation updates data", async () => {
		const transport = new InProcessTransport({ api });

		const result = await transport.mutate({
			type: "mutation",
			path: ["user", "update"],
			input: {
				id: "1",
				data: {
					name: "Alice Smith",
				},
			},
		});

		expect(result).toEqual({
			id: "1",
			name: "Alice Smith",
			email: "alice@example.com",
			bio: "Software engineer",
		});

		// Verify database was updated
		expect(mockDb["1"].name).toBe("Alice Smith");
	});

	test("input validation fails on invalid data", async () => {
		const transport = new InProcessTransport({ api });

		try {
			await transport.query({
				type: "query",
				path: ["user", "get"],
				input: { id: 123 }, // Invalid: should be string
			});
			throw new Error("Should have thrown");
		} catch (error: any) {
			expect(error.message).toContain("Input validation failed");
		}
	});

	test("output validation fails on invalid response", async () => {
		const brokenApi = lens.object({
			user: lens.object({
				get: lens.query({
					input: z.object({ id: z.string() }),
					output: UserSchema,
					resolve: async ({ id }) => {
						// Return invalid data
						return { id, invalid: true } as any;
					},
				}),
			}),
		});

		const transport = new InProcessTransport({ api: brokenApi });

		try {
			await transport.query({
				type: "query",
				path: ["user", "get"],
				input: { id: "1" },
			});
			throw new Error("Should have thrown");
		} catch (error: any) {
			expect(error.message).toContain("Output validation failed");
		}
	});
});
