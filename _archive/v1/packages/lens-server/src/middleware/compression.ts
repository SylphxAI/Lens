/**
 * Compression middleware
 *
 * Supports brotli and gzip compression
 */

import { brotliCompressSync, gzipSync } from "node:zlib";

export interface CompressionConfig {
	enabled: boolean;
	algorithm: "brotli" | "gzip";
	threshold: number;
}

/**
 * Check if payload should be compressed
 */
export function shouldCompress(
	data: Buffer,
	config: CompressionConfig
): boolean {
	return config.enabled && data.length >= config.threshold;
}

/**
 * Compress data
 */
export async function compress(
	data: Buffer,
	algorithm: "brotli" | "gzip"
): Promise<Buffer> {
	if (algorithm === "brotli") {
		return brotliCompressSync(data);
	} else {
		return gzipSync(data);
	}
}
