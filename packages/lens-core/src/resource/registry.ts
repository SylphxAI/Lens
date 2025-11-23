/**
 * Resource Registry
 *
 * Global registry for tracking and validating resource definitions.
 * Ensures relationship integrity and provides resource lookup.
 *
 * @module @sylphx/lens-core/resource/registry
 */

import type { Resource, ResourceDefinition, Relationship } from "./types";

/**
 * Registry error types
 */
export class ResourceRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ResourceRegistryError";
	}
}

/**
 * Global resource registry
 *
 * Singleton registry that tracks all defined resources and validates relationships.
 */
export class ResourceRegistry {
	private static instance: ResourceRegistry;
	private resources: Map<string, Resource> = new Map();

	private constructor() {}

	/**
	 * Get singleton instance
	 */
	static getInstance(): ResourceRegistry {
		if (!ResourceRegistry.instance) {
			ResourceRegistry.instance = new ResourceRegistry();
		}
		return ResourceRegistry.instance;
	}

	/**
	 * Register a resource
	 *
	 * @param resource - Resource to register
	 * @throws {ResourceRegistryError} If resource name already exists
	 */
	register(resource: Resource): void {
		if (this.resources.has(resource.name)) {
			throw new ResourceRegistryError(
				`Resource '${resource.name}' is already registered. Resource names must be unique.`,
			);
		}

		this.resources.set(resource.name, resource);
	}

	/**
	 * Get a registered resource by name
	 *
	 * @param name - Resource name
	 * @returns Resource or undefined if not found
	 */
	get(name: string): Resource | undefined {
		return this.resources.get(name);
	}

	/**
	 * Check if a resource is registered
	 *
	 * @param name - Resource name
	 * @returns True if resource exists
	 */
	has(name: string): boolean {
		return this.resources.has(name);
	}

	/**
	 * Get all registered resources
	 *
	 * @returns Array of all resources
	 */
	getAll(): Resource[] {
		return Array.from(this.resources.values());
	}

	/**
	 * Validate all relationships
	 *
	 * Ensures that all relationship targets exist in the registry.
	 * Should be called after all resources are registered.
	 *
	 * @throws {ResourceRegistryError} If any relationship target is missing
	 */
	validateRelationships(): void {
		const errors: string[] = [];

		for (const resource of this.resources.values()) {
			if (!resource.definition.relationships) continue;

			for (const [relationName, relationship] of Object.entries(
				resource.definition.relationships,
			)) {
				if (!this.has(relationship.target)) {
					errors.push(
						`Resource '${resource.name}' has relationship '${relationName}' ` +
							`targeting '${relationship.target}', but no resource with that name is registered.`,
					);
				}

				// Validate manyToMany through table
				if (relationship.type === "manyToMany") {
					// Through table doesn't need to be a registered resource
					// It's typically just a database join table
					// But we could validate it exists in the database schema later
				}
			}
		}

		if (errors.length > 0) {
			throw new ResourceRegistryError(
				`Relationship validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
			);
		}
	}

	/**
	 * Get relationship graph for a resource
	 *
	 * Returns all relationships (direct and nested) for a resource.
	 * Useful for query planning and N+1 detection.
	 *
	 * @param resourceName - Resource name
	 * @param maxDepth - Maximum depth to traverse (default: 3)
	 * @returns Map of relationship paths to relationship definitions
	 */
	getRelationshipGraph(
		resourceName: string,
		maxDepth = 3,
	): Map<string, { relationship: Relationship; resource: Resource }> {
		const graph = new Map<string, { relationship: Relationship; resource: Resource }>();
		const visited = new Set<string>();

		const traverse = (name: string, path: string, depth: number) => {
			if (visited.has(`${name}:${path}`)) return;

			visited.add(`${name}:${path}`);

			const resource = this.get(name);
			if (!resource || !resource.definition.relationships) return;

			for (const [relationName, relationship] of Object.entries(
				resource.definition.relationships,
			)) {
				const targetResource = this.get(relationship.target);
				if (!targetResource) continue;

				const relationPath = path ? `${path}.${relationName}` : relationName;
				const relationDepth = relationPath.split(".").length;

				// Skip if relationship exceeds max depth
				if (relationDepth > maxDepth) continue;

				graph.set(relationPath, { relationship, resource: targetResource });

				// Traverse nested relationships
				traverse(relationship.target, relationPath, depth + 1);
			}
		};

		traverse(resourceName, "", 0);
		return graph;
	}

	/**
	 * Clear all registered resources
	 *
	 * Primarily for testing. Use with caution in production.
	 */
	clear(): void {
		this.resources.clear();
	}

	/**
	 * Get registry statistics
	 *
	 * @returns Statistics about registered resources
	 */
	getStats(): {
		totalResources: number;
		totalRelationships: number;
		relationshipsByType: Record<string, number>;
	} {
		let totalRelationships = 0;
		const relationshipsByType: Record<string, number> = {
			hasMany: 0,
			belongsTo: 0,
			hasOne: 0,
			manyToMany: 0,
		};

		for (const resource of this.resources.values()) {
			if (!resource.definition.relationships) continue;

			for (const relationship of Object.values(resource.definition.relationships)) {
				totalRelationships++;
				relationshipsByType[relationship.type] =
					(relationshipsByType[relationship.type] || 0) + 1;
			}
		}

		return {
			totalResources: this.resources.size,
			totalRelationships,
			relationshipsByType,
		};
	}
}

/**
 * Get global registry instance
 */
export const getRegistry = (): ResourceRegistry => ResourceRegistry.getInstance();
