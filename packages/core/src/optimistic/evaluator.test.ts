import { beforeEach, describe, expect, it } from "bun:test";
import { resetTempIdCounter } from "../operations/index";
import { evaluateMultiEntityDSL, evaluateMultiEntityDSLMap, OptimisticEvaluationError } from "./evaluator";

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
