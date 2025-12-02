/**
 * @sylphx/lens-server - Reconnection Module
 *
 * Server-side reconnection support:
 * - OperationLog for tracking state changes
 * - Patch coalescing and size estimation
 */

export { coalescePatches, estimatePatchSize, OperationLog } from "./operation-log.js";
