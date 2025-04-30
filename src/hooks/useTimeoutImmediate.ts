import { useTimeoutFn } from '@vueuse/core'
import { onMounted, onUnmounted } from 'vue'

export function useImmediateTimeoutFn(fn: () => void, delay: number) {
  // 立即执行一次
  fn()
  const { start, stop } = useTimeoutFn(fn, delay)

  onUnmounted(() => {
    stop()
  })

  return {
    start,
    stop
  }
}