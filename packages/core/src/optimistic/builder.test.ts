import { describe, expect, it } from "bun:test";
import { op, pipeline, ref, when } from "./builder";

describe("DSL Builder", () => {
	describe("pipeline", () => {
		it("compiles simple create operation", () => {
			const dsl = pipeline(({ input }) => [
				op
					.create("Session", {
						title: input.title,
					})
					.as("session"),
			]);

			expect(dsl).toEqual({
				session: {
					$entity: "Session",
					$op: "create",
					title: { $input: "title" },
				},
			});
		});

		it("compiles update operation with id", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("Session", {
						id: input.sessionId,
						title: input.title,
					})
					.as("session"),
			]);

			expect(dsl).toEqual({
				session: {
					$entity: "Session",
					$op: "update",
					$id: { $input: "sessionId" },
					title: { $input: "title" },
				},
			});
		});

		it("compiles delete operation", () => {
			const dsl = pipeline(({ input }) => [op.delete("Post", input.postId).as("deleted")]);

			expect(dsl).toEqual({
				deleted: {
					$entity: "Post",
					$op: "delete",
					$id: { $input: "postId" },
				},
			});
		});

		it("compiles multiple operations with ref.from()", () => {
			const dsl = pipeline(({ input }) => [
				op
					.create("Session", {
						title: input.title,
					})
					.as("session"),
				op
					.create("Message", {
						sessionId: ref.from("session").id,
						content: input.content,
					})
					.as("message"),
			]);

			expect(dsl).toEqual({
				session: {
					$entity: "Session",
					$op: "create",
					title: { $input: "title" },
				},
				message: {
					$entity: "Message",
					$op: "create",
					sessionId: { $ref: "session.id" },
					content: { $input: "content" },
				},
			});
		});

		it("handles operations without .as() name", () => {
			const dsl = pipeline(({ input }) => [
				op.create("Session", { title: input.title }),
				op.create("Log", { action: "created" }),
			]);

			expect(dsl._op_0).toEqual({
				$entity: "Session",
				$op: "create",
				title: { $input: "title" },
			});
			expect(dsl._op_1).toEqual({
				$entity: "Log",
				$op: "create",
				action: "created",
			});
		});
	});

	describe("input proxy", () => {
		it("converts simple field access", () => {
			const dsl = pipeline(({ input }) => [
				op
					.create("User", {
						name: input.name,
						email: input.email,
					})
					.as("user"),
			]);

			expect(dsl.user).toEqual({
				$entity: "User",
				$op: "create",
				name: { $input: "name" },
				email: { $input: "email" },
			});
		});

		it("converts nested field access", () => {
			const dsl = pipeline<{ user: { name: string; address: { city: string } } }>(({ input }) => [
				op
					.create("User", {
						name: input.user.name,
						city: input.user.address.city,
					})
					.as("user"),
			]);

			expect(dsl.user).toEqual({
				$entity: "User",
				$op: "create",
				name: { $input: "user.name" },
				city: { $input: "user.address.city" },
			});
		});
	});

	describe("ref.from()", () => {
		it("converts sibling field access", () => {
			const dsl = pipeline(() => [
				op.create("Session", {}).as("session"),
				op
					.create("Message", {
						sessionId: ref.from("session").id,
					})
					.as("message"),
			]);

			expect(dsl.message.sessionId).toEqual({ $ref: "session.id" });
		});

		it("converts nested sibling access", () => {
			const dsl = pipeline(() => [
				op.create("User", {}).as("user"),
				op
					.create("Profile", {
						userId: ref.from("user").id,
						location: ref.from("user").settings.defaultLocation,
					})
					.as("profile"),
			]);

			expect(dsl.profile.location).toEqual({ $ref: "user.settings.defaultLocation" });
		});
	});

	describe("ref.* helpers", () => {
		it("ref.temp() generates temp id reference", () => {
			const dsl = pipeline(() => [
				op
					.create("Session", {
						id: ref.temp(),
					})
					.as("session"),
			]);

			expect(dsl.session.id).toEqual({ $temp: true });
		});

		it("ref.now() generates timestamp reference", () => {
			const dsl = pipeline(() => [
				op
					.create("Session", {
						createdAt: ref.now(),
					})
					.as("session"),
			]);

			expect(dsl.session.createdAt).toEqual({ $now: true });
		});

		it("ref.increment() generates increment operator", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("User", {
						id: input.userId,
						postCount: ref.increment(1),
					})
					.as("user"),
			]);

			expect(dsl.user.postCount).toEqual({ $increment: 1 });
		});

		it("ref.decrement() generates decrement operator", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("User", {
						id: input.userId,
						credits: ref.decrement(10),
					})
					.as("user"),
			]);

			expect(dsl.user.credits).toEqual({ $decrement: 10 });
		});

		it("ref.push() generates push operator", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("Post", {
						id: input.postId,
						tags: ref.push("featured"),
					})
					.as("post"),
			]);

			expect(dsl.post.tags).toEqual({ $push: "featured" });
		});

		it("ref.push() with multiple items", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("Post", {
						id: input.postId,
						tags: ref.push("a", "b", "c"),
					})
					.as("post"),
			]);

			expect(dsl.post.tags).toEqual({ $push: ["a", "b", "c"] });
		});

		it("ref.pull() generates pull operator", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("Post", {
						id: input.postId,
						tags: ref.pull("draft"),
					})
					.as("post"),
			]);

			expect(dsl.post.tags).toEqual({ $pull: "draft" });
		});

		it("ref.addToSet() generates addToSet operator", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("User", {
						id: input.userId,
						roles: ref.addToSet("admin"),
					})
					.as("user"),
			]);

			expect(dsl.user.roles).toEqual({ $addToSet: "admin" });
		});

		it("ref.default() generates default operator", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("User", {
						id: input.userId,
						bio: ref.default("No bio provided"),
					})
					.as("user"),
			]);

			expect(dsl.user.bio).toEqual({ $default: "No bio provided" });
		});

		it("ref.if() generates conditional operator", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("User", {
						id: input.userId,
						role: ref.if(input.isAdmin, "admin", "user"),
					})
					.as("user"),
			]);

			expect(dsl.user.role).toEqual({
				$if: {
					condition: { $input: "isAdmin" },
					then: "admin",
					else: "user",
				},
			});
		});

		it("ref.if() without else", () => {
			const dsl = pipeline(({ input }) => [
				op
					.update("User", {
						id: input.userId,
						verified: ref.if(input.hasEmail, true),
					})
					.as("user"),
			]);

			expect(dsl.user.verified).toEqual({
				$if: {
					condition: { $input: "hasEmail" },
					then: true,
					else: undefined,
				},
			});
		});
	});

	describe("when().then().else()", () => {
		it("compiles conditional operation with matching names", () => {
			const dsl = pipeline(({ input }) => [
				when(input.sessionId)
					.then([
						op
							.update("Session", {
								id: input.sessionId,
								title: input.title,
							})
							.as("session"),
					])
					.else([
						op
							.create("Session", {
								title: input.title,
							})
							.as("session"),
					]),
			]);

			expect(dsl).toEqual({
				session: {
					$entity: "Session",
					$op: {
						$if: {
							condition: { $input: "sessionId" },
							then: "update",
							else: "create",
						},
					},
					$id: { $input: "sessionId" },
					title: { $input: "title" },
				},
			});
		});

		it("supports multiple operations in branches", () => {
			const dsl = pipeline(({ input }) => [
				when(input.sessionId)
					.then([
						op.update("Session", { id: input.sessionId }).as("session"),
						op.create("Log", { action: "updated" }).as("log"),
					])
					.else([
						op.create("Session", { title: input.title }).as("session"),
						op.create("Log", { action: "created" }).as("log"),
					]),
			]);

			expect(dsl.session.$op).toEqual({
				$if: {
					condition: { $input: "sessionId" },
					then: "update",
					else: "create",
				},
			});
			expect(dsl.log.$op).toEqual({
				$if: {
					condition: { $input: "sessionId" },
					then: "create",
					else: "create",
				},
			});
		});
	});

	describe("op.updateMany()", () => {
		it("compiles bulk update with where", () => {
			const dsl = pipeline(({ input }) => [
				op
					.updateMany("Post", {
						where: { authorId: input.userId, status: "draft" },
						data: { archived: true },
					})
					.as("posts"),
			]);

			expect(dsl).toEqual({
				posts: {
					$entity: "Post",
					$op: "update",
					$where: { authorId: { $input: "userId" }, status: "draft" },
					archived: true,
				},
			});
		});

		it("compiles bulk update with ids", () => {
			const dsl = pipeline(({ input }) => [
				op
					.updateMany("Post", {
						ids: input.postIds,
						data: { published: true },
					})
					.as("posts"),
			]);

			expect(dsl).toEqual({
				posts: {
					$entity: "Post",
					$op: "update",
					$ids: { $input: "postIds" },
					published: true,
				},
			});
		});
	});

	describe("complex scenarios", () => {
		it("compiles chat session creation pattern", () => {
			const dsl = pipeline(({ input }) => [
				// Upsert session
				when(input.sessionId)
					.then([
						op
							.update("Session", {
								id: input.sessionId,
								updatedAt: ref.now(),
							})
							.as("session"),
					])
					.else([
						op
							.create("Session", {
								title: input.title,
								createdAt: ref.now(),
							})
							.as("session"),
					]),

				// Create user message
				op
					.create("Message", {
						sessionId: ref.from("session").id,
						role: "user",
						content: input.content,
					})
					.as("userMessage"),

				// Create pending assistant message
				op
					.create("Message", {
						sessionId: ref.from("session").id,
						role: "assistant",
						status: "pending",
					})
					.as("assistantMessage"),

				// Update user stats
				op
					.update("User", {
						id: input.userId,
						messageCount: ref.increment(1),
						lastActiveAt: ref.now(),
					})
					.as("userStats"),
			]);

			expect(dsl.session.$op).toEqual({
				$if: {
					condition: { $input: "sessionId" },
					then: "update",
					else: "create",
				},
			});
			expect(dsl.userMessage.sessionId).toEqual({ $ref: "session.id" });
			expect(dsl.assistantMessage.sessionId).toEqual({ $ref: "session.id" });
			expect(dsl.userStats.messageCount).toEqual({ $increment: 1 });
		});

		it("preserves literal values", () => {
			const dsl = pipeline(({ input }) => [
				op
					.create("Message", {
						role: "user", // literal string
						priority: 1, // literal number
						draft: false, // literal boolean
						content: input.content, // input ref
					})
					.as("message"),
			]);

			expect(dsl.message).toEqual({
				$entity: "Message",
				$op: "create",
				role: "user",
				priority: 1,
				draft: false,
				content: { $input: "content" },
			});
		});
	});
});
