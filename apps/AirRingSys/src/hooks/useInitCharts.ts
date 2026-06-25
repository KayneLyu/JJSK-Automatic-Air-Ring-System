import {
  ref,
  onBeforeUnmount,
  watch,
  useTemplateRef,
  onMounted,
  nextTick,
} from 'vue'
import * as echarts from 'echarts/core'
import { useConfigStore } from '@/store/config.ts'
import type { EChartsCoreOption } from 'echarts/core'
import { useI18n } from 'vue-i18n'
import { showNotification } from '@/utils/common.ts'
type IPropsDta = {
  frameData: Array<[string | number, number]> | number[]
}
const useInitCharts = (
  containerName: string,
  options: EChartsCoreOption,
  props?: IPropsDta,
  onReady?: (chart: echarts.ECharts) => void
) => {
  const { t } = useI18n()
  const brushList = ref<number[]>([])
  const chartRef = useTemplateRef<HTMLElement>(containerName)
  let chartInstanceRef: echarts.ECharts | null = null
  let observer: ResizeObserver | null = null
  const store = useConfigStore()

  // 缓存 initChart 完成前到达的 updateCharts 调用
  let pendingUpdate: { options: EChartsCoreOption; notMerge: boolean } | null =
    null

  // 初始化图表
  let initRetryCount = 0
  const MAX_RAF_RETRIES = 10

  const initChart = () => {
    if (!chartRef.value) return
    const el = chartRef.value
    // flex 子元素 onMounted 时父容器可能还没算完尺寸 → 0×0
    // 等 nextTick + RAF 拿到真实布局后再 init
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      initRetryCount++
      if (initRetryCount <= MAX_RAF_RETRIES) {
        requestAnimationFrame(() => initChart())
      } else {
        // RAF 重试耗尽，改用 ResizeObserver 等待尺寸就绪
        const sizeObserver = new ResizeObserver(() => {
          if (el.clientWidth > 0 && el.clientHeight > 0) {
            sizeObserver.disconnect()
            initRetryCount = 0
            initChart()
          }
        })
        sizeObserver.observe(el)
      }
      return
    }
    try {
      console.log('[useInitCharts] initChart | size=' + el.clientWidth + 'x' + el.clientHeight)
      chartInstanceRef = echarts.init(el, store.isDark ? 'dark' : '')
      chartInstanceRef.setOption(options)
      if (props && props.frameData) {
        chartInstanceRef.setOption({
          series: [{ data: props.frameData }],
        })
      }

      // 应用 initChart 完成前缓存的 updateCharts 调用
      if (pendingUpdate) {
        console.log('[useInitCharts] applying pendingUpdate | notMerge=' + pendingUpdate.notMerge)
        chartInstanceRef.setOption(
          pendingUpdate.options,
          pendingUpdate.notMerge
        )
        pendingUpdate = null
      }

      onReady?.(chartInstanceRef)
    } catch (error) {
      showNotification(
        t('notification.info'),
        t('notification.initError'),
        'error'
      )
    }
    // 创建 ResizeObserver 实例并添加监听（只在初始化时进行）
    if (!observer) {
      observer = new ResizeObserver(() => {
        if (chartInstanceRef) {
          chartInstanceRef.resize()
        }
      })
      observer.observe(el)
    }
  }
  const updateCharts = (newOptions: EChartsCoreOption, notMerge = false) => {
    if (chartInstanceRef) {
      console.log('[useInitCharts] updateCharts | notMerge=' + notMerge + ' | hasChart=true')
      chartInstanceRef.setOption(newOptions, notMerge)
      pendingUpdate = null
    } else if (chartRef.value) {
      console.log('[useInitCharts] updateCharts PENDING | notMerge=' + notMerge + ' | dom exists, chart not ready')
      pendingUpdate = { options: newOptions, notMerge }
    } else {
      console.log('[useInitCharts] updateCharts SKIPPED | no dom ref')
    }
  }

  const selectSeriesIndex = (dataIndex: number) => {
    if (chartInstanceRef) {
      chartInstanceRef.dispatchAction({
        type: 'showTip',
        seriesIndex: 0, //联动切换
        dataIndex: dataIndex,
      })
    }
  }

  const selectBrush = () => {
    if (chartInstanceRef) {
      chartInstanceRef.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: {
          // 参见 brush 组件的 brushType。如果设置为 false 则关闭“可刷选状态”。
          brushType: 'lineX',
          // 参见 brush 组件的 brushMode。如果不设置，则取 brush 组件的 brushMode 设置。
          brushMode: 'single',
        },
      })
      chartInstanceRef.off('brushSelected')
      chartInstanceRef.on('brushSelected', (params: any) => {
        brushList.value = params.batch[0].selected[0].dataIndex
      })
    }
  }

  const selectSingleChannel = (arr: number[]) => {
    brushList.value = arr
  }

  const dropCharts = () => {
    pendingUpdate = null
    if (observer) {
      observer.disconnect()
      observer = null
    }
    if (chartInstanceRef) {
      chartInstanceRef.dispose()
      chartInstanceRef = null
    }
  }

  // 切换主题
  watch(
    () => store.isDark,
    (newTheme) => {
      dropCharts()
      initChart()
    }
  )

  onMounted(() => {
    // 等下一帧 layout 稳定后再 init，否则 flex 子元素 clientWidth/Height 还是 0
    nextTick(() => initChart())
  })

  // 在组件卸载前，清理相关资源
  onBeforeUnmount(() => {
    dropCharts()
  })

  return {
    updateCharts,
    selectSeriesIndex,
    selectBrush,
    selectSingleChannel,
    brushList,
  }
}

export default useInitCharts
