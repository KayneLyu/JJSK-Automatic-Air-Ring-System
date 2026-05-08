import { ref, onBeforeUnmount, watch, useTemplateRef, onMounted } from 'vue'
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
  props?: IPropsDta
) => {
  const { t } = useI18n()
  const brushList = ref<number[]>([])
  const chartRef = useTemplateRef<HTMLElement>(containerName)
  let chartInstanceRef: echarts.ECharts | null = null
  let observer: ResizeObserver | null = null
  const store = useConfigStore()
  // 初始化图表
  const initChart = () => {
    if (chartRef.value) {
      try {
        chartInstanceRef = echarts.init(
          chartRef.value,
          store.isDark ? 'dark' : ''
        )
        chartInstanceRef.setOption(options)
        if (props && props.frameData) {
          chartInstanceRef.setOption({
            series: [{ data: props.frameData }],
          })
        }
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
        observer.observe(chartRef.value)
      }
    }
  }
  const updateCharts = (newOptions: EChartsCoreOption) => {
    if (chartRef.value) {
      chartInstanceRef?.setOption(newOptions)
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
    initChart()
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
