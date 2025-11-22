/**
 * Core type definitions for Lens schema system
 *
 * This module defines the fundamental building blocks:
 * - LensQuery: Read operations with optional subscriptions
 * - LensMutation: Write operations that trigger updates
 * - LensObject: Nested grouping of queries/mutations
 */

import type { Observable } from "rxjs";
import type { z } from "zod";

/**
 * Field selection types - frontend controls what data to fetch
 */
export type FieldSelection =
	| string[] // Array syntax: ['id', 'name', 'email']
	| { [key: string]: boolean | FieldSelection } // Object syntax: { id: true, posts: { title: true } }
	| string; // Template syntax: "id name posts { title }"

/**
 * Type utility to extract selected fields from a type
 */
export type Selected<T, S> = S extends string[]
	? Pick<T, S[number] & keyof T>
	: S extends Record<string, any>
		? {
				[K in keyof S & keyof T]: S[K] extends true
					? T[K]
					: S[K] extends FieldSelection
						? T[K] extends Array<infer U>
							? Array<Selected<U, S[K]>>
							: Selected<T[K], S[K]>
						: never;
			}
		: T;

/**
 * Query definition with Zod schemas
 */
export interface LensQuery<TInput, TOutput> {
	type: "query";
	path: string[];
	input: z.ZodType<TInput>;
	output: z.ZodType<TOutput>;
	resolve: (input: TInput) => Promise<TOutput>;
	subscribe?: (input: TInput) => Observable<TOutput>;
}

/**
 * Mutation definition with Zod schemas
 */
export interface LensMutation<TInput, TOutput> {
	type: "mutation";
	path: string[];
	input: z.ZodType<TInput>;
	output: z.ZodType<TOutput>;
	resolve: (input: TInput) => Promise<TOutput>;
}

/**
 * Object grouping queries and mutations
 */
export type LensObject<T = any> = {
	[K in keyof T]: T[K] extends LensQuery<any, any>
		? T[K]
		: T[K] extends LensMutation<any, any>
			? T[K]
			: T[K] extends LensObject<any>
				? T[K]
				: never;
};

/**
 * Type inference utilities
 */
export type InferInput<T> = T extends LensQuery<infer I, any>
	? I
	: T extends LensMutation<infer I, any>
		? I
		: never;

export type InferOutput<T> = T extends LensQuery<any, infer O>
	? O
	: T extends LensMutation<any, infer O>
		? O
		: never;

/**
 * Request/Response types
 */
export interface LensRequest {
	type: "query" | "mutation" | "subscription";
	path: string[];
	input: unknown;
	select?: FieldSelection;
	updateMode?: UpdateMode;
}

export interface LensResponse<T> {
	data?: T;
	error?: {
		message: string;
		code?: string;
		data?: unknown;
	};
}

/**
 * Update strategies for minimal transfer
 */
export type UpdateMode = "value" | "delta" | "patch" | "auto";

export interface UpdatePayload {
	mode: UpdateMode;
	data: unknown;
}
