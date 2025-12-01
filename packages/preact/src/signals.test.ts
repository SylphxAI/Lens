/**
 * Tests for Preact Signals
 *
 * Basic tests to verify exports and types.
 * Full integration tests require Preact test utilities.
 */

import { describe, expect, test } from "bun:test";
import {
	createLazyQuerySignal,
	createMutationSignal,
	createQuerySignal,
	type LazyQuerySignal,
	type MutationFn,
	type MutationSignal,
	type QueryInput,
	type QuerySignal,
	type QuerySignalOptions,
} from "./signals";

// =============================================================================
// Tests: Exports
// =============================================================================

describe("@sylphx/lens-preact/signals exports", () => {
	test("createQuerySignal is exported", () => {
		expect(typeof createQuerySignal).toBe("function");
	});

	test("createLazyQuerySignal is exported", () => {
		expect(typeof createLazyQuerySignal).toBe("function");
	});

	test("createMutationSignal is exported", () => {
		expect(typeof createMutationSignal).toBe("function");
	});
});

// =============================================================================
// Tests: Types (compile-time verification)
// =============================================================================

describe("signal types", () => {
	test("QueryInput type accepts QueryResult, null, undefined, or accessor", () => {
		// This is a compile-time test - if it compiles, types are correct
		const _testNull: QueryInput<string> = null;
		const _testUndefined: QueryInput<string> = undefined;
		const _testAccessor: QueryInput<string> = () => null;

		expect(true).toBe(true);
	});

	test("QuerySignal has correct shape", () => {
		// Type assertion test - signals have .value property
		type ExpectedShape = {
			data: { value: { id: string } | null };
			loading: { value: boolean };
			error: { value: Error | null };
			refetch: () => void;
			dispose: () => void;
		};

		// If this compiles, QuerySignal has the correct shape
		const _typeCheck: QuerySignal<{ id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("LazyQuerySignal has correct shape", () => {
		type ExpectedShape = {
			data: { value: { id: string } | null };
			loading: { value: boolean };
			error: { value: Error | null };
			execute: () => Promise<{ id: string }>;
			reset: () => void;
		};

		const _typeCheck: LazyQuerySignal<{ id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("MutationSignal has correct shape", () => {
		type ExpectedShape = {
			data: { value: { id: string } | null };
			loading: { value: boolean };
			error: { value: Error | null };
			mutate: (input: { name: string }) => Promise<{ data: { id: string } }>;
			reset: () => void;
		};

		const _typeCheck: MutationSignal<{ name: string }, { id: string }> extends ExpectedShape ? true : false = true;
		expect(_typeCheck).toBe(true);
	});

	test("QuerySignalOptions has skip property", () => {
		const options: QuerySignalOptions = { skip: true };
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

describe("signal primitives", () => {
	test("createMutationSignal returns signals with initial state", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutationSignal(mockMutation);

		expect(mutation.loading.value).toBe(false);
		expect(mutation.error.value).toBe(null);
		expect(mutation.data.value).toBe(null);
		expect(typeof mutation.mutate).toBe("function");
		expect(typeof mutation.reset).toBe("function");
	});

	test("createLazyQuerySignal returns signals with initial state", () => {
		const query = createLazyQuerySignal(null);

		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBe(null);
		expect(query.data.value).toBe(null);
		expect(typeof query.execute).toBe("function");
		expect(typeof query.reset).toBe("function");
	});

	test("createQuerySignal returns signals with initial state for null input", () => {
		const query = createQuerySignal(null);

		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBe(null);
		expect(query.data.value).toBe(null);
		expect(typeof query.refetch).toBe("function");
		expect(typeof query.dispose).toBe("function");
	});

	test("createMutationSignal reset clears state", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutationSignal(mockMutation);

		// Manually set some state
		mutation.data.value = { id: "test", name: "test" };
		mutation.error.value = new Error("test error");

		// Reset should clear
		mutation.reset();

		expect(mutation.loading.value).toBe(false);
		expect(mutation.error.value).toBeNull();
		expect(mutation.data.value).toBeNull();
	});

	test("createLazyQuerySignal reset clears state", () => {
		const query = createLazyQuerySignal(null);

		// Manually set some state
		query.data.value = { id: "test" };
		query.error.value = new Error("test error");

		// Reset should clear
		query.reset();

		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBeNull();
		expect(query.data.value).toBeNull();
	});
});

// =============================================================================
// Tests: createMutationSignal - Comprehensive Coverage
// =============================================================================

describe("createMutationSignal", () => {
	test("mutate executes successfully and updates state", async () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutationSignal(mockMutation);

		expect(mutation.loading.value).toBe(false);
		expect(mutation.data.value).toBe(null);

		const promise = mutation.mutate({ name: "test" });

		// Loading should be true during execution
		expect(mutation.loading.value).toBe(true);

		const result = await promise;

		// After completion
		expect(mutation.loading.value).toBe(false);
		expect(mutation.data.value).toEqual({ id: "123", name: "test" });
		expect(mutation.error.value).toBe(null);
		expect(result.data).toEqual({ id: "123", name: "test" });
	});

	test("mutate handles errors correctly", async () => {
		const mockMutation = async (_input: { name: string }) => {
			throw new Error("Mutation failed");
		};

		const mutation = createMutationSignal(mockMutation);

		try {
			await mutation.mutate({ name: "test" });
			expect(true).toBe(false); // Should not reach here
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("Mutation failed");
		}

		// State should reflect error
		expect(mutation.loading.value).toBe(false);
		expect(mutation.error.value).toBeInstanceOf(Error);
		expect(mutation.error.value?.message).toBe("Mutation failed");
		expect(mutation.data.value).toBe(null);
	});

	test("mutate handles non-Error thrown values", async () => {
		const mockMutation = async (_input: { name: string }) => {
			throw "String error";
		};

		const mutation = createMutationSignal(mockMutation);

		try {
			await mutation.mutate({ name: "test" });
			expect(true).toBe(false); // Should not reach here
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("String error");
		}

		expect(mutation.error.value).toBeInstanceOf(Error);
		expect(mutation.error.value?.message).toBe("String error");
	});

	test("reset clears mutation state completely", () => {
		const mockMutation = async (input: { name: string }) => ({
			data: { id: "123", name: input.name },
		});

		const mutation = createMutationSignal(mockMutation);

		// Set some state manually
		mutation.data.value = { id: "456", name: "existing" };
		mutation.error.value = new Error("previous error");
		mutation.loading.value = true;

		mutation.reset();

		expect(mutation.loading.value).toBe(false);
		expect(mutation.error.value).toBe(null);
		expect(mutation.data.value).toBe(null);
	});
});

// =============================================================================
// Tests: createLazyQuerySignal - Comprehensive Coverage
// =============================================================================

describe("createLazyQuerySignal", () => {
	test("execute runs query successfully and updates state", async () => {
		const mockQuery = Promise.resolve({ id: "123", name: "test" });

		const query = createLazyQuerySignal(mockQuery);

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toBe(null);

		const promise = query.execute();

		// Loading should be true during execution
		expect(query.loading.value).toBe(true);

		const result = await promise;

		// After completion
		expect(query.loading.value).toBe(false);
		expect(query.data.value).toEqual({ id: "123", name: "test" });
		expect(query.error.value).toBe(null);
		expect(result).toEqual({ id: "123", name: "test" });
	});

	test("execute with null query returns null", async () => {
		const query = createLazyQuerySignal(null);

		const result = await query.execute();

		expect(result).toBe(null);
		expect(query.data.value).toBe(null);
		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBe(null);
	});

	test("execute with undefined query returns null", async () => {
		const query = createLazyQuerySignal(undefined);

		const result = await query.execute();

		expect(result).toBe(null);
		expect(query.data.value).toBe(null);
		expect(query.loading.value).toBe(false);
	});

	test("execute with accessor function returning null", async () => {
		const query = createLazyQuerySignal(() => null);

		const result = await query.execute();

		expect(result).toBe(null);
		expect(query.data.value).toBe(null);
		expect(query.loading.value).toBe(false);
	});

	test("execute handles query errors correctly", async () => {
		const mockQuery = Promise.reject(new Error("Query failed"));

		const query = createLazyQuerySignal(mockQuery);

		try {
			await query.execute();
			expect(true).toBe(false); // Should not reach here
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("Query failed");
		}

		// State should reflect error
		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBeInstanceOf(Error);
		expect(query.error.value?.message).toBe("Query failed");
		expect(query.data.value).toBe(null);
	});

	test("execute handles non-Error thrown values", async () => {
		const mockQuery = Promise.reject("String error");

		const query = createLazyQuerySignal(mockQuery);

		try {
			await query.execute();
			expect(true).toBe(false); // Should not reach here
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toBe("String error");
		}

		expect(query.error.value).toBeInstanceOf(Error);
		expect(query.error.value?.message).toBe("String error");
	});

	test("reset clears lazy query state", () => {
		const query = createLazyQuerySignal(null);

		// Set state manually
		query.data.value = { id: "test" };
		query.error.value = new Error("test error");
		query.loading.value = true;

		query.reset();

		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBe(null);
		expect(query.data.value).toBe(null);
	});

	test("execute with accessor function works correctly", async () => {
		const mockQuery = Promise.resolve({ id: "123", name: "from-accessor" });
		const query = createLazyQuerySignal(() => mockQuery);

		const result = await query.execute();

		expect(result).toEqual({ id: "123", name: "from-accessor" });
		expect(query.data.value).toEqual({ id: "123", name: "from-accessor" });
	});
});

// =============================================================================
// Tests: createQuerySignal - Comprehensive Coverage
// =============================================================================

describe("createQuerySignal", () => {
	test("query with skip option does not execute", () => {
		const mockQuery = {
			then: () => mockQuery,
			subscribe: () => () => {},
		};

		const query = createQuerySignal(mockQuery as any, { skip: true });

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toBe(null);
		expect(query.error.value).toBe(null);
	});

	test("query with null input and no skip", () => {
		const query = createQuerySignal(null);

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toBe(null);
		expect(query.error.value).toBe(null);
	});

	test("query with undefined input", () => {
		const query = createQuerySignal(undefined);

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toBe(null);
		expect(query.error.value).toBe(null);
	});

	test("query executes and subscribes to updates", async () => {
		let subscriber: ((value: any) => void) | null = null;

		const mockQuery = {
			then: (onSuccess: (value: any) => void) => {
				setTimeout(() => onSuccess({ id: "initial" }), 10);
				return mockQuery;
			},
			subscribe: (callback: (value: any) => void) => {
				subscriber = callback;
				return () => {
					subscriber = null;
				};
			},
		};

		const query = createQuerySignal(mockQuery as any);

		// Initially loading
		expect(query.loading.value).toBe(true);
		expect(query.data.value).toBe(null);

		// Wait for initial load
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toEqual({ id: "initial" });

		// Simulate subscription update
		if (subscriber) {
			subscriber({ id: "updated" });
		}

		expect(query.data.value).toEqual({ id: "updated" });
		expect(query.loading.value).toBe(false);

		query.dispose();
	});

	test("query handles errors during initial load", async () => {
		const mockQuery = {
			then: (_onSuccess: any, onError: (err: any) => void) => {
				setTimeout(() => onError(new Error("Load failed")), 10);
				return mockQuery;
			},
			subscribe: () => () => {},
		};

		const query = createQuerySignal(mockQuery as any);

		expect(query.loading.value).toBe(true);

		// Wait for error
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(query.loading.value).toBe(false);
		expect(query.error.value).toBeInstanceOf(Error);
		expect(query.error.value?.message).toBe("Load failed");
		expect(query.data.value).toBe(null);

		query.dispose();
	});

	test("query handles non-Error thrown during load", async () => {
		const mockQuery = {
			then: (_onSuccess: any, onError: (err: any) => void) => {
				setTimeout(() => onError("String error"), 10);
				return mockQuery;
			},
			subscribe: () => () => {},
		};

		const query = createQuerySignal(mockQuery as any);

		// Wait for error
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(query.error.value).toBeInstanceOf(Error);
		expect(query.error.value?.message).toBe("String error");

		query.dispose();
	});

	test("refetch re-subscribes to query", async () => {
		let subscribeCount = 0;
		let unsubscribeCount = 0;

		const mockQuery = {
			then: (onSuccess: (value: any) => void) => {
				setTimeout(() => onSuccess({ id: "data" }), 10);
				return mockQuery;
			},
			subscribe: () => {
				subscribeCount++;
				return () => {
					unsubscribeCount++;
				};
			},
		};

		const query = createQuerySignal(mockQuery as any);

		expect(subscribeCount).toBe(1);

		await new Promise((resolve) => setTimeout(resolve, 20));

		// Refetch should unsubscribe and resubscribe
		query.refetch();

		expect(unsubscribeCount).toBe(1);
		expect(subscribeCount).toBe(2);

		query.dispose();
	});

	test("dispose cleans up subscription", () => {
		let unsubscribed = false;

		const mockQuery = {
			then: () => mockQuery,
			subscribe: () => {
				return () => {
					unsubscribed = true;
				};
			},
		};

		const query = createQuerySignal(mockQuery as any);

		expect(unsubscribed).toBe(false);

		query.dispose();

		expect(unsubscribed).toBe(true);
	});

	test("query with accessor function tracks changes", async () => {
		let currentQuery: any = null;
		let subscribeCallCount = 0;

		const mockQuery1 = {
			then: (onSuccess: (value: any) => void) => {
				setTimeout(() => onSuccess({ id: "query1" }), 10);
				return mockQuery1;
			},
			subscribe: () => {
				subscribeCallCount++;
				return () => {};
			},
		};

		const mockQuery2 = {
			then: (onSuccess: (value: any) => void) => {
				setTimeout(() => onSuccess({ id: "query2" }), 10);
				return mockQuery2;
			},
			subscribe: () => {
				subscribeCallCount++;
				return () => {};
			},
		};

		currentQuery = mockQuery1;

		const query = createQuerySignal(() => currentQuery);

		// Initial subscription happens twice: once in setupSubscription, once in effect
		expect(subscribeCallCount).toBe(2);

		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(query.data.value).toEqual({ id: "query1" });

		// Change the query
		currentQuery = mockQuery2;

		// Trigger effect by accessing the accessor
		// Note: In a real Preact environment, this would be automatic
		// For testing, we simulate by calling refetch
		query.refetch();

		await new Promise((resolve) => setTimeout(resolve, 20));

		// Should have subscribed to new query
		expect(subscribeCallCount).toBe(3);

		query.dispose();
	});

	test("query with accessor function disposes effect and subscription", () => {
		let unsubscribeCount = 0;

		const mockQuery = {
			then: () => mockQuery,
			subscribe: () => {
				return () => {
					unsubscribeCount++;
				};
			},
		};

		const query = createQuerySignal(() => mockQuery);

		// Effect runs immediately, causing a subscription cleanup
		expect(unsubscribeCount).toBe(1);

		query.dispose();

		// Final subscription should be disposed
		expect(unsubscribeCount).toBe(2);
	});

	test("query with accessor returning null", () => {
		const query = createQuerySignal(() => null);

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toBe(null);
		expect(query.error.value).toBe(null);

		query.dispose();
	});

	test("query with accessor returning undefined", () => {
		const query = createQuerySignal(() => undefined);

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toBe(null);
		expect(query.error.value).toBe(null);

		query.dispose();
	});

	test("refetch when query is null does nothing", () => {
		const query = createQuerySignal(null);

		// Should not throw
		query.refetch();

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toBe(null);
		expect(query.error.value).toBe(null);
	});

	test("refetch with skip option does nothing", () => {
		const mockQuery = {
			then: () => mockQuery,
			subscribe: () => () => {},
		};

		const query = createQuerySignal(mockQuery as any, { skip: true });

		query.refetch();

		expect(query.loading.value).toBe(false);
		expect(query.data.value).toBe(null);
	});

	test("dispose when no subscription exists", () => {
		const query = createQuerySignal(null);

		// Should not throw
		query.dispose();

		expect(query.loading.value).toBe(false);
	});

	test("multiple refetches cleanup previous subscriptions", () => {
		let unsubscribeCount = 0;

		const mockQuery = {
			then: () => mockQuery,
			subscribe: () => {
				return () => {
					unsubscribeCount++;
				};
			},
		};

		const query = createQuerySignal(mockQuery as any);

		query.refetch();
		expect(unsubscribeCount).toBe(1);

		query.refetch();
		expect(unsubscribeCount).toBe(2);

		query.dispose();
		expect(unsubscribeCount).toBe(3);
	});
});
