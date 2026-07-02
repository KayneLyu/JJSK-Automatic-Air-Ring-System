/**
 * 单样本反解工具兼容出口。
 *
 * 纯计算实现已迁移到 @jjsk/air-ring-server/algorithms/bubbleReconstruction。
 */

export {
  decomposeSample,
  findClosestSample,
  interpolateB,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'
export type {
  DecomposeInput,
  DecomposeResult,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'
