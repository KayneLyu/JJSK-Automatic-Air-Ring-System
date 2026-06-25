import { defineConfig } from 'vite'
import path from 'node:path'
import electronSimple from 'vite-plugin-electron/simple'
import electron from 'vite-plugin-electron'
import vue from '@vitejs/plugin-vue'
import { join } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const sharedAlias = {
  '@': join(__dirname, '/src'),
  '@jjsk/air-ring-server/electron': path.resolve(
    __dirname,
    '../../packages/AirRingServer/electron.ts'
  ),
  '@jjsk/core': path.resolve(__dirname, '../../packages/core'),
  '@jjsk/ad-box': path.resolve(__dirname, '../../packages/Adbox-sdk'),
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
      renderer:
        process.env.NODE_ENV === 'test'
          ? undefined
          : {},
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
      // utilityProcess 脚本独立打包，输出到 dist-electron/utilityWorker.js
      {
        entry: 'electron/utilityWorker.ts',
        vite: {
          resolve: { alias: sharedAlias },
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
    ]),
  ],
})
