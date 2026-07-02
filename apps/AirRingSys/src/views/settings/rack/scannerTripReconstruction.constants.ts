/** 滑动窗口最大包含的扫描趟数 */
export const SCANNER_SLIDING_WINDOW = 640
/** 滑动窗口最大时间跨度 (ms)：超出此范围的趟不参与重构，防止跨工艺状态数据混杂 */
export const WINDOW_MAX_TIME_SPAN_MS = 10 * 60_000
/** 上旋趟匹配容忍间隙 (ms)：超过该值则丢弃该测点，避免错配到过时上旋趟 */
export const UPPER_SWEEP_GAP_TOLERANCE_MS = 1_000
/** 极小时间抖动忽略阈值 (ms)：避免 5~20ms 级别日志噪声 */
export const UPPER_SWEEP_GAP_IGNORE_WARN_BELOW_MS = 50
/** 重建分箱自适应下限：欠覆盖场景下降分箱，优先保证覆盖连续性 */
export const MIN_ADAPTIVE_NUM_BINS = 90
/** 分箱目标覆盖率：低于该比例时下调分箱 */
export const TARGET_BIN_COVERAGE_RATIO = 0.8
/** φ 对分离度 p95 下限（度）：低于该值说明横向覆盖过窄，重构病态 */
export const MIN_P95_PHI_SEPARATION_DEG = 18
/** θ 覆盖比例下限：低于该值说明上旋时间轴覆盖不足 */
export const MIN_THETA_COVERAGE_RATIO = 0.75
/** θ 覆盖比例硬下限：低于该值说明上旋覆盖严重不足，直接拒绝重构 */
export const HARD_MIN_THETA_COVERAGE_RATIO = 0.65
/** 时延上限（ms）：只拦截明显失真的配置值，避免把长距离合法时延误判为异常 */
export const MAX_EFFECTIVE_TRANSPORT_DELAY_MS = 15 * 60_000
/** 扫描趟摘要默认拉取数量（首屏） */
export const SCANNER_TRIPS_FETCH_COUNT = 400
/** 上旋趟摘要刷新最短间隔，避免高频重复查询 */
export const UPPER_SWEEPS_REFRESH_MIN_INTERVAL_MS = 10_000
/** 重建窗口上旋趟拉取数量（较大，优先保证时间覆盖） */
export const UPPER_SWEEPS_FETCH_COUNT = 1200
/** 本页实时刷新间隔（降低 utility 查询压力） */
export const RECON_REFRESH_INTERVAL_MS = 5_000
/** 间隙告警汇总最短间隔，避免按样本刷屏 */
export const GAP_WARNING_SUMMARY_INTERVAL_MS = 15_000
