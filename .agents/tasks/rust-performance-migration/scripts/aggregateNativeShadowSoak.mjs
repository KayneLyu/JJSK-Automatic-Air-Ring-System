import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputDir = resolve(scriptDir, 'outputs')
const scenarioNames = ['disabled-serial', 'shadow-serial']

const readReport = (variant) =>
  JSON.parse(
    readFileSync(
      resolve(outputDir, `native-shadow-soak.${variant}.json`),
      'utf8'
    )
  )

const reports = scenarioNames.map(readReport)
const longRunReport = readReport('shadow-serial-60')
const concurrencyProbes = JSON.parse(
  readFileSync(
    resolve(outputDir, 'native-shadow-soak.concurrency-probes.json'),
    'utf8'
  )
)
const scenarios = reports.map((report, index) => {
  if (report.scenarios.length !== 1) {
    throw new Error(`${scenarioNames[index]} 报告必须只包含一个场景`)
  }
  return report.scenarios[0]
})
const longRun = longRunReport.scenarios[0]
if (longRun?.name !== 'shadow-serial') {
  throw new Error('60 请求长时报告必须是 shadow-serial')
}

const productionAngles = reports[0].productionAngles
for (const report of [...reports.slice(1), longRunReport]) {
  if (
    JSON.stringify(report.productionAngles) !== JSON.stringify(productionAngles)
  ) {
    throw new Error('各独立进程报告的 TypeScript 生产角度不一致')
  }
}

const successfulProbeScenarios = concurrencyProbes
  .filter((probe) => probe.passed && probe.outputVariant)
  .map((probe) => readReport(probe.outputVariant).scenarios[0])
const shadowScenarios = [
  ...scenarios.filter((scenario) => scenario.shadowEnabled),
  ...successfulProbeScenarios,
]
const gates = {
  allRequestsSucceeded: scenarios.every(
    (scenario) => scenario.failedRequests === 0
  ),
  productionOutputStable: scenarios.every(
    (scenario) => scenario.productionMismatchCount === 0
  ),
  nativeThetaEquivalent: shadowScenarios.every(
    (scenario) => scenario.nativeMismatchCount === 0
  ),
  telemetrySuccessful: scenarios.every(
    (scenario) => scenario.telemetryFailureCount === 0
  ),
  threadLimitStable: scenarios.every(
    (scenario) => scenario.threadLimitMismatchCount === 0
  ),
  singleWorkerReused: scenarios.every(
    (scenario) => scenario.workerCreateCount === 1
  ),
  eventLoopP95Under100Ms: scenarios.every(
    (scenario) => scenario.eventLoop.p95Ms < 100
  ),
  longSerial60Succeeded:
    longRun.requestCount === 60 &&
    longRun.failedRequests === 0 &&
    longRun.productionMismatchCount === 0 &&
    longRun.nativeMismatchCount === 0 &&
    longRun.telemetryFailureCount === 0 &&
    longRun.threadLimitMismatchCount === 0 &&
    longRun.workerCreateCount === 1 &&
    longRun.eventLoop.p95Ms < 100,
}

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  configuration: {
    cyclesPerScenario: reports[0].configuration.cycles,
    longSerialCycles: longRunReport.configuration.cycles,
    datasets: reports[0].configuration.datasets,
    requestsPerScenario: reports[0].configuration.requestCountPerScenario,
    longSerialRequestCount: longRun.requestCount,
    threadLimit: reports[0].configuration.threadLimit,
    maxConcurrencyProbe: 4,
    processIsolation: 'one-process-per-scenario',
    workerTopology: 'persistent-single-worker-fifo',
    concurrentNativeWarmupRequests: 1,
  },
  environment: reports[0].environment,
  productionAngles,
  scenarios,
  concurrencyProbes: concurrencyProbes.map((probe) => ({
    ...probe,
    measurement: probe.passed
      ? successfulProbeScenarios.find(
          (scenario) => scenario.name === probe.scenario
        )
      : null,
  })),
  longRun,
  comparison: {
    maxCpuCoreEquivalent: Math.max(
      ...shadowScenarios.map((scenario) => scenario.cpu.coreEquivalent)
    ),
    maxEventLoopP95Ms: Math.max(
      ...scenarios.map((scenario) => scenario.eventLoop.p95Ms)
    ),
    maxPeakRssBytes: Math.max(
      ...scenarios.map((scenario) => scenario.memory.rssPeakBytes)
    ),
  },
  gates,
  decision: {
    serializedShadowObservationAllowed: Object.values(gates).every(Boolean),
    concurrentSubmissionsAllowed: concurrencyProbes.every(
      (probe) => probe.passed
    ),
    concurrentWorkersAllowed: false,
    reason:
      '持久单 Worker + FIFO 拓扑通过串行与并发提交耐久；不允许恢复每请求创建并强制终止或并行 Native Worker。',
  },
}

if (
  JSON.stringify(report).includes('measurements') ||
  JSON.stringify(report).includes('samplesMs')
) {
  throw new Error('聚合报告不得包含原始 measurements 或 samplesMs')
}
const failedGates = Object.entries(gates)
  .filter(([, passed]) => !passed)
  .map(([name]) => name)
if (failedGates.length > 0) {
  throw new Error(`阶段 3 门槛失败: ${failedGates.join(', ')}`)
}

const outputPath = resolve(outputDir, 'native-shadow-soak.json')
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`阶段 3 聚合报告已写入: ${outputPath}`)
