// vitest.config.ts
export default {
  test: {
    pool: 'threads', // 🚀 关键
    maxWorkers: '100%', // 用满 CPU
    minWorkers: 1,
    fileParallelism: true, // 默认开启，但可以显式写
  },
}
