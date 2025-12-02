/**
 * @sylphx/lens-core - Compression Tests
 */

import { describe, expect, it } from "bun:test";
import {
	compressIfNeeded,
	DEFAULT_COMPRESSION_CONFIG,
	decompressIfNeeded,
	formatCompressionStats,
	getCompressionRatio,
	getSpaceSaved,
	isCompressionSupported,
} from "./compression.js";
import type { CompressedPayload } from "./types.js";
import { isCompressedPayload } from "./types.js";

// =============================================================================
// Tests
// =============================================================================

describe("compression", () => {
	describe("isCompressionSupported", () => {
		it("returns boolean", () => {
			const result = isCompressionSupported();
			expect(typeof result).toBe("boolean");
		});
	});

	describe("compressIfNeeded", () => {
		it("returns original data when disabled", async () => {
			const data = { name: "test", value: "x".repeat(2000) };
			const result = await compressIfNeeded(data, { enabled: false });

			expect(result).toEqual(data);
			expect(isCompressedPayload(result)).toBe(false);
		});

		it("returns original data when below threshold", async () => {
			const data = { name: "test" };
			const result = await compressIfNeeded(data, { threshold: 1000 });

			expect(result).toEqual(data);
			expect(isCompressedPayload(result)).toBe(false);
		});

		it("compresses large data when above threshold", async () => {
			// Create a large, compressible payload
			const data = {
				name: "test",
				items: Array(100)
					.fill(null)
					.map((_, i) => ({
						id: i,
						value: "repeated_value_that_compresses_well",
						description: "This is a description that repeats",
					})),
			};

			const result = await compressIfNeeded(data, { threshold: 100 });

			// Should be compressed
			if (isCompressionSupported()) {
				expect(isCompressedPayload(result)).toBe(true);
				if (isCompressedPayload(result)) {
					expect(result.compressed).toBe(true);
					expect(result.algorithm).toBe("gzip");
					expect(typeof result.data).toBe("string");
					expect(result.originalSize).toBeGreaterThan(0);
					expect(result.compressedSize).toBeGreaterThan(0);
					// Compression should reduce size for repetitive data
					expect(result.compressedSize).toBeLessThan(result.originalSize);
				}
			} else {
				// No compression support, should return original
				expect(result).toEqual(data);
			}
		});

		it("returns original if compression doesn't reduce size", async () => {
			// Random data that doesn't compress well
			const randomData = Array(100)
				.fill(null)
				.map(() => Math.random().toString(36))
				.join("");

			const data = { random: randomData };
			const result = await compressIfNeeded(data, { threshold: 10 });

			// Might return original if compression doesn't help
			// Either way, it should be valid
			if (isCompressedPayload(result)) {
				expect(result.compressedSize).toBeLessThan(result.originalSize);
			} else {
				expect(result).toEqual(data);
			}
		});

		it("uses specified algorithm", async () => {
			const data = { value: "x".repeat(2000) };
			const result = await compressIfNeeded(data, {
				threshold: 100,
				algorithm: "deflate",
			});

			if (isCompressionSupported() && isCompressedPayload(result)) {
				expect(result.algorithm).toBe("deflate");
			}
		});
	});

	describe("decompressIfNeeded", () => {
		it("returns original data if not compressed", async () => {
			const data = { name: "test", value: 123 };
			const result = await decompressIfNeeded(data);

			expect(result).toEqual(data);
		});

		it("decompresses compressed payload", async () => {
			const originalData = {
				name: "test",
				items: Array(50)
					.fill(null)
					.map((_, i) => ({ id: i, value: "test" })),
			};

			// Compress first
			const compressed = await compressIfNeeded(originalData, { threshold: 100 });

			if (isCompressedPayload(compressed)) {
				// Now decompress
				const decompressed = await decompressIfNeeded(compressed);
				expect(decompressed).toEqual(originalData);
			}
		});

		it("round-trips data correctly", async () => {
			const testCases = [
				{ simple: "value" },
				{ nested: { deep: { value: true } } },
				{ array: [1, 2, 3, "string", null] },
				{ unicode: "你好世界 🌍" },
				{
					large: Array(100)
						.fill(null)
						.map((_, i) => ({
							id: i,
							name: `Item ${i}`,
							description: "A longer description that will compress well",
						})),
				},
			];

			for (const data of testCases) {
				const compressed = await compressIfNeeded(data, { threshold: 10 });
				const decompressed = await decompressIfNeeded(compressed);
				expect(decompressed).toEqual(data);
			}
		});
	});

	describe("statistics functions", () => {
		it("getCompressionRatio calculates correctly", () => {
			const payload: CompressedPayload = {
				compressed: true,
				algorithm: "gzip",
				data: "test",
				originalSize: 1000,
				compressedSize: 250,
			};

			expect(getCompressionRatio(payload)).toBe(0.25);
		});

		it("getCompressionRatio handles zero original size", () => {
			const payload: CompressedPayload = {
				compressed: true,
				algorithm: "gzip",
				data: "",
				originalSize: 0,
				compressedSize: 0,
			};

			expect(getCompressionRatio(payload)).toBe(1);
		});

		it("getSpaceSaved calculates correctly", () => {
			const payload: CompressedPayload = {
				compressed: true,
				algorithm: "gzip",
				data: "test",
				originalSize: 1000,
				compressedSize: 250,
			};

			expect(getSpaceSaved(payload)).toBe(750);
		});

		it("formatCompressionStats formats correctly", () => {
			const payload: CompressedPayload = {
				compressed: true,
				algorithm: "gzip",
				data: "test",
				originalSize: 1000,
				compressedSize: 250,
			};

			const stats = formatCompressionStats(payload);

			expect(stats).toContain("gzip");
			expect(stats).toContain("1000B");
			expect(stats).toContain("250B");
			expect(stats).toContain("75.0%");
			expect(stats).toContain("750B");
		});
	});

	describe("DEFAULT_COMPRESSION_CONFIG", () => {
		it("has expected defaults", () => {
			expect(DEFAULT_COMPRESSION_CONFIG.enabled).toBe(true);
			expect(DEFAULT_COMPRESSION_CONFIG.threshold).toBe(1024);
			expect(DEFAULT_COMPRESSION_CONFIG.algorithm).toBe("gzip");
		});
	});

	describe("edge cases", () => {
		it("handles empty object", async () => {
			const data = {};
			const compressed = await compressIfNeeded(data);
			const decompressed = await decompressIfNeeded(compressed);
			expect(decompressed).toEqual(data);
		});

		it("handles empty array", async () => {
			const data: unknown[] = [];
			const compressed = await compressIfNeeded(data);
			const decompressed = await decompressIfNeeded(compressed);
			expect(decompressed).toEqual(data);
		});

		it("handles null values", async () => {
			const data = { value: null };
			const compressed = await compressIfNeeded(data);
			const decompressed = await decompressIfNeeded(compressed);
			expect(decompressed).toEqual(data);
		});

		it("handles deeply nested structures", async () => {
			const data = {
				level1: {
					level2: {
						level3: {
							level4: {
								level5: {
									value: "deep",
									array: [1, 2, { nested: true }],
								},
							},
						},
					},
				},
			};

			const compressed = await compressIfNeeded(data);
			const decompressed = await decompressIfNeeded(compressed);
			expect(decompressed).toEqual(data);
		});

		it("handles special characters", async () => {
			const data = {
				special: '<script>alert("xss")</script>',
				quotes: "\"quoted\" and 'single'",
				newlines: "line1\nline2\r\nline3",
				tabs: "col1\tcol2\tcol3",
				backslash: "path\\to\\file",
			};

			const compressed = await compressIfNeeded(data, { threshold: 10 });
			const decompressed = await decompressIfNeeded(compressed);
			expect(decompressed).toEqual(data);
		});
	});
});
