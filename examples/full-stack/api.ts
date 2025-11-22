/**
 * Shared API definition
 * Used by both server and client
 */

import { lens } from "../../packages/lens-core/dist/index.js";
import { z } from "zod";

// User schema
const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	status: z.enum(["online", "offline", "away"]),
	lastSeen: z.string(),
});

// In-memory data store
const users = new Map<string, z.infer<typeof UserSchema>>();

// Seed data
users.set("1", {
	id: "1",
	name: "Alice",
	email: "alice@example.com",
	status: "online",
	lastSeen: new Date().toISOString(),
});

users.set("2", {
	id: "2",
	name: "Bob",
	email: "bob@example.com",
	status: "offline",
	lastSeen: new Date().toISOString(),
});

// API definition
export const api = lens.object({
	user: lens.object({
		// Get user by ID
		get: lens.query({
			input: z.object({ id: z.string() }),
			output: UserSchema,
			resolve: async ({ id }) => {
				const user = users.get(id);
				if (!user) throw new Error("User not found");
				return user;
			},
		}),

		// List all users
		list: lens.query({
			input: z.object({}),
			output: z.array(UserSchema),
			resolve: async () => {
				return Array.from(users.values());
			},
		}),

		// Update user status
		updateStatus: lens.mutation({
			input: z.object({
				id: z.string(),
				status: z.enum(["online", "offline", "away"]),
			}),
			output: UserSchema,
			resolve: async ({ id, status }) => {
				const user = users.get(id);
				if (!user) throw new Error("User not found");

				user.status = status;
				user.lastSeen = new Date().toISOString();
				users.set(id, user);

				return user;
			},
		}),
	}),
});

export type API = typeof api;
