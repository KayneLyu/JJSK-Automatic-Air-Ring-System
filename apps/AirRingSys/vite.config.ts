import { defineConfig } from 'vite'
import path from 'node:path'
import electronSimple from 'vite-plugin-electron/simple'
import electron from 'vite-plugin-electron'
import vue from '@vitejs/plugin-vue'
import { join } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const sharedAlias: Record<string, string> = {
  '@': join(__dirname, '/src'),
  '@jjsk/air-ring-server/electron': path.resolve(
    __dirname,
    '../../packages/AirRingServer/electron.ts'
  ),
  '@jjsk/core': path.resolve(__dirname, '../../packages/core'),
  '@jjsk/ad-box': path.resolve(__dirname, '../../packages/Adbox-sdk'),
}

function resolveAirRingServer() {
  return [
    ...Object.entries(sharedAlias).map(([find, replacement]) => ({
      find,
      replacement,
    })),
    {
      find: /^@jjsk\/air-ring-server\/(.+)$/,
      replacement: path.resolve(__dirname, '../../packages/AirRingServer/$1'),
    },
  ]
}

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: sharedAlias,
    extensions: ['.js', '.json', '.ts', '.tsx'],
  },
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    electronSimple({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
    // Worker 线程脚本独立打包，输出到 dist-electron/calibrationWorker.js
    ...electron([
      {
        entry: 'electron/calibrationWorker.ts',
        vite: {
          resolve: { alias: sharedAlias },
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/calibrationWorker.ts',
              formats: ['es'],
              fileName: () => 'calibrationWorker.js',
            },
            rollupOptions: {
              external: ['node:worker_threads', 'electron'],
            },
          },
        },
      },
      // 历史标定回放 Worker，输出到 dist-electron/historicalCalibrationWorker.js
      {
        entry: 'electron/historicalCalibrationWorker.ts',
        vite: {
          resolve: { alias: resolveAirRingServer() },
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/historicalCalibrationWorker.ts',
              formats: ['es'],
              fileName: () => 'historicalCalibrationWorker.js',
            },
            rollupOptions: {
              external: ['node:worker_threads', 'electron', 'better-sqlite3'],
            },
          },
        },
      },
      // 膜泡历史查询 Worker，输出到 dist-electron/bubbleQueryWorker.js
      {
        entry: 'electron/bubbleQueryWorker.ts',
        vite: {
          resolve: { alias: resolveAirRingServer() },
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/bubbleQueryWorker.ts',
              formats: ['es'],
              fileName: () => 'bubbleQueryWorker.js',
            },
            rollupOptions: {
              external: ['node:worker_threads', 'electron', 'better-sqlite3'],
            },
          },
        },
      },
      // 膜泡重建 Worker，输出到 dist-electron/bubbleWorker.js
      {
        entry: 'electron/bubbleWorker.ts',
        vite: {
          resolve: { alias: sharedAlias },
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/bubbleWorker.ts',
              formats: ['es'],
              fileName: () => 'bubbleWorker.js',
            },
            rollupOptions: {
              external: ['node:worker_threads', 'electron'],
            },
          },
        },
      },
      // Phase 8B 历史膜泡只读观测入口
      {
        entry: 'electron/historicalBubbleObservation.ts',
        vite: {
          resolve: { alias: resolveAirRingServer() },
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/historicalBubbleObservation.ts',
              formats: ['es'],
              fileName: () => 'historicalBubbleObservation.js',
            },
            rollupOptions: {
              external: ['node:worker_threads', 'electron'],
            },
          },
        },
      },
      // utilityProcess 脚本独立打包，输出到 dist-electron/utilityWorker.js
      {
        entry: 'electron/utilityWorker.ts',
        vite: {
          resolve: { alias: resolveAirRingServer() },
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/utilityWorker.ts',
              formats: ['es'],
              fileName: () => 'utilityWorker.js',
            },
            rollupOptions: {
              external: ['electron', 'better-sqlite3'],
            },
          },
        },
      },
      // 现场包离线自检；仅加载原生模块和内存 SQLite，不初始化任何设备。
      {
        entry: 'electron/fieldSelfTest.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/fieldSelfTest.ts',
              formats: ['es'],
              fileName: () => 'fieldSelfTest.js',
            },
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
    ]),
  ],
})
