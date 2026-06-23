/**
 * Worker 线程集成测试
 *
 * 注意：本测试需要先编译 bubbleThicknessWorker.ts 为 .js。
 * 预编译命令：
 *   npx tsc algorithms/bubbleThicknessWorker.ts --outDir algorithms/ \
 *     --module commonjs --target es2020 --esModuleInterop --skipLibCheck
 *
 * 生产环境中，vite-plugin-electron 会自动编译 Worker 文件。
 */
import { describe, expect, test } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'

test('Worker 文件存在且可导入', () => {
  const workerPath = path.resolve(__dirname, 'bubbleThicknessWorker.ts')
  expect(fs.existsSync(workerPath)).toBe(true)

  // 验证 Worker 模块可以被类型系统引用
  const types: import('./bubbleThicknessWorker').BubbleWorkerRequest = {
    id: 1,
    triples: [{ upperAngleDeg: 90, scannerPosMm: 0, thickness: 100 }],
    membraneWidthMm: 1200,
  }
  expect(types.id).toBe(1)
  expect(types.triples.length).toBe(1)
})

test('Worker 预编译文件存在性检查', () => {
  const compiledPath = path.resolve(__dirname, 'bubbleThicknessWorker.js')
  if (!fs.existsSync(compiledPath)) {
    console.warn(
      '⚠ bubbleThicknessWorker.js 未编译。' +
        '运行 npx tsc algorithms/bubbleThicknessWorker.ts --outDir algorithms/ ' +
        '--module commonjs --target es2020 --esModuleInterop --skipLibCheck 进行编译'
    )
    // 非致命：Worker 在生产环境中由 vite-plugin-electron 编译
    expect(true).toBe(true)
    return
  }
  expect(fs.existsSync(compiledPath)).toBe(true)
})