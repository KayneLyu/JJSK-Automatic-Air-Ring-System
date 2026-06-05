/**
 * @deprecated TestADBoxClient 已合并进 ADBoxClient。
 * 请直接使用 ADBoxClient，通过 AdBoxOptions 配置自动重连、看门狗等行为。
 *
 * 旧用法：new TestADBoxClient({ host, port, pushTimeout: 1000 })
 * 新用法：new ADBoxClient({ host, port, pushTimeout: 1000, autoReconnect: true })
 */
export { ADBoxClient as TestADBoxClient } from '../client'
export type { ADBoxOptions as AdBoxOptions } from '../types'
