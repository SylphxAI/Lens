/**
 * Example Lens API - User management
 */

import { z } from "zod";
import { lens } from "../../packages/lens-core/src/index.js";

// Schemas
const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().email(),
	bio: z.string(),
	createdAt: z.date(),
});

const PostSchema = z.object({
	id: z.string(),
	title: z.string(),
	content: z.string(),
	authorId: z.string(),
	published: z.boolean(),
});

type User = z.infer<typeof UserSchema>;
type Post = z.infer<typeof PostSchema>;

// Mock database
const users: Map<string, User> = new Map([
	[
		"1",
		{
			id: "1",
			name: "Alice",
			email: "alice@example.com",
			bio: "Software engineer passionate about TypeScript",
			createdAt: new Date("2024-01-01"),
		},
	],
	[
		"2",
		{
			id: "2",
			name: "Bob",
			email: "bob@example.com",
			bio: "Product manager building the future",
			createdAt: new Date("2024-01-15"),
		},
	],
]);

const posts: Map<string, Post> = new Map([
	[
		"1",
		{
			id: "1",
			title: "Getting Started with Lens",
			content:
				"Lens is a type-safe, real-time API framework that combines the best of GraphQL, tRPC, and Zod...",
			authorId: "1",
			published: true,
		},
	],
	[
		"2",
		{
			id: "2",
			title: "Why Type Safety Matters",
			content:
				"Type safety isn't just about catching bugs early. It's about building confidence...",
			authorId: "1",
			published: false,
		},
	],
]);

// API definition
export const api = lens.object({
	user: lens.object({
		get: lens.query({
			input: z.object({ id: z.string() }),
			output: UserSchema.extend({
				posts: z.array(PostSchema).optional(),
			}),
			resolve: async ({ id }) => {
				const user = users.get(id);
				if (!user) {
					throw new Error("User not found");
				}

				// Include user's posts
				const userPosts = Array.from(posts.values()).filter(
					(p) => p.authorId === id
				);

				return {
					...user,
					posts: userPosts,
				};
			},
		}),

		list: lens.query({
			input: z.object({
				limit: z.number().default(10),
				offset: z.number().default(0),
			}),
			output: z.array(UserSchema),
			resolve: async ({ limit, offset }) => {
				const allUsers = Array.from(users.values());
				return allUsers.slice(offset, offset + limit);
			},
		}),

		create: lens.mutation({
			input: z.object({
				name: z.string(),
				email: z.string().email(),
				bio: z.string(),
			}),
			output: UserSchema,
			resolve: async ({ name, email, bio }) => {
				const id = String(users.size + 1);
				const user: User = {
					id,
					name,
					email,
					bio,
					createdAt: new Date(),
				};

				users.set(id, user);
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
				const user = users.get(id);
				if (!user) {
					throw new Error("User not found");
				}

				const updated = { ...user, ...data };
				users.set(id, updated);
				return updated;
			},
		}),
	}),

	post: lens.object({
		get: lens.query({
			input: z.object({ id: z.string() }),
			output: PostSchema,
			resolve: async ({ id }) => {
				const post = posts.get(id);
				if (!post) {
					throw new Error("Post not found");
				}
				return post;
			},
		}),

		create: lens.mutation({
			input: z.object({
				title: z.string(),
				content: z.string(),
				authorId: z.string(),
			}),
			output: PostSchema,
			resolve: async ({ title, content, authorId }) => {
				const id = String(posts.size + 1);
				const post: Post = {
					id,
					title,
					content,
					authorId,
					published: false,
				};

				posts.set(id, post);
				return post;
			},
		}),

		publish: lens.mutation({
			input: z.object({ id: z.string() }),
			output: PostSchema,
			resolve: async ({ id }) => {
				const post = posts.get(id);
				if (!post) {
					throw new Error("Post not found");
				}

				const published = { ...post, published: true };
				posts.set(id, published);
				return published;
			},
		}),
	}),
});

export type API = typeof api;
