import { onBeforeUnmount, watch, useTemplateRef, onMounted } from 'vue';
import * as echarts from 'echarts/core';
import { useConfigStore } from '@/store/config'
import type { EChartsCoreOption } from 'echarts/core';
import { useI18n } from 'vue-i18n';
import { showNotification } from '@/utils/common';
type IPropsDta = {
    frameData: Array<[string | number, number]> | number[]
}
const useInitCharts = (containerName: string, options: EChartsCoreOption, props?: IPropsDta) => {
    const { t } = useI18n();
    const chartRef = useTemplateRef<HTMLElement>(containerName);
    let chartInstanceRef: echarts.ECharts | null = null
    let observer: ResizeObserver | null = null
    const store = useConfigStore();
    // 初始化图表
    const initChart = () => {
        if (chartRef.value) {
            try {
                chartInstanceRef = echarts.init(chartRef.value, store.isDark ? 'dark' : '');
                chartInstanceRef.setOption(options);
                if (props && props.frameData) {
                    chartInstanceRef.setOption({
                        series: [{ data: props.frameData }]
                    });
                }
            } catch (error) {
                showNotification(t('notification.info'), t('notification.initError'), 'error')
            }
            // 创建 ResizeObserver 实例并添加监听（只在初始化时进行）
            if (!observer) {
                observer = new ResizeObserver(() => {
                    if (chartInstanceRef) {
                        chartInstanceRef.resize();
                    }
                });
                observer.observe(chartRef.value);
            }
        }
    };
    const updateCharts = (newOptions: EChartsCoreOption) => {
        if (chartRef.value) {
            chartInstanceRef?.setOption(newOptions);
        }
    }

    const selectSeriesIndex = (dataIndex: number) => {
        if (chartInstanceRef) {
            chartInstanceRef.dispatchAction({
                type: "showTip",
                seriesIndex: 0, //联动切换
                dataIndex: dataIndex,
            });
        }
    }

    const dropCharts = () => {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (chartInstanceRef) {
            chartInstanceRef.dispose();
            chartInstanceRef = null;
        }
    };

    // 切换主题
    watch(() => store.isDark, (newTheme) => {
        dropCharts()
        initChart()
    });

    onMounted(() => {
        initChart()
    })

    // 在组件卸载前，清理相关资源
    onBeforeUnmount(() => {
        dropCharts()
    });

    return {
        updateCharts,
        selectSeriesIndex
    }
};

export default useInitCharts;