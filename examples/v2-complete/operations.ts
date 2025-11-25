/**
 * V2 Complete Example - Operations
 *
 * Demonstrates: Queries, Mutations, Optimistic Updates with DSL
 *
 * Key concept: Operations are free-form, not locked to CRUD!
 * - whoami, searchUsers, promoteBatch (not just User.get/list/create)
 *
 * Optimistic Updates:
 * - DSL (recommended): { type: 'merge' }, { type: 'create' }
 * - Function (legacy): ({ input }) => ({ id: input.id, ...input })
 *
 * DSL advantages:
 * - Works with type-only imports (no runtime code transfer)
 * - Declarative and predictable
 * - Serializable (no closures)
 */

import { query, mutation } from "@lens/core";
import { z } from "zod";
import { User, Post, Comment } from "./schema";

// =============================================================================
// Queries - 讀取資料
// =============================================================================

/**
 * 取得當前用戶 (no input needed)
 */
export const whoami = query()
	.returns(User)
	.resolve(({ ctx }) => ctx.currentUser);

/**
 * 取得單一用戶
 */
export const getUser = query()
	.input(z.object({ id: z.string() }))
	.returns(User)
	.resolve(({ input, ctx }) => ctx.db.user.findUnique({ where: { id: input.id } }));

/**
 * 搜尋用戶 (free-form operation, 唔係 CRUD)
 */
export const searchUsers = query()
	.input(z.object({ query: z.string(), limit: z.number().optional() }))
	.returns([User])
	.resolve(({ input, ctx }) =>
		ctx.db.user.findMany({
			where: { name: { contains: input.query } },
			take: input.limit ?? 10,
		})
	);

/**
 * 取得單一文章 (with nested author)
 */
export const getPost = query()
	.input(z.object({ id: z.string() }))
	.returns(Post)
	.resolve(({ input, ctx }) => ctx.db.post.findUnique({ where: { id: input.id } }));

/**
 * 取得熱門文章
 */
export const trendingPosts = query()
	.input(z.object({ limit: z.number().default(10) }))
	.returns([Post])
	.resolve(({ input, ctx }) =>
		ctx.db.post.findMany({
			where: { published: true },
			orderBy: { createdAt: "desc" },
			take: input.limit,
		})
	);

// =============================================================================
// Mutations - 修改資料 (with Optimistic Updates)
// =============================================================================

/**
 * 更新用戶資料
 *
 * Optimistic DSL: { type: 'merge' }
 * - Merges input into entity with matching id
 * - 成功: server data 取代 optimistic data
 * - 失敗: 自動 rollback 到之前狀態
 */
export const updateUser = mutation()
	.input(
		z.object({
			id: z.string(),
			name: z.string().optional(),
			email: z.string().optional(),
			avatar: z.string().optional(),
		})
	)
	.returns(User)
	.optimistic({ type: "merge" }) // DSL: merge input into entity
	.resolve(({ input, ctx }) =>
		ctx.db.user.update({
			where: { id: input.id },
			data: input,
		})
	);

/**
 * 建立新文章
 *
 * Optimistic DSL: { type: 'create' }
 * - Auto-generates tempId
 * - Server 會回傳真正 ID
 */
export const createPost = mutation()
	.input(
		z.object({
			title: z.string(),
			content: z.string(),
		})
	)
	.returns(Post)
	.optimistic({ type: "create", set: { published: false } }) // DSL: create with tempId
	.resolve(({ input, ctx }) =>
		ctx.db.post.create({
			data: {
				...input,
				authorId: ctx.currentUser.id,
			},
		})
	);

/**
 * 更新文章
 *
 * Optimistic DSL: { type: 'merge' }
 */
export const updatePost = mutation()
	.input(
		z.object({
			id: z.string(),
			title: z.string().optional(),
			content: z.string().optional(),
		})
	)
	.returns(Post)
	.optimistic({ type: "merge" }) // DSL: merge input into entity
	.resolve(({ input, ctx }) =>
		ctx.db.post.update({
			where: { id: input.id },
			data: { ...input, updatedAt: new Date() },
		})
	);

/**
 * 發佈文章
 *
 * Optimistic DSL: { type: 'merge', set: { published: true } }
 * - Merges input (id) + sets published to true
 */
export const publishPost = mutation()
	.input(z.object({ id: z.string() }))
	.returns(Post)
	.optimistic({ type: "merge", set: { published: true } }) // DSL: merge + set field
	.resolve(({ input, ctx }) =>
		ctx.db.post.update({
			where: { id: input.id },
			data: { published: true, updatedAt: new Date() },
		})
	);

/**
 * 批量升級用戶角色 (跨 entity optimistic update)
 *
 * Optimistic DSL: { type: 'updateMany', ... }
 * - Updates multiple entities in one mutation
 * - $ prefix references input fields
 *
 * 一個 mutation 影響多個 entities:
 * - users: 更新角色
 */
export const bulkPromoteUsers = mutation()
	.input(
		z.object({
			userIds: z.array(z.string()),
			newRole: z.enum(["user", "admin", "vip"]),
		})
	)
	.returns({
		users: [User],
		count: z.number(),
	})
	.optimistic({
		type: "updateMany",
		entity: "User",
		ids: "$userIds", // Reference: input.userIds
		set: { role: "$newRole" }, // Reference: input.newRole
	})
	.resolve(async ({ input, ctx }) => {
		const users = await ctx.db.user.updateMany({
			where: { id: { in: input.userIds } },
			data: { role: input.newRole },
		});

		return {
			users: await ctx.db.user.findMany({
				where: { id: { in: input.userIds } },
			}),
			count: users.count,
		};
	});

/**
 * 添加留言
 *
 * Optimistic DSL: { type: 'create' }
 * - Creates new entity with auto tempId
 */
export const addComment = mutation()
	.input(
		z.object({
			postId: z.string(),
			content: z.string(),
		})
	)
	.returns(Comment)
	.optimistic({ type: "create" }) // DSL: create with tempId
	.resolve(({ input, ctx }) =>
		ctx.db.comment.create({
			data: {
				...input,
				authorId: ctx.currentUser.id,
			},
		})
	);

// =============================================================================
// Export all operations
// =============================================================================

export const queries = {
	whoami,
	getUser,
	searchUsers,
	getPost,
	trendingPosts,
};

export const mutations = {
	updateUser,
	createPost,
	updatePost,
	publishPost,
	bulkPromoteUsers,
	addComment,
};
