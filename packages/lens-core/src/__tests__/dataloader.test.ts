/**
 * Tests for DataLoader
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { DataLoader, createDataLoaderFactory } from "../loader/index";

describe("DataLoader", () => {
	describe("Basic Loading", () => {
		test("should load single value", async () => {
			const batchFn = async (keys: readonly number[]) => {
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);
			const result = await loader.load(5);

			expect(result).toBe(10);
		});

		test("should batch multiple loads", async () => {
			let batchCount = 0;
			const batchFn = async (keys: readonly number[]) => {
				batchCount++;
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);

			const results = await Promise.all([
				loader.load(1),
				loader.load(2),
				loader.load(3),
			]);

			expect(results).toEqual([2, 4, 6]);
			expect(batchCount).toBe(1); // All loads batched into single call
		});

		test("should load many values", async () => {
			const batchFn = async (keys: readonly number[]) => {
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);
			const results = await loader.loadMany([1, 2, 3]);

			expect(results).toEqual([2, 4, 6]);
		});
	});

	describe("Caching", () => {
		test("should cache loaded values", async () => {
			let batchCount = 0;
			const batchFn = async (keys: readonly number[]) => {
				batchCount++;
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);

			const result1 = await loader.load(5);
			const result2 = await loader.load(5); // Should use cache

			expect(result1).toBe(10);
			expect(result2).toBe(10);
			expect(batchCount).toBe(1); // Only one batch call
		});

		test("should clear cache for specific key", async () => {
			let batchCount = 0;
			const batchFn = async (keys: readonly number[]) => {
				batchCount++;
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);

			await loader.load(5);
			loader.clear(5);
			await loader.load(5); // Should trigger new batch

			expect(batchCount).toBe(2);
		});

		test("should clear all cache", async () => {
			let batchCount = 0;
			const batchFn = async (keys: readonly number[]) => {
				batchCount++;
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);

			await Promise.all([loader.load(1), loader.load(2), loader.load(3)]);
			loader.clearAll();
			await Promise.all([loader.load(1), loader.load(2), loader.load(3)]);

			expect(batchCount).toBe(2);
		});

		test("should disable caching when cache=false", async () => {
			let batchCount = 0;
			const batchFn = async (keys: readonly number[]) => {
				batchCount++;
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn, { cache: false });

			await loader.load(5);
			await loader.load(5); // Should trigger new batch

			expect(batchCount).toBe(2);
		});

		test("should prime cache", async () => {
			let batchCount = 0;
			const batchFn = async (keys: readonly number[]) => {
				batchCount++;
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);

			loader.prime(5, 100);
			const result = await loader.load(5); // Should use primed value

			expect(result).toBe(100);
			expect(batchCount).toBe(0); // No batch call
		});
	});

	describe("Error Handling", () => {
		test("should handle individual errors", async () => {
			const batchFn = async (keys: readonly number[]) => {
				return keys.map((key) => {
					if (key === 2) {
						return new Error("Error for key 2");
					}
					return key * 2;
				});
			};

			const loader = new DataLoader(batchFn);

			const results = await loader.loadMany([1, 2, 3]);

			expect(results[0]).toBe(2);
			expect(results[1]).toBeInstanceOf(Error);
			expect(results[2]).toBe(6);
		});

		test("should handle batch errors", async () => {
			const batchFn = async (keys: readonly number[]) => {
				throw new Error("Batch failed");
			};

			const loader = new DataLoader(batchFn);

			await expect(loader.load(1)).rejects.toThrow("Batch failed");
		});

		test("should clear cache on error", async () => {
			let shouldFail = true;
			const batchFn = async (keys: readonly number[]) => {
				if (shouldFail) {
					throw new Error("Batch failed");
				}
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);

			await expect(loader.load(1)).rejects.toThrow("Batch failed");

			shouldFail = false;
			const result = await loader.load(1); // Should retry after error

			expect(result).toBe(2);
		});
	});

	describe("Batch Options", () => {
		test("should respect maxBatchSize", async () => {
			let batchSizes: number[] = [];
			const batchFn = async (keys: readonly number[]) => {
				batchSizes.push(keys.length);
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn, { maxBatchSize: 2 });

			await Promise.all([
				loader.load(1),
				loader.load(2),
				loader.load(3),
				loader.load(4),
				loader.load(5),
			]);

			// Should split into batches of max size 2
			expect(batchSizes).toEqual([2, 2, 1]);
		});

		test("should support delayed batching", async () => {
			let batchCount = 0;
			const batchFn = async (keys: readonly number[]) => {
				batchCount++;
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn, { batchWindowMs: 10 });

			const promise1 = loader.load(1);
			await new Promise((resolve) => setTimeout(resolve, 20));
			const promise2 = loader.load(2); // Should be in separate batch

			await Promise.all([promise1, promise2]);

			expect(batchCount).toBe(2); // Two separate batches
		});
	});

	describe("Order Preservation", () => {
		test("should preserve order of results", async () => {
			const batchFn = async (keys: readonly number[]) => {
				// Simulate async processing that might return out of order
				// But batch function MUST return results in same order as keys
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);

			// Request in specific order
			const promise1 = loader.load(3);
			const promise2 = loader.load(1);
			const promise3 = loader.load(2);

			const results = await Promise.all([promise1, promise2, promise3]);

			// Should get results matching the keys requested
			expect(results).toEqual([6, 2, 4]);
		});

		test("should handle batch function returning results in correct order", async () => {
			const batchFn = async (keys: readonly number[]) => {
				// Batch function receives keys in request order: [1, 2, 3]
				// Must return results in same order
				return keys.map((key) => key * 2);
			};

			const loader = new DataLoader(batchFn);

			const results = await Promise.all([
				loader.load(1),
				loader.load(2),
				loader.load(3),
			]);

			expect(results).toEqual([2, 4, 6]);
		});
	});
});

describe("ResourceDataLoaderFactory", () => {
	describe("Loader Creation", () => {
		test("should create loader factory", () => {
			const factory = createDataLoaderFactory();
			expect(factory).toBeDefined();
		});

		test("should clear all loaders", async () => {
			const factory = createDataLoaderFactory();
			// Implementation depends on database adapter
			// Just test that it doesn't throw
			expect(() => factory.clearAll()).not.toThrow();
		});
	});

	// Note: Full ResourceDataLoaderFactory tests require database adapter
	// These tests would be part of integration tests with actual database
});

describe("Performance", () => {
	test("should batch large number of requests efficiently", async () => {
		let batchCount = 0;
		const batchFn = async (keys: readonly number[]) => {
			batchCount++;
			return keys.map((key) => key * 2);
		};

		const loader = new DataLoader(batchFn);

		const promises: Promise<number>[] = [];
		for (let i = 0; i < 1000; i++) {
			promises.push(loader.load(i));
		}

		const results = await Promise.all(promises);

		expect(results).toHaveLength(1000);
		expect(batchCount).toBe(1); // All requests batched into single call
	});

	test("should handle concurrent batches", async () => {
		const batchFn = async (keys: readonly number[]) => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return keys.map((key) => key * 2);
		};

		const loader = new DataLoader(batchFn, { cache: false });

		// First batch
		const batch1 = Promise.all([loader.load(1), loader.load(2)]);

		// Wait for first batch to start processing
		await new Promise((resolve) => setTimeout(resolve, 5));

		// Second batch (should be separate)
		const batch2 = Promise.all([loader.load(3), loader.load(4)]);

		const [results1, results2] = await Promise.all([batch1, batch2]);

		expect(results1).toEqual([2, 4]);
		expect(results2).toEqual([6, 8]);
	});
});
