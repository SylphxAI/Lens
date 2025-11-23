/**
 * Tests for resource definition and validation
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { z } from "zod";
import {
	defineResource,
	validateAllResources,
	ResourceDefinitionError,
	hasMany,
	belongsTo,
	hasOne,
	manyToMany,
	getRegistry,
} from "../resource/index";

describe("Resource Definition", () => {
	beforeEach(() => {
		// Clear registry before each test
		getRegistry().clear();
	});

	describe("Valid Definitions", () => {
		test("should define minimal resource", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
			});

			expect(User.name).toBe("user");
			expect(User.definition.name).toBe("user");
		});

		test("should define resource with relationships", () => {
			const Session = defineResource({
				name: "session",
				fields: z.object({
					id: z.string(),
				}),
			});

			const Message = defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					sessionId: z.string(),
				}),
				relationships: {
					session: belongsTo("session", { foreignKey: "sessionId" }),
				},
			});

			expect(Message.relationships.session.type).toBe("belongsTo");
			expect(Message.relationships.session.target).toBe("session");
		});

		test("should define resource with optimistic config", () => {
			const Message = defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					content: z.string(),
				}),
				optimistic: {
					idField: "id",
					apply: (draft, mutation) => {
						Object.assign(draft, mutation.data);
					},
				},
			});

			expect(Message.definition.optimistic).toBeDefined();
			expect(Message.definition.optimistic?.idField).toBe("id");
		});

		test("should define resource with hooks", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					createdAt: z.date().optional(),
				}),
				hooks: {
					beforeCreate: async (data) => ({
						...data,
						createdAt: new Date(),
					}),
				},
			});

			expect(User.definition.hooks?.beforeCreate).toBeDefined();
		});

		test("should define resource with computed fields", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					firstName: z.string(),
					lastName: z.string(),
				}),
				computed: {
					fullName: (user) => `${user.firstName} ${user.lastName}`,
				},
			});

			expect(User.definition.computed?.fullName).toBeDefined();
		});

		test("should define resource with update strategy", () => {
			const Message = defineResource({
				name: "message",
				fields: z.object({
					id: z.string(),
					content: z.string(),
				}),
				updateStrategy: "delta",
			});

			expect(Message.definition.updateStrategy).toBe("delta");
		});

		test("should define resource with custom table name", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
				tableName: "app_users",
			});

			expect(User.definition.tableName).toBe("app_users");
		});
	});

	describe("Name Validation", () => {
		test("should reject name too short", () => {
			expect(() => {
				defineResource({
					name: "u",
					fields: z.object({ id: z.string() }),
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should reject name too long", () => {
			const longName = "a".repeat(51);
			expect(() => {
				defineResource({
					name: longName,
					fields: z.object({ id: z.string() }),
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should reject non-camelCase names", () => {
			expect(() => {
				defineResource({
					name: "UserProfile", // PascalCase
					fields: z.object({ id: z.string() }),
				});
			}).toThrow(ResourceDefinitionError);

			expect(() => {
				defineResource({
					name: "user_profile", // snake_case
					fields: z.object({ id: z.string() }),
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should reject reserved names", () => {
			expect(() => {
				defineResource({
					name: "api",
					fields: z.object({ id: z.string() }),
				});
			}).toThrow(ResourceDefinitionError);

			expect(() => {
				defineResource({
					name: "query",
					fields: z.object({ id: z.string() }),
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should accept valid camelCase names", () => {
			expect(() => {
				defineResource({
					name: "userProfile",
					fields: z.object({ id: z.string() }),
				});
			}).not.toThrow();
		});
	});

	describe("Fields Validation", () => {
		test("should reject missing fields", () => {
			expect(() => {
				// @ts-expect-error - Testing validation
				defineResource({
					name: "user",
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should reject non-Zod schema fields", () => {
			expect(() => {
				defineResource({
					name: "user",
					// @ts-expect-error - Testing validation
					fields: { id: "string" },
				});
			}).toThrow(ResourceDefinitionError);
		});
	});

	describe("Relationship Validation", () => {
		test("should reject invalid relationship names", () => {
			expect(() => {
				defineResource({
					name: "message",
					fields: z.object({ id: z.string() }),
					relationships: {
						"Invalid-Name": belongsTo("session", { foreignKey: "sessionId" }),
					},
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should reject relationship missing type", () => {
			expect(() => {
				defineResource({
					name: "message",
					fields: z.object({ id: z.string() }),
					relationships: {
						// @ts-expect-error - Testing validation
						session: { target: "session", foreignKey: "sessionId" },
					},
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should reject manyToMany without through", () => {
			expect(() => {
				defineResource({
					name: "message",
					fields: z.object({ id: z.string() }),
					relationships: {
						tags: {
							type: "manyToMany",
							target: "tag",
							foreignKey: "messageId",
							// @ts-expect-error - Missing through
							targetForeignKey: "tagId",
						},
					},
				});
			}).toThrow(ResourceDefinitionError);
		});
	});

	describe("Hooks Validation", () => {
		test("should reject invalid hook names", () => {
			expect(() => {
				defineResource({
					name: "user",
					fields: z.object({ id: z.string() }),
					hooks: {
						// @ts-expect-error - Invalid hook
						invalidHook: async () => {},
					},
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should reject non-function hooks", () => {
			expect(() => {
				defineResource({
					name: "user",
					fields: z.object({ id: z.string() }),
					hooks: {
						// @ts-expect-error - Not a function
						beforeCreate: "not a function",
					},
				});
			}).toThrow(ResourceDefinitionError);
		});
	});

	describe("Optimistic Config Validation", () => {
		test("should reject optimistic without apply", () => {
			expect(() => {
				defineResource({
					name: "message",
					fields: z.object({ id: z.string() }),
					optimistic: {
						// @ts-expect-error - Missing apply
						idField: "id",
					},
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should reject non-function apply", () => {
			expect(() => {
				defineResource({
					name: "message",
					fields: z.object({ id: z.string() }),
					optimistic: {
						idField: "id",
						// @ts-expect-error - Not a function
						apply: "not a function",
					},
				});
			}).toThrow(ResourceDefinitionError);
		});
	});

	describe("Update Strategy Validation", () => {
		test("should reject invalid update strategy", () => {
			expect(() => {
				defineResource({
					name: "message",
					fields: z.object({ id: z.string() }),
					// @ts-expect-error - Invalid strategy
					updateStrategy: "invalid",
				});
			}).toThrow(ResourceDefinitionError);
		});

		test("should accept valid update strategies", () => {
			const strategies = ["auto", "value", "delta", "patch"] as const;

			for (const strategy of strategies) {
				expect(() => {
					getRegistry().clear();
					defineResource({
						name: `message${strategy}`,
						fields: z.object({ id: z.string() }),
						updateStrategy: strategy,
					});
				}).not.toThrow();
			}
		});
	});

	describe("Computed Fields Validation", () => {
		test("should reject non-function computed fields", () => {
			expect(() => {
				defineResource({
					name: "user",
					fields: z.object({ id: z.string() }),
					computed: {
						// @ts-expect-error - Not a function
						fullName: "not a function",
					},
				});
			}).toThrow(ResourceDefinitionError);
		});
	});
});
