import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus, platform } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { searchBestExpanded } from '../../../AirRingNative'
import { measureSync } from './performanceStats'
import {
  buildNativeDto,
  loadTripSegments,
  normalizeTripSegments,
  searchBestExpandedReference,
} from './upperRotationNativeFixtures'

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)
const OUTPUT_PATH = resolve(
  REPOSITORY_ROOT,
  '.agents/tasks/rust-performance-migration/scripts/outputs/native-performance-baseline.json'
)
const WARMUP = 1
const REPEAT = 3

const invokeNativeSearch = (dto: ReturnType<typeof buildNativeDto>) =>
  searchBestExpanded(
    dto.times,
    dto.values,
    dto.offsetDegrees,
    dto.segmentOffsets,
    dto.durations,
    dto.accelRatios,
    180,
    360,
    1,
    36
  )

describe('Rust 迁移阶段 1 原生性能基线', () => {
  test(
    '比较 TypeScript、Rust 核心与 DTO 端到端耗时',
    () => {
      const datasets = []
      for (const dataset of ['01', '02', '03', '04', '05'] as const) {
        const normalized = normalizeTripSegments(loadTripSegments(dataset))
        const dto = buildNativeDto(normalized)
        const pointCount = dto.times.length
        const typescript = measureSync(
          () => searchBestExpandedReference(normalized),
          WARMUP,
          REPEAT
        )
        const rustCore = measureSync(
          () => invokeNativeSearch(dto),
          WARMUP,
          REPEAT
        )
        const rustEndToEnd = measureSync(
          () => {
            const freshDto = buildNativeDto(normalized)
            return invokeNativeSearch(freshDto)
          },
          WARMUP,
          REPEAT
        )

        expect(rustCore.result.theta).toBeCloseTo(typescript.result.theta, 10)
        expect(rustCore.result.loss).toBeCloseTo(typescript.result.loss, 10)
        datasets.push({
          dataset,
          pointCount,
          theta: rustCore.result.theta,
          loss: rustCore.result.loss,
          typescript: typescript.timing,
          rustCore: rustCore.timing,
          rustEndToEnd: rustEndToEnd.timing,
          coreSpeedup: typescript.timing.medianMs / rustCore.timing.medianMs,
          endToEndSpeedup:
            typescript.timing.medianMs / rustEndToEnd.timing.medianMs,
        })
      }

      const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        configuration: { warmup: WARMUP, repeat: REPEAT },
        environment: {
          platform: platform(),
          architecture: process.arch,
          node: process.version,
          cpuModel: cpus()[0]?.model ?? 'unknown',
          logicalCpuCount: cpus().length,
          rust: '1.88.0',
          napiRs: '3.12.0',
        },
        datasets,
        gates: {
          coreAtLeastThreeTimes: datasets.every(
            (result) => result.coreSpeedup >= 3
          ),
          endToEndAtLeastTwoTimes: datasets.every(
            (result) => result.endToEndSpeedup >= 2
          ),
        },
      }
      mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
      writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
      console.log(`阶段 1 原生性能基线已写入: ${OUTPUT_PATH}`)
    },
    10 * 60_000
  )
})
