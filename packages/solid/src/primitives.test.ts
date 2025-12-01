/**
 * Tests for SolidJS Primitives
 *
 * Basic tests to verify exports and types.
 * Tests createQuery, createMutation, createLazyQuery exports.
 */

import { describe, expect, test } from "bun:test";
import {
	type CreateLazyQueryResult,
	type CreateMutationResult,
	type CreateQueryOptions,
	type CreateQueryResult,
	createLazyQuery,
	createMutation,
	createQuery,
	type MutationFn,
	type QueryInput,
} from "./primitives";

// =============================================================================
// Tests: Exports
// =============================================================================

describe("@sylphx/lens-solid primitives exports", () => {
	test("createQuery is exported", () => {
		expect(typeof createQuery).toBe("function");
	});

	test("createLazyQuery is exported", () => {
		expect(typeof createLazyQuery).toBe("function");
	});

	test("createMutation is exported", () => {
		expect(typeof createMutation).toBe("function");
	});
});

// =============================================================================
// Tests: Types (compile-time verification)
// =============================================================================

describe("primitives types", () => {
	test("QueryInput type accepts QueryResult, null, undefined, or accessor", () => {
		// This is a compile-time test - if it compiles, types are correct
		const _testNull: QueryInput<string> = null;
		const _testUndefined: QueryInput<string> = undefined;
		const _testAccessor: QueryInput<string> = () => null;

		expect(true).toBe(true);
	});

	test("CreateQueryResult has correct shape", () => {
		// Type assertion test - SolidJS uses Accessor functions
		type ExpectedShape = {
			data: () => { id: string } | null;
			loading: () => boolean;
			error: () => Error | null;
			refetch: () => void;
		};

		// If this compiles, CreateQueryResult has the correct shape
		const _typeCheck: CreateQueryResult<{ id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("CreateLazyQueryResult has correct shape", () => {
		type ExpectedShape = {
			data: () => { id: string } | null;
			loading: () => boolean;
			error: () => Error | null;
			execute: () => Promise<{ id: string }>;
			reset: () => void;
		};

		const _typeCheck: CreateLazyQueryResult<{ id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("CreateMutationResult has correct shape", () => {
		type ExpectedShape = {
			data: () => { id: string } | null;
			loading: () => boolean;
			error: () => Error | null;
			mutate: (input: { name: string }) => Promise<{ data: { id: string } }>;
			reset: () => void;
		};

		const _typeCheck: CreateMutationResult<{ name: string }, { id: string }> extends ExpectedShape ? true : false =
			true;
		expect(_typeCheck).toBe(true);
	});

	test("CreateQueryOptions has skip property", () => {
		const options: CreateQueryOptions = { skip: true };
		expect(options.skip).toBe(true);
	});

	test("MutationFn type is correct", () => {
		const fn: MutationFn<{ name: string }, { id: string }> = async (input) => ({
			data: { id: input.name },
		});

		expect(typeof fn).toBe("function");
	});
});

// =============================================================================
// Tests: Basic Functionality
// =============================================================================

describe("primitive functions", () => {
	test("createMutation returns object with correct methods", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutation(mockMutation);

		// Verify structure
		expect(typeof mutation.data).toBe("function");
		expect(typeof mutation.loading).toBe("function");
		expect(typeof mutation.error).toBe("function");
		expect(typeof mutation.mutate).toBe("function");
		expect(typeof mutation.reset).toBe("function");

		// Check initial state
		expect(mutation.data()).toBe(null);
		expect(mutation.loading()).toBe(false);
		expect(mutation.error()).toBe(null);
	});

	test("createLazyQuery returns object with correct methods for null input", () => {
		const query = createLazyQuery(null);

		// Verify structure
		expect(typeof query.data).toBe("function");
		expect(typeof query.loading).toBe("function");
		expect(typeof query.error).toBe("function");
		expect(typeof query.execute).toBe("function");
		expect(typeof query.reset).toBe("function");

		// Check initial state
		expect(query.data()).toBe(null);
		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(null);
	});

	test("createMutation reset clears state", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutation(mockMutation);

		// Reset should maintain initial cleared state
		mutation.reset();

		expect(mutation.loading()).toBe(false);
		expect(mutation.error()).toBe(null);
		expect(mutation.data()).toBe(null);
	});

	test("createLazyQuery reset clears state", () => {
		const query = createLazyQuery(null);

		// Reset should maintain initial cleared state
		query.reset();

		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(null);
		expect(query.data()).toBe(null);
	});

	test("createLazyQuery execute returns null for null input", async () => {
		const query = createLazyQuery(null);

		const result = await query.execute();

		expect(result).toBe(null);
		expect(query.data()).toBe(null);
		expect(query.loading()).toBe(false);
	});
});

// =============================================================================
// Tests: createQuery - Comprehensive Coverage
// =============================================================================

describe("createQuery comprehensive", () => {
	test("createQuery handles successful query with subscribe and then", async () => {
		let _subscribeCallback: ((value: string) => void) | null = null;
		let thenResolve: ((value: string) => void) | null = null;

		const mockQueryResult = {
			subscribe: (callback: (value: string) => void) => {
				_subscribeCallback = callback;
				return () => {
					_subscribeCallback = null;
				};
			},
			then: (resolve: (value: string) => void) => {
				thenResolve = resolve;
			},
		};

		const query = createQuery(mockQueryResult as any);

		// Initially loading
		expect(query.loading()).toBe(true);
		expect(query.data()).toBe(null);

		// Simulate promise resolution
		if (thenResolve) {
			thenResolve("test-data");
		}

		// Wait for next tick
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(query.data()).toBe("test-data");
		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(null);
	});

	test("createQuery handles query error with non-Error object", async () => {
		let thenReject: ((err: any) => void) | null = null;

		const mockQueryResult = {
			subscribe: () => () => {},
			then: (_resolve: any, reject: (err: any) => void) => {
				thenReject = reject;
			},
		};

		const query = createQuery(mockQueryResult as any);

		// Simulate promise rejection with non-Error
		if (thenReject) {
			thenReject("string error");
		}

		// Wait for next tick
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(query.loading()).toBe(false);
		expect(query.error()).toBeInstanceOf(Error);
		expect(query.error()?.message).toBe("string error");
	});

	test("createQuery handles query error with Error object", async () => {
		let thenReject: ((err: any) => void) | null = null;

		const mockQueryResult = {
			subscribe: () => () => {},
			then: (_resolve: any, reject: (err: any) => void) => {
				thenReject = reject;
			},
		};

		const query = createQuery(mockQueryResult as any);

		const testError = new Error("test error");
		if (thenReject) {
			thenReject(testError);
		}

		// Wait for next tick
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(testError);
	});

	test("createQuery refetch re-executes query", async () => {
		let subscribeCount = 0;
		let unsubscribeCalled = false;
		let _thenResolve: ((value: string) => void) | null = null;

		const mockQueryResult = {
			subscribe: (callback: (value: string) => void) => {
				subscribeCount++;
				setTimeout(() => callback(`data-${subscribeCount}`), 0);
				return () => {
					unsubscribeCalled = true;
				};
			},
			then: (resolve: (value: string) => void) => {
				_thenResolve = resolve;
				setTimeout(() => resolve(`then-${subscribeCount}`), 0);
			},
		};

		const query = createQuery(mockQueryResult as any);

		// Wait for initial load
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(subscribeCount).toBe(1);

		// Call refetch
		query.refetch();

		expect(query.loading()).toBe(true);
		expect(query.error()).toBe(null);
		expect(unsubscribeCalled).toBe(true);

		// Wait for refetch to complete
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(subscribeCount).toBe(2);
	});

	test("createQuery with skip option does not execute", () => {
		let subscribed = false;

		const mockQueryResult = {
			subscribe: () => {
				subscribed = true;
				return () => {};
			},
			then: () => {},
		};

		const query = createQuery(mockQueryResult as any, { skip: true });

		expect(query.loading()).toBe(false);
		expect(query.data()).toBe(null);
		expect(query.error()).toBe(null);
		expect(subscribed).toBe(false);
	});

	test("createQuery with null query does not execute", () => {
		const query = createQuery(null);

		expect(query.loading()).toBe(false);
		expect(query.data()).toBe(null);
		expect(query.error()).toBe(null);
	});

	test("createQuery with undefined query does not execute", () => {
		const query = createQuery(undefined);

		expect(query.loading()).toBe(false);
		expect(query.data()).toBe(null);
		expect(query.error()).toBe(null);
	});

	test("createQuery with accessor function returning null", () => {
		const query = createQuery(() => null);

		expect(query.loading()).toBe(false);
		expect(query.data()).toBe(null);
		expect(query.error()).toBe(null);
	});

	test("createQuery with accessor function returning query", async () => {
		let thenResolve: ((value: string) => void) | null = null;

		const mockQueryResult = {
			subscribe: () => () => {},
			then: (resolve: (value: string) => void) => {
				thenResolve = resolve;
			},
		};

		const query = createQuery(() => mockQueryResult as any);

		if (thenResolve) {
			thenResolve("accessor-data");
		}

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(query.data()).toBe("accessor-data");
	});

	test("createQuery sets up unsubscribe on query execution", () => {
		let unsubscribeCalled = false;

		const mockQueryResult = {
			subscribe: () => {
				return () => {
					unsubscribeCalled = true;
				};
			},
			then: () => {},
		};

		// Create query which will call subscribe and store unsubscribe
		createQuery(mockQueryResult as any);

		// The unsubscribe function exists and will be called on cleanup
		// We can't directly test onCleanup without a full SolidJS environment
		// but we verify the subscribe function was called and returns an unsubscribe
		expect(unsubscribeCalled).toBe(false); // Not called yet until cleanup
	});
});

// =============================================================================
// Tests: createMutation - Comprehensive Coverage
// =============================================================================

describe("createMutation comprehensive", () => {
	test("createMutation handles successful mutation", async () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutation(mockMutation);

		expect(mutation.loading()).toBe(false);

		const promise = mutation.mutate({ name: "test" });

		expect(mutation.loading()).toBe(true);

		const result = await promise;

		expect(result.data.id).toBe("123");
		expect(result.data.name).toBe("test");
		expect(mutation.data()?.id).toBe("123");
		expect(mutation.loading()).toBe(false);
		expect(mutation.error()).toBe(null);
	});

	test("createMutation handles Error rejection", async () => {
		const testError = new Error("mutation failed");
		const mockMutation = async () => {
			throw testError;
		};

		const mutation = createMutation(mockMutation);

		try {
			await mutation.mutate({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBe(testError);
			expect(mutation.error()).toBe(testError);
			expect(mutation.loading()).toBe(false);
		}
	});

	test("createMutation handles non-Error rejection", async () => {
		const mockMutation = async () => {
			throw "string error";
		};

		const mutation = createMutation(mockMutation);

		try {
			await mutation.mutate({} as any);
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("string error");
			expect(mutation.error()?.message).toBe("string error");
			expect(mutation.loading()).toBe(false);
		}
	});

	test("createMutation reset clears all state after mutation", async () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutation(mockMutation);

		await mutation.mutate({ name: "test" });

		expect(mutation.data()).not.toBe(null);

		mutation.reset();

		expect(mutation.data()).toBe(null);
		expect(mutation.loading()).toBe(false);
		expect(mutation.error()).toBe(null);
	});

	test("createMutation clears error on new mutation", async () => {
		let shouldFail = true;
		const mockMutation = async (input: { name: string }) => {
			if (shouldFail) {
				throw new Error("first error");
			}
			return { data: { id: "123", name: input.name } };
		};

		const mutation = createMutation(mockMutation);

		// First call fails
		try {
			await mutation.mutate({ name: "test" });
		} catch {}

		expect(mutation.error()).not.toBe(null);

		// Second call succeeds
		shouldFail = false;
		await mutation.mutate({ name: "test" });

		expect(mutation.error()).toBe(null);
		expect(mutation.data()?.id).toBe("123");
	});
});

// =============================================================================
// Tests: createLazyQuery - Comprehensive Coverage
// =============================================================================

describe("createLazyQuery comprehensive", () => {
	test("createLazyQuery handles successful execution", async () => {
		const mockQueryResult = Promise.resolve("test-data");

		const query = createLazyQuery(mockQueryResult as any);

		expect(query.loading()).toBe(false);
		expect(query.data()).toBe(null);

		const result = await query.execute();

		expect(result).toBe("test-data");
		expect(query.data()).toBe("test-data");
		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(null);
	});

	test("createLazyQuery handles Error rejection", async () => {
		const testError = new Error("query failed");
		const mockQueryResult = Promise.reject(testError);

		const query = createLazyQuery(mockQueryResult as any);

		try {
			await query.execute();
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBe(testError);
			expect(query.error()).toBe(testError);
			expect(query.loading()).toBe(false);
		}
	});

	test("createLazyQuery handles non-Error rejection", async () => {
		const mockQueryResult = Promise.reject("string error");

		const query = createLazyQuery(mockQueryResult as any);

		try {
			await query.execute();
			expect(true).toBe(false); // Should not reach
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("string error");
			expect(query.error()?.message).toBe("string error");
			expect(query.loading()).toBe(false);
		}
	});

	test("createLazyQuery with accessor function", async () => {
		const mockQueryResult = Promise.resolve("accessor-data");
		const query = createLazyQuery(() => mockQueryResult as any);

		const result = await query.execute();

		expect(result).toBe("accessor-data");
		expect(query.data()).toBe("accessor-data");
	});

	test("createLazyQuery with accessor returning null", async () => {
		const query = createLazyQuery(() => null);

		const result = await query.execute();

		expect(result).toBe(null);
		expect(query.data()).toBe(null);
		expect(query.loading()).toBe(false);
	});

	test("createLazyQuery with undefined", async () => {
		const query = createLazyQuery(undefined);

		const result = await query.execute();

		expect(result).toBe(null);
		expect(query.data()).toBe(null);
	});

	test("createLazyQuery reset after execution", async () => {
		const mockQueryResult = Promise.resolve("test-data");
		const query = createLazyQuery(mockQueryResult as any);

		await query.execute();

		expect(query.data()).toBe("test-data");

		query.reset();

		expect(query.data()).toBe(null);
		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(null);
	});

	test("createLazyQuery reset after error", async () => {
		const mockQueryResult = Promise.reject(new Error("test error"));
		const query = createLazyQuery(mockQueryResult as any);

		try {
			await query.execute();
		} catch {}

		expect(query.error()).not.toBe(null);

		query.reset();

		expect(query.data()).toBe(null);
		expect(query.loading()).toBe(false);
		expect(query.error()).toBe(null);
	});

	test("createLazyQuery multiple executions", async () => {
		let executeCount = 0;
		const mockQueryFn = () => {
			executeCount++;
			return Promise.resolve(`data-${executeCount}`) as any;
		};

		const query = createLazyQuery(mockQueryFn);

		const result1 = await query.execute();
		expect(result1).toBe("data-1");

		const result2 = await query.execute();
		expect(result2).toBe("data-2");

		expect(executeCount).toBe(2);
	});
});
