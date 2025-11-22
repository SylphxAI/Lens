/**
 * In-process transport - No network, direct function calls
 *
 * Use cases:
 * - TUI/CLI applications
 * - Testing
 * - Server-side rendering
 * - Same-process client-server
 */

import { Observable } from "rxjs";
import type { LensTransport } from "./interface.js";
import type { LensRequest, LensResponse } from "../schema/types.js";
import type { LensObject } from "../schema/types.js";

/**
 * In-process transport configuration
 */
export interface InProcessTransportConfig {
	api: LensObject<any>;
}

/**
 * In-process transport implementation
 */
export class InProcessTransport implements LensTransport {
	constructor(private readonly config: InProcessTransportConfig) {}

	send<T>(request: LensRequest): Promise<T> | Observable<T> {
		// Navigate to the target query/mutation
		let target: any = this.config.api;

		for (const segment of request.path) {
			target = target[segment];

			if (!target) {
				throw new Error(`Path not found: ${request.path.join(".")}`);
			}
		}

		if (!target.type) {
			throw new Error(
				`Invalid target at path: ${request.path.join(".")} - expected query or mutation`
			);
		}

		// Validate input
		const inputResult = target.input.safeParse(request.input);
		if (!inputResult.success) {
			throw new Error(
				`Input validation failed: ${inputResult.error.message}`
			);
		}

		const validatedInput = inputResult.data;

		// Handle subscription
		if (request.type === "subscription") {
			if (!target.subscribe) {
				throw new Error(
					`No subscription defined for: ${request.path.join(".")}`
				);
			}

			return new Observable<T>((subscriber) => {
				const subscription = target.subscribe(validatedInput).subscribe({
					next: (value: any) => {
						// Validate output
						const outputResult = target.output.safeParse(value);
						if (outputResult.success) {
							subscriber.next(this.applyFieldSelection(outputResult.data, request.select));
						} else {
							subscriber.error(
								new Error(
									`Output validation failed: ${outputResult.error.message}`
								)
							);
						}
					},
					error: (error: any) => subscriber.error(error),
					complete: () => subscriber.complete(),
				});

				return () => subscription.unsubscribe();
			});
		}

		// Handle query/mutation
		return target.resolve(validatedInput).then((result: any) => {
			// Validate output
			const outputResult = target.output.safeParse(result);
			if (!outputResult.success) {
				throw new Error(
					`Output validation failed: ${outputResult.error.message}`
				);
			}

			// Apply field selection
			return this.applyFieldSelection(outputResult.data, request.select) as T;
		});
	}

	/**
	 * Apply field selection to result
	 */
	private applyFieldSelection(data: any, select: any): any {
		if (!select) {
			return data;
		}

		if (Array.isArray(select)) {
			// Array syntax: ['id', 'name']
			const result: any = {};
			for (const key of select) {
				if (key in data) {
					result[key] = data[key];
				}
			}
			return result;
		}

		if (typeof select === "object") {
			// Object syntax: { id: true, posts: { title: true } }
			const result: any = {};

			for (const [key, value] of Object.entries(select)) {
				if (!(key in data)) continue;

				if (value === true) {
					result[key] = data[key];
				} else if (typeof value === "object") {
					// Nested selection
					const nested = data[key];
					if (Array.isArray(nested)) {
						result[key] = nested.map((item) =>
							this.applyFieldSelection(item, value)
						);
					} else if (nested !== null && nested !== undefined) {
						result[key] = this.applyFieldSelection(nested, value);
					}
				}
			}

			return result;
		}

		// No selection or unsupported format
		return data;
	}
}
