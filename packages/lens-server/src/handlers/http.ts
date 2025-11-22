/**
 * HTTP handler for Lens server
 *
 * Handles HTTP requests for queries and mutations
 */

import type { LensObject, LensRequest } from "@sylphx/lens-core";
import type { LensServerConfig } from "../server.js";
import { executeRequest } from "./execute.js";
import { compress, shouldCompress } from "../middleware/compression.js";

export interface HTTPRequest {
	method: string;
	url: string;
	headers: Record<string, string>;
	body?: any;
}

export interface HTTPResponse {
	status: number;
	headers: Record<string, string>;
	body: any;
}

/**
 * Create HTTP handler for Express/Node.js
 */
export function createHTTPHandler<T extends LensObject<any>>(
	api: T,
	config?: LensServerConfig
) {
	return async (req: any, res: any): Promise<void> => {
		try {
			// 1. Parse request
			const lensRequest = await parseHTTPRequest(req);

			// 2. Execute request (validation, execution, field selection)
			const result = await executeRequest(api, lensRequest, config);

			// 3. Prepare response
			let body = JSON.stringify(result);
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			// 4. Compress if configured
			if (config?.compression?.enabled) {
				const bodyBytes = Buffer.from(body, "utf-8");
				if (shouldCompress(bodyBytes, config.compression)) {
					const compressed = await compress(bodyBytes, config.compression.algorithm);
					body = compressed.toString("base64");
					headers["Content-Encoding"] = config.compression.algorithm;
				}
			}

			// 5. Send response
			res.writeHead(200, headers);
			res.end(body);
		} catch (error: any) {
			// Error response
			const errorResponse = {
				error: {
					message: error.message || "Internal server error",
					code: error.code || "INTERNAL_ERROR",
				},
			};

			res.writeHead(error.statusCode || 500, {
				"Content-Type": "application/json",
			});
			res.end(JSON.stringify(errorResponse));
		}
	};
}

/**
 * Parse HTTP request into LensRequest
 */
async function parseHTTPRequest(req: any): Promise<LensRequest> {
	// Parse body
	let body: any;
	if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
		body = await parseBody(req);
	}

	// Extract Lens request from body
	const { type, path, input, select } = body || {};

	if (!type || !path) {
		throw Object.assign(new Error("Missing required fields: type, path"), {
			statusCode: 400,
			code: "INVALID_REQUEST",
		});
	}

	return {
		type,
		path,
		input,
		select,
	};
}

/**
 * Parse request body
 */
function parseBody(req: any): Promise<any> {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk: any) => {
			body += chunk.toString();
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(body));
			} catch (error) {
				reject(
					Object.assign(new Error("Invalid JSON"), {
						statusCode: 400,
						code: "INVALID_JSON",
					})
				);
			}
		});
		req.on("error", reject);
	});
}
