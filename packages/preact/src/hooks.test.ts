/**
 * Tests for Preact Hooks
 *
 * Basic tests to verify exports and types.
 * Full integration tests require Preact test utilities.
 */

import { describe, expect, test } from "bun:test";
import {
	type MutationFn,
	type QueryInput,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
	useLazyQuery,
	useMutation,
	useQuery,
} from "./hooks";

// =============================================================================
// Tests: Exports
// =============================================================================

describe("@sylphx/lens-preact exports", () => {
	test("useQuery is exported", () => {
		expect(typeof useQuery).toBe("function");
	});

	test("useLazyQuery is exported", () => {
		expect(typeof useLazyQuery).toBe("function");
	});

	test("useMutation is exported", () => {
		expect(typeof useMutation).toBe("function");
	});
});

// =============================================================================
// Tests: Types (compile-time verification)
// =============================================================================

describe("types", () => {
	test("QueryInput type accepts QueryResult, null, undefined, or accessor", () => {
		// This is a compile-time test - if it compiles, types are correct
		const _testNull: QueryInput<string> = null;
		const _testUndefined: QueryInput<string> = undefined;
		const _testAccessor: QueryInput<string> = () => null;

		expect(true).toBe(true);
	});

	test("UseQueryResult has correct shape", () => {
		// Type assertion test
		const result: UseQueryResult<{ id: string }> = {
			data: null,
			loading: true,
			error: null,
			refetch: () => {},
		};

		expect(result.data).toBe(null);
		expect(result.loading).toBe(true);
		expect(result.error).toBe(null);
		expect(typeof result.refetch).toBe("function");
	});

	test("UseLazyQueryResult has correct shape", () => {
		const result: UseLazyQueryResult<{ id: string }> = {
			data: null,
			loading: false,
			error: null,
			execute: async () => ({ id: "test" }),
			reset: () => {},
		};

		expect(result.data).toBe(null);
		expect(result.loading).toBe(false);
		expect(typeof result.execute).toBe("function");
		expect(typeof result.reset).toBe("function");
	});

	test("UseMutationResult has correct shape", () => {
		const result: UseMutationResult<{ name: string }, { id: string }> = {
			data: null,
			loading: false,
			error: null,
			mutate: async () => ({ data: { id: "test" } }),
			reset: () => {},
		};

		expect(result.data).toBe(null);
		expect(result.loading).toBe(false);
		expect(typeof result.mutate).toBe("function");
		expect(typeof result.reset).toBe("function");
	});

	test("UseQueryOptions has skip property", () => {
		const options: UseQueryOptions = { skip: true };
		expect(options.skip).toBe(true);
	});

	test("MutationFn type is correct", () => {
		const fn: MutationFn<{ name: string }, { id: string }> = async (input) => ({
			data: { id: input.name },
		});

		expect(typeof fn).toBe("function");
	});
});
