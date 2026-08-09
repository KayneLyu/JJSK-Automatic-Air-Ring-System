import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const round = (value) => Math.round(value * 1_000_000) / 1_000_000

const percentile = (sorted, ratio) => {
  if (sorted.length === 0) return null
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  )
  return sorted[index]
}

const summarize = (values) => {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
  if (sorted.length === 0) return null
  const sum = sorted.reduce((total, value) => total + value, 0)
  return {
    count: sorted.length,
    min: round(sorted[0]),
    mean: round(sum / sorted.length),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1)),
  }
}

const increment = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1
}

export const aggregateRustShadowObservation = (records, sourceFile) => {
  const statusCounts = {}
  const stateCounts = {}
  const absoluteAngleDeltaDeg = []
  const nativeElapsedMs = []
  const totalElapsedMs = []

  for (const record of records) {
    if (
      record?.schemaVersion !== 1 ||
      typeof record?.telemetry?.status !== 'string' ||
      typeof record?.observation?.state !== 'string'
    ) {
      throw new Error('输入包含不符合 schemaVersion=1 的观测记录')
    }
    increment(statusCounts, record.telemetry.status)
    increment(stateCounts, record.observation.state)
    if (Number.isFinite(record.telemetry.absoluteAngleDeltaDeg)) {
      absoluteAngleDeltaDeg.push(record.telemetry.absoluteAngleDeltaDeg)
    }
    if (Number.isFinite(record.telemetry.nativeElapsedMs)) {
      nativeElapsedMs.push(record.telemetry.nativeElapsedMs)
    }
    if (Number.isFinite(record.telemetry.totalElapsedMs)) {
      totalElapsedMs.push(record.telemetry.totalElapsedMs)
    }
  }

  const finalObservation = records.at(-1)?.observation ?? null
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceFile: basename(sourceFile),
    recordCount: records.length,
    statusCounts,
    stateCounts,
    finalState: finalObservation?.state ?? null,
    policy: finalObservation
      ? {
          everyN: finalObservation.everyN,
          maxRuns: finalObservation.maxRuns,
          maxConsecutiveFailures: finalObservation.maxConsecutiveFailures,
          maxDeltaDeg: finalObservation.maxDeltaDeg,
        }
      : null,
    metrics: {
      absoluteAngleDeltaDeg: summarize(absoluteAngleDeltaDeg),
      nativeElapsedMs: summarize(nativeElapsedMs),
      totalElapsedMs: summarize(totalElapsedMs),
    },
  }
}

export const aggregateRustShadowObservationFile = async (
  inputPath,
  outputPath
) => {
  const serialized = await readFile(inputPath, 'utf8')
  const lines = serialized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) throw new Error('观测日志为空')
  const records = lines.map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(
        `第 ${index + 1} 行不是有效 JSON: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })
  const report = aggregateRustShadowObservation(records, inputPath)
  const reportText = `${JSON.stringify(report, null, 2)}\n`
  if (
    reportText.includes('measurements') ||
    reportText.includes('tripSegments') ||
    reportText.includes('samplesMs')
  ) {
    throw new Error('聚合报告意外包含原始测点或逐次样本字段')
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, reportText, 'utf8')
  return report
}

const scriptPath = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  const inputPath = process.argv[2] ? resolve(process.argv[2]) : undefined
  const outputPath = process.argv[3] ? resolve(process.argv[3]) : undefined
  if (!inputPath || !outputPath) {
    console.error(
      '用法: node aggregateRustShadowObservation.mjs <input.ndjson> <output.json>'
    )
    process.exitCode = 1
  } else {
    aggregateRustShadowObservationFile(inputPath, outputPath)
      .then((report) => {
        console.log(
          `Rust shadow 聚合完成: records=${report.recordCount}, output=${outputPath}`
        )
      })
      .catch((error) => {
        console.error(error)
        process.exitCode = 1
      })
  }
}
