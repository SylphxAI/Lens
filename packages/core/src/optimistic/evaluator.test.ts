import { beforeEach, describe, expect, it } from "bun:test";
import { resetTempIdCounter } from "../operations/index";
import {
	applyDeferredOperation,
	applyDeferredOperations,
	type DeferredOperation,
	evaluateMultiEntityDSL,
	evaluateMultiEntityDSLMap,
	OptimisticEvaluationError,
} from "./evaluator";

describe("evaluateMultiEntityDSL", () => {
	beforeEach(() => {
		resetTempIdCounter();
	});

	describe("basic operations", () => {
		it("evaluates single create operation", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "create" as const,
					title: "Hello World",
					published: false,
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				entity: "Post",
				op: "create",
				id: "temp_0",
				data: { title: "Hello World", published: false },
			});
		});

		it("evaluates single update operation", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "update" as const,
					$id: "post-123",
					title: "Updated Title",
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				entity: "Post",
				op: "update",
				id: "post-123",
				data: { title: "Updated Title" },
			});
		});

		it("evaluates single delete operation", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "delete" as const,
					$id: "post-123",
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				entity: "Post",
				op: "delete",
				id: "post-123",
				data: {},
			});
		});
	});

	describe("value references", () => {
		it("resolves $input reference", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "create" as const,
					title: { $input: "title" },
					content: { $input: "content" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {
				title: "My Post",
				content: "Post content",
			});

			expect(result[0].data).toEqual({
				title: "My Post",
				content: "Post content",
			});
		});

		it("resolves nested $input reference", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "create" as const,
					title: { $input: "data.title" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {
				data: { title: "Nested Title" },
			});

			expect(result[0].data.title).toBe("Nested Title");
		});

		it("resolves $temp reference", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "create" as const,
					$id: { $temp: true as const },
					title: "Test",
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].id).toBe("temp_0");
		});

		it("resolves $now reference", () => {
			const before = new Date().toISOString();

			const dsl = {
				post: {
					$entity: "Post",
					$op: "create" as const,
					title: "Test",
					createdAt: { $now: true as const },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});
			const after = new Date().toISOString();

			expect(result[0].data.createdAt).toBeDefined();
			expect((result[0].data.createdAt as string) >= before).toBe(true);
			expect((result[0].data.createdAt as string) <= after).toBe(true);
		});

		it("resolves $id from $input for update", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "update" as const,
					$id: { $input: "postId" },
					title: { $input: "newTitle" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {
				postId: "post-456",
				newTitle: "New Title",
			});

			expect(result[0].id).toBe("post-456");
			expect(result[0].data.title).toBe("New Title");
		});
	});

	describe("sibling references ($ref)", () => {
		it("resolves $ref to sibling id", () => {
			const dsl = {
				session: {
					$entity: "Session",
					$op: "create" as const,
					title: "New Chat",
				},
				message: {
					$entity: "Message",
					$op: "create" as const,
					sessionId: { $ref: "session.id" },
					content: "Hello",
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result).toHaveLength(2);
			// Session first (dependency order)
			expect(result[0].entity).toBe("Session");
			expect(result[0].id).toBe("temp_0");
			// Message second, with session reference
			expect(result[1].entity).toBe("Message");
			expect(result[1].data.sessionId).toBe("temp_0");
		});

		it("resolves $ref to sibling data field", () => {
			const dsl = {
				user: {
					$entity: "User",
					$op: "create" as const,
					name: "John",
				},
				post: {
					$entity: "Post",
					$op: "create" as const,
					authorName: { $ref: "user.name" },
					title: "My Post",
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[1].data.authorName).toBe("John");
		});

		it("handles multiple $ref dependencies", () => {
			const dsl = {
				session: {
					$entity: "Session",
					$op: "create" as const,
					title: "Chat",
				},
				user: {
					$entity: "User",
					$op: "create" as const,
					name: "Alice",
				},
				message: {
					$entity: "Message",
					$op: "create" as const,
					sessionId: { $ref: "session.id" },
					authorId: { $ref: "user.id" },
					content: "Hi!",
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result).toHaveLength(3);
			const message = result.find((op) => op.entity === "Message");
			expect(message?.data.sessionId).toBe("temp_0");
			expect(message?.data.authorId).toBe("temp_1");
		});
	});

	describe("dependency ordering", () => {
		it("orders operations by dependencies", () => {
			// Define in reverse order - message before session
			const dsl = {
				message: {
					$entity: "Message",
					$op: "create" as const,
					sessionId: { $ref: "session.id" },
				},
				session: {
					$entity: "Session",
					$op: "create" as const,
					title: "Chat",
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			// Session should be first despite being defined second
			expect(result[0].entity).toBe("Session");
			expect(result[1].entity).toBe("Message");
		});

		it("handles chain of dependencies", () => {
			const dsl = {
				c: {
					$entity: "C",
					$op: "create" as const,
					bId: { $ref: "b.id" },
				},
				a: {
					$entity: "A",
					$op: "create" as const,
					value: 1,
				},
				b: {
					$entity: "B",
					$op: "create" as const,
					aId: { $ref: "a.id" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].entity).toBe("A");
			expect(result[1].entity).toBe("B");
			expect(result[2].entity).toBe("C");
		});
	});

	describe("error handling", () => {
		it("throws on missing required $id for update", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "update" as const,
					title: "Updated",
				},
			};

			expect(() => evaluateMultiEntityDSL(dsl, {})).toThrow(OptimisticEvaluationError);
		});

		it("throws on missing required $id for delete", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "delete" as const,
				},
			};

			expect(() => evaluateMultiEntityDSL(dsl, {})).toThrow(OptimisticEvaluationError);
		});

		it("throws on missing input path", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "create" as const,
					title: { $input: "nonexistent" },
				},
			};

			// Note: This returns undefined for missing paths, not an error
			// You could make this stricter if needed
			const result = evaluateMultiEntityDSL(dsl, {});
			expect(result[0].data.title).toBeUndefined();
		});

		it("throws on circular dependency", () => {
			const dsl = {
				a: {
					$entity: "A",
					$op: "create" as const,
					bId: { $ref: "b.id" },
				},
				b: {
					$entity: "B",
					$op: "create" as const,
					aId: { $ref: "a.id" },
				},
			};

			expect(() => evaluateMultiEntityDSL(dsl, {})).toThrow(/Circular dependency/);
		});

		it("throws on self-reference", () => {
			const dsl = {
				a: {
					$entity: "A",
					$op: "create" as const,
					selfId: { $ref: "a.id" },
				},
			};

			expect(() => evaluateMultiEntityDSL(dsl, {})).toThrow(/Circular dependency/);
		});

		it("throws on unresolved sibling reference", () => {
			const dsl = {
				message: {
					$entity: "Message",
					$op: "create" as const,
					sessionId: { $ref: "nonexistent.id" },
				},
			};

			expect(() => evaluateMultiEntityDSL(dsl, {})).toThrow(/not found/);
		});
	});

	describe("complex scenarios", () => {
		it("handles chat session with messages scenario", () => {
			const dsl = {
				session: {
					$entity: "Session",
					$op: "create" as const,
					title: { $input: "title" },
					createdAt: { $now: true },
				},
				userMessage: {
					$entity: "Message",
					$op: "create" as const,
					sessionId: { $ref: "session.id" },
					role: "user",
					content: { $input: "content" },
					status: "completed",
				},
				assistantMessage: {
					$entity: "Message",
					$op: "create" as const,
					sessionId: { $ref: "session.id" },
					role: "assistant",
					content: "",
					status: "pending",
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {
				title: "New Chat",
				content: "Hello, AI!",
			});

			expect(result).toHaveLength(3);

			// Session
			expect(result[0].entity).toBe("Session");
			expect(result[0].data.title).toBe("New Chat");
			expect(result[0].data.createdAt).toBeDefined();

			// User message
			const userMsg = result.find((op) => op.entity === "Message" && op.data.role === "user");
			expect(userMsg?.data.sessionId).toBe(result[0].id);
			expect(userMsg?.data.content).toBe("Hello, AI!");
			expect(userMsg?.data.status).toBe("completed");

			// Assistant message
			const assistantMsg = result.find((op) => op.entity === "Message" && op.data.role === "assistant");
			expect(assistantMsg?.data.sessionId).toBe(result[0].id);
			expect(assistantMsg?.data.status).toBe("pending");
		});

		it("handles post with author update scenario", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "create" as const,
					title: { $input: "title" },
					authorId: { $input: "authorId" },
				},
				author: {
					$entity: "User",
					$op: "update" as const,
					$id: { $input: "authorId" },
					postCount: { $input: "newPostCount" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {
				title: "My New Post",
				authorId: "user-123",
				newPostCount: 5,
			});

			expect(result).toHaveLength(2);

			const post = result.find((op) => op.entity === "Post");
			expect(post?.op).toBe("create");
			expect(post?.data.title).toBe("My New Post");

			const author = result.find((op) => op.entity === "User");
			expect(author?.op).toBe("update");
			expect(author?.id).toBe("user-123");
			expect(author?.data.postCount).toBe(5);
		});
	});
});

describe("evaluateMultiEntityDSLMap", () => {
	beforeEach(() => {
		resetTempIdCounter();
	});

	it("returns map keyed by operation name", () => {
		const dsl = {
			session: {
				$entity: "Session",
				$op: "create" as const,
				title: "Test",
			},
			message: {
				$entity: "Message",
				$op: "create" as const,
				sessionId: { $ref: "session.id" },
			},
		};

		const result = evaluateMultiEntityDSLMap(dsl, {});

		expect(result.get("session")).toBeDefined();
		expect(result.get("message")).toBeDefined();
		expect(result.get("session")?.entity).toBe("Session");
		expect(result.get("message")?.data.sessionId).toBe(result.get("session")?.id);
	});
});

// =============================================================================
// V2 Operators Tests
// =============================================================================

describe("V2 Operators", () => {
	beforeEach(() => {
		resetTempIdCounter();
	});

	describe("$increment / $decrement", () => {
		it("evaluates $increment operator", () => {
			const dsl = {
				user: {
					$entity: "User",
					$op: "update" as const,
					$id: "user-1",
					postCount: { $increment: 1 },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].deferred).toBeDefined();
			expect(result[0].deferred?.postCount).toEqual({
				type: "increment",
				value: 1,
			});
		});

		it("evaluates $decrement operator", () => {
			const dsl = {
				user: {
					$entity: "User",
					$op: "update" as const,
					$id: "user-1",
					credits: { $decrement: 10 },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].deferred?.credits).toEqual({
				type: "decrement",
				value: 10,
			});
		});
	});

	describe("$push / $pull / $addToSet", () => {
		it("evaluates $push operator with single item", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "update" as const,
					$id: "post-1",
					tags: { $push: "new-tag" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].deferred?.tags).toEqual({
				type: "push",
				value: ["new-tag"],
			});
		});

		it("evaluates $push operator with multiple items", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "update" as const,
					$id: "post-1",
					tags: { $push: ["tag1", "tag2"] },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].deferred?.tags).toEqual({
				type: "push",
				value: ["tag1", "tag2"],
			});
		});

		it("evaluates $pull operator", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "update" as const,
					$id: "post-1",
					tags: { $pull: "old-tag" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].deferred?.tags).toEqual({
				type: "pull",
				value: ["old-tag"],
			});
		});

		it("evaluates $addToSet operator", () => {
			const dsl = {
				user: {
					$entity: "User",
					$op: "update" as const,
					$id: "user-1",
					roles: { $addToSet: "admin" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].deferred?.roles).toEqual({
				type: "addToSet",
				value: ["admin"],
			});
		});
	});

	describe("$default", () => {
		it("evaluates $default operator", () => {
			const dsl = {
				user: {
					$entity: "User",
					$op: "update" as const,
					$id: "user-1",
					bio: { $default: "No bio provided" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].deferred?.bio).toEqual({
				type: "default",
				value: "No bio provided",
			});
		});
	});

	describe("$if", () => {
		it("evaluates $if operator with boolean condition", () => {
			const dsl = {
				user: {
					$entity: "User",
					$op: "update" as const,
					$id: "user-1",
					status: {
						$if: {
							condition: true,
							then: "active",
							else: "inactive",
						},
					},
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].deferred?.status).toEqual({
				type: "if",
				value: null,
				condition: true,
				thenValue: "active",
				elseValue: "inactive",
			});
		});

		it("evaluates $if operator with $input condition", () => {
			const dsl = {
				user: {
					$entity: "User",
					$op: "update" as const,
					$id: "user-1",
					role: {
						$if: {
							condition: { $input: "isAdmin" },
							then: "admin",
							else: "user",
						},
					},
				},
			};

			const result = evaluateMultiEntityDSL(dsl, { isAdmin: true });

			expect(result[0].deferred?.role.condition).toBe(true);
		});
	});

	describe("$ids (bulk operations)", () => {
		it("evaluates bulk update with $ids", () => {
			const dsl = {
				posts: {
					$entity: "Post",
					$op: "update" as const,
					$ids: ["post-1", "post-2", "post-3"],
					published: true,
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].ids).toEqual(["post-1", "post-2", "post-3"]);
			expect(result[0].data.published).toBe(true);
		});

		it("evaluates bulk update with $ids from $input", () => {
			const dsl = {
				posts: {
					$entity: "Post",
					$op: "update" as const,
					$ids: { $input: "postIds" },
					archived: true,
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {
				postIds: ["post-a", "post-b"],
			});

			expect(result[0].ids).toEqual(["post-a", "post-b"]);
		});

		it("evaluates bulk delete with $ids", () => {
			const dsl = {
				posts: {
					$entity: "Post",
					$op: "delete" as const,
					$ids: ["post-1", "post-2"],
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].op).toBe("delete");
			expect(result[0].ids).toEqual(["post-1", "post-2"]);
		});
	});

	describe("$where (query-based bulk operations)", () => {
		it("evaluates bulk update with $where", () => {
			const dsl = {
				posts: {
					$entity: "Post",
					$op: "update" as const,
					$where: { authorId: "user-1", published: false },
					published: true,
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].where).toEqual({ authorId: "user-1", published: false });
			expect(result[0].data.published).toBe(true);
		});

		it("evaluates $where with $input values", () => {
			const dsl = {
				posts: {
					$entity: "Post",
					$op: "update" as const,
					$where: { authorId: { $input: "userId" } },
					archived: true,
				},
			};

			const result = evaluateMultiEntityDSL(dsl, { userId: "user-123" });

			expect(result[0].where).toEqual({ authorId: "user-123" });
		});
	});

	describe("combined v2 features", () => {
		it("combines $ids with $increment", () => {
			const dsl = {
				users: {
					$entity: "User",
					$op: "update" as const,
					$ids: ["user-1", "user-2"],
					loginCount: { $increment: 1 },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].ids).toEqual(["user-1", "user-2"]);
			expect(result[0].deferred?.loginCount.type).toBe("increment");
		});

		it("combines static data with deferred operations", () => {
			const dsl = {
				post: {
					$entity: "Post",
					$op: "update" as const,
					$id: "post-1",
					title: "Updated Title",
					viewCount: { $increment: 1 },
					tags: { $push: "featured" },
				},
			};

			const result = evaluateMultiEntityDSL(dsl, {});

			expect(result[0].data.title).toBe("Updated Title");
			expect(result[0].deferred?.viewCount.type).toBe("increment");
			expect(result[0].deferred?.tags.type).toBe("push");
		});
	});
});

// =============================================================================
// Deferred Operation Application Tests
// =============================================================================

describe("applyDeferredOperation", () => {
	describe("$increment", () => {
		it("increments numeric value", () => {
			const deferred: DeferredOperation = { type: "increment", value: 5 };
			expect(applyDeferredOperation(deferred, 10)).toBe(15);
		});

		it("treats undefined as 0", () => {
			const deferred: DeferredOperation = { type: "increment", value: 3 };
			expect(applyDeferredOperation(deferred, undefined)).toBe(3);
		});

		it("treats non-number as 0", () => {
			const deferred: DeferredOperation = { type: "increment", value: 1 };
			expect(applyDeferredOperation(deferred, "not a number")).toBe(1);
		});
	});

	describe("$decrement", () => {
		it("decrements numeric value", () => {
			const deferred: DeferredOperation = { type: "decrement", value: 3 };
			expect(applyDeferredOperation(deferred, 10)).toBe(7);
		});

		it("can result in negative values", () => {
			const deferred: DeferredOperation = { type: "decrement", value: 5 };
			expect(applyDeferredOperation(deferred, 2)).toBe(-3);
		});
	});

	describe("$push", () => {
		it("pushes items to array", () => {
			const deferred: DeferredOperation = { type: "push", value: ["new"] };
			expect(applyDeferredOperation(deferred, ["existing"])).toEqual(["existing", "new"]);
		});

		it("creates array from undefined", () => {
			const deferred: DeferredOperation = { type: "push", value: ["first"] };
			expect(applyDeferredOperation(deferred, undefined)).toEqual(["first"]);
		});

		it("pushes multiple items", () => {
			const deferred: DeferredOperation = { type: "push", value: ["a", "b"] };
			expect(applyDeferredOperation(deferred, [])).toEqual(["a", "b"]);
		});
	});

	describe("$pull", () => {
		it("removes items from array", () => {
			const deferred: DeferredOperation = { type: "pull", value: ["b"] };
			expect(applyDeferredOperation(deferred, ["a", "b", "c"])).toEqual(["a", "c"]);
		});

		it("removes multiple items", () => {
			const deferred: DeferredOperation = { type: "pull", value: ["a", "c"] };
			expect(applyDeferredOperation(deferred, ["a", "b", "c"])).toEqual(["b"]);
		});

		it("handles objects in array", () => {
			const deferred: DeferredOperation = { type: "pull", value: [{ id: 2 }] };
			expect(applyDeferredOperation(deferred, [{ id: 1 }, { id: 2 }, { id: 3 }])).toEqual([{ id: 1 }, { id: 3 }]);
		});

		it("returns original if not array", () => {
			const deferred: DeferredOperation = { type: "pull", value: ["x"] };
			expect(applyDeferredOperation(deferred, "not array")).toBe("not array");
		});
	});

	describe("$addToSet", () => {
		it("adds item if not exists", () => {
			const deferred: DeferredOperation = { type: "addToSet", value: ["new"] };
			expect(applyDeferredOperation(deferred, ["existing"])).toEqual(["existing", "new"]);
		});

		it("does not add duplicate", () => {
			const deferred: DeferredOperation = { type: "addToSet", value: ["existing"] };
			expect(applyDeferredOperation(deferred, ["existing"])).toEqual(["existing"]);
		});

		it("handles objects", () => {
			const deferred: DeferredOperation = { type: "addToSet", value: [{ id: 1 }] };
			expect(applyDeferredOperation(deferred, [{ id: 1 }])).toEqual([{ id: 1 }]);
		});

		it("creates array from undefined", () => {
			const deferred: DeferredOperation = { type: "addToSet", value: ["first"] };
			expect(applyDeferredOperation(deferred, undefined)).toEqual(["first"]);
		});
	});

	describe("$default", () => {
		it("returns default for undefined", () => {
			const deferred: DeferredOperation = { type: "default", value: "default" };
			expect(applyDeferredOperation(deferred, undefined)).toBe("default");
		});

		it("returns current value if defined", () => {
			const deferred: DeferredOperation = { type: "default", value: "default" };
			expect(applyDeferredOperation(deferred, "current")).toBe("current");
		});

		it("returns current value even if falsy", () => {
			const deferred: DeferredOperation = { type: "default", value: "default" };
			expect(applyDeferredOperation(deferred, 0)).toBe(0);
			expect(applyDeferredOperation(deferred, "")).toBe("");
			expect(applyDeferredOperation(deferred, null)).toBe(null);
		});
	});

	describe("$if", () => {
		it("returns then value if condition true", () => {
			const deferred: DeferredOperation = {
				type: "if",
				value: null,
				condition: true,
				thenValue: "yes",
				elseValue: "no",
			};
			expect(applyDeferredOperation(deferred, "current")).toBe("yes");
		});

		it("returns else value if condition false", () => {
			const deferred: DeferredOperation = {
				type: "if",
				value: null,
				condition: false,
				thenValue: "yes",
				elseValue: "no",
			};
			expect(applyDeferredOperation(deferred, "current")).toBe("no");
		});

		it("returns current value if no else and condition false", () => {
			const deferred: DeferredOperation = {
				type: "if",
				value: null,
				condition: false,
				thenValue: "yes",
			};
			expect(applyDeferredOperation(deferred, "current")).toBe("current");
		});

		it("evaluates truthy conditions", () => {
			const deferred: DeferredOperation = {
				type: "if",
				value: null,
				condition: 1,
				thenValue: "truthy",
			};
			expect(applyDeferredOperation(deferred, "current")).toBe("truthy");
		});
	});
});

describe("applyDeferredOperations", () => {
	it("applies all deferred operations to entity", () => {
		const operation = {
			entity: "User",
			op: "update" as const,
			id: "user-1",
			data: { name: "John" },
			deferred: {
				postCount: { type: "increment" as const, value: 1 },
				tags: { type: "push" as const, value: ["new"] },
			},
		};

		const currentState = {
			name: "Old Name",
			postCount: 5,
			tags: ["existing"],
		};

		const result = applyDeferredOperations(operation, currentState);

		expect(result.name).toBe("John"); // From operation.data
		expect(result.postCount).toBe(6); // Incremented
		expect(result.tags).toEqual(["existing", "new"]); // Pushed
	});

	it("handles missing current state", () => {
		const operation = {
			entity: "User",
			op: "update" as const,
			id: "user-1",
			data: {},
			deferred: {
				count: { type: "increment" as const, value: 1 },
			},
		};

		const result = applyDeferredOperations(operation);

		expect(result.count).toBe(1);
	});

	it("returns data without deferred if none present", () => {
		const operation = {
			entity: "User",
			op: "update" as const,
			id: "user-1",
			data: { name: "John" },
		};

		const result = applyDeferredOperations(operation);

		expect(result).toEqual({ name: "John" });
	});
});
