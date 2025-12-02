/**
 * Type test: Verify plugin system works correctly
 *
 * Run: bun tsc --noEmit packages/core/src/plugin/test-plugin-types.ts
 *
 * Expected:
 * - WITHOUT plugin: @ts-expect-error should catch the error (optimistic doesn't exist)
 * - WITH plugin: no error (optimistic exists)
 */
import { z } from "zod";
import { lens } from "../lens.js";
// Import the optimistic plugin extension to register it in PluginMethodRegistry
import type { OptimisticPluginExtension, OptimisticPluginMarker } from "./optimistic-extension.js";
import type {
	ExtractPluginExtensions,
	ExtractPluginMethods,
	HasPlugin,
	PluginMethodRegistry,
} from "./types.js";

// =============================================================================
// Debug: Verify Module Augmentation Works
// =============================================================================

// Check if PluginMethodRegistry has the "optimistic" key after augmentation
type RegistryKeys = keyof PluginMethodRegistry<unknown, unknown, unknown>;
type _DebugRegistryKeys = RegistryKeys; // Hover in IDE to see if "optimistic" is present

// This should be true if the augmentation worked
type HasOptimisticInRegistry = "optimistic" extends RegistryKeys ? true : false;
const _debugHasOptimistic: HasOptimisticInRegistry = true; // Should compile if augmentation works

// Debug: Check the entire extraction chain
type DebugRegistry = PluginMethodRegistry<{ id: string }, unknown, { db: any }>;
type DebugOptimisticEntry = DebugRegistry["optimistic"];
type _DebugMutationMethods = DebugOptimisticEntry["MutationBuilderWithReturns"];
// DebugMutationMethods should have the optimistic function signature

// Check ExtractPluginMethods directly
type DebugExtract = ExtractPluginMethods<
	[OptimisticPluginExtension],
	"MutationBuilderWithReturns",
	{ id: string },
	unknown,
	{ db: any }
>;
// DebugExtract should have { optimistic: ... }

type HasOptimisticMethodFromExtract = DebugExtract extends { optimistic: unknown } ? true : false;
const _debugHasMethod: HasOptimisticMethodFromExtract = true; // Should compile if extraction works

// Debug: Trace through lens types
import type { LensMutationBuilderWithReturns, LensWithPlugins } from "../lens.js";

// Check LensWithPlugins type
type DebugLensType = LensWithPlugins<{ db: any }, [OptimisticPluginExtension]>;
type DebugMutationType = DebugLensType["mutation"];

// Check if mutation returns the right builder type
type DebugMutationReturnType = ReturnType<DebugMutationType>;
type _DebugInputReturnType = ReturnType<DebugMutationReturnType["input"]>;

// Check the final returns type with TPlugins
type DebugReturnsType = LensMutationBuilderWithReturns<
	{ id: string },
	unknown,
	{ db: any },
	[OptimisticPluginExtension]
>;
type HasOptimisticOnReturns = DebugReturnsType extends { optimistic: unknown } ? true : false;
const _debugHasOptimisticOnReturns: HasOptimisticOnReturns = true;

// Test entity
const TestEntity = { _name: "Test", fields: {} } as any;

// =============================================================================
// Type Utilities Verification
// =============================================================================

// Verify ExtractPluginExtensions works correctly
type Plugins = readonly [OptimisticPluginMarker];
type ExtractedPlugins = ExtractPluginExtensions<Plugins>;
// Should be [OptimisticPluginExtension]

// Verify HasPlugin works correctly
type HasOpt1 = HasPlugin<[OptimisticPluginExtension], "optimistic">; // Should be true
type HasOpt2 = HasPlugin<ExtractedPlugins, "optimistic">; // Should be true

// Type assertions (these should compile without error)
const _test1: HasOpt1 = true;
const _test2: HasOpt2 = true;

// Verify ExtractPluginMethods extracts from registry
type MethodsFromRegistry = ExtractPluginMethods<
	[OptimisticPluginExtension],
	"MutationBuilderWithReturns",
	{ id: string },
	unknown,
	{ db: any }
>;
// Should have { optimistic: ... }
type HasOptimisticMethod = MethodsFromRegistry extends { optimistic: unknown } ? true : false;
const _hasOptimisticMethod: HasOptimisticMethod = true;

// =============================================================================
// WITHOUT plugin - .optimistic() should NOT be available
// =============================================================================

const withoutPlugin = lens<{ db: any }>();

const m1 = withoutPlugin
	.mutation()
	.input(z.object({ id: z.string() }))
	.returns(TestEntity);

// @ts-expect-error - optimistic should not exist without plugin
m1.optimistic;

// But .resolve() should work
m1.resolve(({ input, ctx: _ctx }) => ({ id: input.id }));

// =============================================================================
// WITH plugin - .optimistic() SHOULD be available
// =============================================================================

// Mock optimistic plugin (actual implementation is in server package)
declare const mockOptimisticPlugin: () => OptimisticPluginMarker;

// Debug: Check what lens() returns with plugins
// Create a typed config first to see if the issue is with inference
const pluginConfig = {
	plugins: [mockOptimisticPlugin()] as const,
} as const;

type PluginConfigType = typeof pluginConfig;
type PluginsArrayType = PluginConfigType["plugins"];
// Should be: readonly [OptimisticPluginMarker]

type ExtractedExtensions = ExtractPluginExtensions<PluginsArrayType>;
// Should be: [OptimisticPluginExtension]

type DirectLensType = LensWithPlugins<{ db: any }, ExtractedExtensions>;
type _DirectMutationType = DirectLensType["mutation"];
// Should have TPlugins = [OptimisticPluginExtension]

// Test: Create a typed lens directly (bypassing inference)
declare const directLens: DirectLensType;
const directM = directLens
	.mutation()
	.input(z.object({ id: z.string() }))
	.returns(TestEntity);
directM.optimistic("merge"); // Should work if DirectLensType is correct

// Use .withPlugins() pattern for explicit context type + plugin inference
type MyContext = { db: any };
const withPlugin = lens<MyContext>().withPlugins([mockOptimisticPlugin()] as const);

const m2 = withPlugin
	.mutation()
	.input(z.object({ id: z.string() }))
	.returns(TestEntity);

// This should work - optimistic should exist with plugin
m2.optimistic("merge");

// And .resolve() should still work
m2.resolve(({ input, ctx: _ctx }) => ({ id: input.id }));

// =============================================================================
// Verify plugin methods have correct types
// =============================================================================

// The optimistic method should return a builder with .resolve()
const m3 = withPlugin
	.mutation()
	.input(z.object({ id: z.string(), name: z.string() }))
	.returns(TestEntity)
	.optimistic("merge")
	.resolve(({ input, ctx: _ctx }) => ({
		id: input.id,
		name: input.name,
	}));

// Should be a MutationDef
type M3Type = typeof m3;
type IsMutationDef = M3Type extends { _type: "mutation" } ? true : false;
const _isMutationDef: IsMutationDef = true;

console.log("Type test file - if this compiles, types are correct!");
