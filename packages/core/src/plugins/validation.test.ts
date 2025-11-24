/**
 * Tests for Schema Runtime Validation Plugin
 */

import { describe, expect, test } from "bun:test";
import { validationPlugin } from "./validation";

describe("validationPlugin", () => {
	describe("client", () => {
		test("creates client instance with API", () => {
			const instance = validationPlugin.client!({});

			expect(instance.name).toBe("validation");
			expect(instance.api).toBeDefined();
			expect(typeof instance.api!.validate).toBe("function");
			expect(typeof instance.api!.addSchema).toBe("function");
		});

		test("validate returns valid for unknown entity", () => {
			const instance = validationPlugin.client!({});
			const api = instance.api as {
				validate: (entity: string, op: string, input: unknown) => { valid: boolean; errors: unknown[] };
			};

			const result = api.validate("Unknown", "create", { name: "test" });
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test("validate checks required fields", () => {
			const instance = validationPlugin.client!({
				schemas: [
					{
						entity: "User",
						operation: "create",
						fields: {
							email: { required: true },
							name: { required: true },
						},
					},
				],
			});
			const api = instance.api as {
				validate: (entity: string, op: string, input: unknown) => {
					valid: boolean;
					errors: Array<{ field: string; message: string }>;
				};
			};

			// Missing required fields
			const result = api.validate("User", "create", {});
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors.some((e) => e.field === "email")).toBe(true);
		});

		test("validate checks min/max for strings", () => {
			const instance = validationPlugin.client!({
				schemas: [
					{
						entity: "User",
						fields: {
							name: { min: 2, max: 50 },
						},
					},
				],
			});
			const api = instance.api as {
				validate: (entity: string, op: string, input: unknown) => {
					valid: boolean;
					errors: Array<{ field: string; rule: string }>;
				};
			};

			// Too short
			const result1 = api.validate("User", "create", { name: "a" });
			expect(result1.valid).toBe(false);
			expect(result1.errors.some((e) => e.field === "name" && e.rule === "min")).toBe(true);

			// Too long
			const result2 = api.validate("User", "create", { name: "a".repeat(51) });
			expect(result2.valid).toBe(false);
			expect(result2.errors.some((e) => e.field === "name" && e.rule === "max")).toBe(true);

			// Valid
			const result3 = api.validate("User", "create", { name: "John" });
			expect(result3.valid).toBe(true);
		});

		test("validate checks pattern (email)", () => {
			const instance = validationPlugin.client!({
				schemas: [
					{
						entity: "User",
						fields: {
							email: { pattern: "email" },
						},
					},
				],
			});
			const api = instance.api as {
				validate: (entity: string, op: string, input: unknown) => {
					valid: boolean;
					errors: Array<{ field: string }>;
				};
			};

			// Invalid email
			const result1 = api.validate("User", "create", { email: "invalid" });
			expect(result1.valid).toBe(false);

			// Valid email
			const result2 = api.validate("User", "create", { email: "test@example.com" });
			expect(result2.valid).toBe(true);
		});

		test("validate supports custom validator", () => {
			const instance = validationPlugin.client!({
				schemas: [
					{
						entity: "User",
						fields: {
							age: {
								validate: (value) => {
									if (typeof value !== "number") return "Age must be a number";
									if (value < 0 || value > 150) return "Age must be between 0 and 150";
									return true;
								},
							},
						},
					},
				],
			});
			const api = instance.api as {
				validate: (entity: string, op: string, input: unknown) => {
					valid: boolean;
					errors: Array<{ field: string; message: string }>;
				};
			};

			// Invalid age
			const result1 = api.validate("User", "create", { age: 200 });
			expect(result1.valid).toBe(false);
			expect(result1.errors[0].message).toBe("Age must be between 0 and 150");

			// Valid age
			const result2 = api.validate("User", "create", { age: 25 });
			expect(result2.valid).toBe(true);
		});

		test("addSchema adds new validation schema", () => {
			const instance = validationPlugin.client!({});
			const api = instance.api as {
				addSchema: (schema: { entity: string; fields: Record<string, unknown> }) => void;
				validate: (entity: string, op: string, input: unknown) => { valid: boolean };
			};

			// Initially no schema
			expect(api.validate("Post", "create", {}).valid).toBe(true);

			// Add schema
			api.addSchema({
				entity: "Post",
				fields: {
					title: { required: true },
				},
			});

			// Now validates
			expect(api.validate("Post", "create", {}).valid).toBe(false);
			expect(api.validate("Post", "create", { title: "Hello" }).valid).toBe(true);
		});

		test("removeSchema removes validation schema", () => {
			const instance = validationPlugin.client!({
				schemas: [
					{
						entity: "Post",
						fields: { title: { required: true } },
					},
				],
			});
			const api = instance.api as {
				removeSchema: (entity: string) => void;
				validate: (entity: string, op: string, input: unknown) => { valid: boolean };
			};

			// Initially has schema
			expect(api.validate("Post", "create", {}).valid).toBe(false);

			// Remove schema
			api.removeSchema("Post");

			// No longer validates
			expect(api.validate("Post", "create", {}).valid).toBe(true);
		});
	});

	describe("server", () => {
		test("creates server instance with API", () => {
			const instance = validationPlugin.server!({});

			expect(instance.name).toBe("validation");
			expect(instance.api).toBeDefined();
		});

		test("getSchema returns schema for entity", () => {
			const instance = validationPlugin.server!({
				schemas: [
					{
						entity: "User",
						operation: "create",
						fields: { email: { required: true } },
					},
				],
			});
			const api = instance.api as {
				getSchema: (entity: string, op?: string) => { entity: string; fields: Record<string, unknown> } | undefined;
			};

			const schema = api.getSchema("User", "create");
			expect(schema).toBeDefined();
			expect(schema?.entity).toBe("User");
		});
	});

	describe("built-in patterns", () => {
		const instance = validationPlugin.client!({
			schemas: [
				{
					entity: "Test",
					fields: {
						email: { pattern: "email" },
						url: { pattern: "url" },
						uuid: { pattern: "uuid" },
						slug: { pattern: "slug" },
					},
				},
			],
		});
		const api = instance.api as {
			validate: (entity: string, op: string, input: unknown) => { valid: boolean };
		};

		test("email pattern", () => {
			expect(api.validate("Test", "create", { email: "test@example.com" }).valid).toBe(true);
			expect(api.validate("Test", "create", { email: "invalid" }).valid).toBe(false);
		});

		test("url pattern", () => {
			expect(api.validate("Test", "create", { url: "https://example.com" }).valid).toBe(true);
			expect(api.validate("Test", "create", { url: "not-a-url" }).valid).toBe(false);
		});

		test("uuid pattern", () => {
			expect(api.validate("Test", "create", { uuid: "550e8400-e29b-41d4-a716-446655440000" }).valid).toBe(true);
			expect(api.validate("Test", "create", { uuid: "not-a-uuid" }).valid).toBe(false);
		});

		test("slug pattern", () => {
			expect(api.validate("Test", "create", { slug: "my-blog-post" }).valid).toBe(true);
			expect(api.validate("Test", "create", { slug: "Invalid Slug!" }).valid).toBe(false);
		});
	});
});
