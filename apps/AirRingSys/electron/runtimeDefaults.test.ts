import { describe, expect, it } from 'vitest'
import {
  applyPackagedRuntimeDefaults,
  PACKAGED_RUST_RUNTIME_DEFAULTS,
} from './runtimeDefaults'

describe('applyPackagedRuntimeDefaults', () => {
  it('在打包态默认启用两条 Rust Native primary 路径', () => {
    const environment: NodeJS.ProcessEnv = {}

    applyPackagedRuntimeDefaults(true, environment)

    expect(environment).toMatchObject(PACKAGED_RUST_RUNTIME_DEFAULTS)
  })

  it('不改变开发态环境', () => {
    const environment: NodeJS.ProcessEnv = {}

    applyPackagedRuntimeDefaults(false, environment)

    expect(environment).toEqual({})
  })

  it('保留显式关闭和线程配置', () => {
    const environment: NodeJS.ProcessEnv = {
      AIR_RING_RUST_PRIMARY: '0',
      AIR_RING_RUST_PRIMARY_DISABLE: '1',
      AIR_RING_RUST_PRIMARY_THREADS: '2',
      AIR_RING_BUBBLE_RUST_PRIMARY: '0',
      AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE: '1',
    }

    applyPackagedRuntimeDefaults(true, environment)

    expect(environment).toMatchObject({
      AIR_RING_RUST_PRIMARY: '0',
      AIR_RING_RUST_PRIMARY_DISABLE: '1',
      AIR_RING_RUST_PRIMARY_THREADS: '2',
      AIR_RING_BUBBLE_RUST_PRIMARY: '0',
      AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE: '1',
    })
  })
})
