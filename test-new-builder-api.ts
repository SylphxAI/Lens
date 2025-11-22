/**
 * 測試新既 Builder Pattern API
 */

import { createLensBuilder } from "./packages/lens-core/src/schema/builder.js";
import { z } from "zod";

const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

interface AppContext {
	db: {
		users: {
			findOne: (id: string) => Promise<any>;
			findAll: () => Promise<any[]>;
			create: (data: any) => Promise<any>;
		};
	};
}

const lens = createLensBuilder<AppContext>();

console.log("Testing Builder Pattern API\n");

// Test 1: Query with input
console.log("✅ Test 1: Query with input");
const getUserById = lens
	.input(z.object({ id: z.string() }))
	.output(UserSchema)
	.query(async ({ input, ctx }) => {
		// Type check
		const id: string = input.id;
		const db = ctx.db;
		console.log(`  - input.id type: ${typeof id}`);
		console.log(`  - ctx.db exists: ${!!db}`);
		return { id, name: "Test User", email: "test@example.com" };
	});

// Test 2: Query without input
console.log("✅ Test 2: Query without input");
const getAllUsers = lens.output(z.array(UserSchema)).query(async ({ ctx }) => {
	// Type check
	const db = ctx.db;
	console.log(`  - ctx.db exists: ${!!db}`);
	return [];
});

// Test 3: Mutation with input
console.log("✅ Test 3: Mutation with input");
const createUser = lens
	.input(UserSchema)
	.output(UserSchema)
	.mutation(async ({ input, ctx }) => {
		// Type check
		const name: string = input.name;
		const db = ctx.db;
		console.log(`  - input.name type: ${typeof name}`);
		console.log(`  - ctx.db exists: ${!!db}`);
		return input;
	});

// Test 4: Nested object structure
console.log("✅ Test 4: Nested object structure");
const api = lens.object({
	users: lens.object({
		getById: lens
			.input(z.object({ id: z.string() }))
			.output(UserSchema)
			.query(async ({ input, ctx }) => {
				const id: string = input.id;
				return { id, name: "Test", email: "test@example.com" };
			}),

		list: lens.output(z.array(UserSchema)).query(async ({ ctx }) => {
			return [];
		}),

		create: lens
			.input(UserSchema)
			.output(UserSchema)
			.mutation(async ({ input, ctx }) => {
				return input;
			}),
	}),
});

console.log("\n🎉 All tests compiled successfully!");
console.log("\nAPI structure:");
console.log("  - api.users.getById.type:", api.users.getById.type);
console.log("  - api.users.getById.path:", api.users.getById.path);
console.log("  - api.users.list.type:", api.users.list.type);
console.log("  - api.users.list.path:", api.users.list.path);
console.log("  - api.users.create.type:", api.users.create.type);
console.log("  - api.users.create.path:", api.users.create.path);
