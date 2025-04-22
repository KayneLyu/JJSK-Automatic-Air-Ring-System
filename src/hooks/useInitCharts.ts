import { onBeforeUnmount, watch, useTemplateRef, onMounted } from 'vue';
import * as echarts from 'echarts/core';
import { useConfigStore } from '@/store/config'
import type { EChartsCoreOption } from 'echarts/core';

const useInitCharts = (containerName: string, options: EChartsCoreOption, propsData?: any[]) => {
    const chartRef = useTemplateRef<HTMLElement>(containerName);
    let chartInstanceRef: echarts.ECharts | null = null
    let observer: ResizeObserver | null = null

    const store = useConfigStore();
    // 初始化图表函数，提取出来方便复用和单独处理逻辑
    const initChart = () => {
        if (chartRef.value) {
            try {
                chartInstanceRef = echarts.init(chartRef.value, store.isDark ? 'dark' : '');
                chartInstanceRef.setOption(options);
                if(propsData?.length) {
                    chartInstanceRef.setOption({
                        series: propsData
                    });
                }
            } catch (error) {
                ElMessage.error('初始化图表时出错!');
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
                seriesIndex: 0, //两个图标同时展示
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

    // 监听store.theme的变化，以便更新echarts实例的主题
    watch(store, (newTheme) => {
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