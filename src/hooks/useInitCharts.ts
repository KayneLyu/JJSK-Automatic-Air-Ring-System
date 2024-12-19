import { onBeforeUnmount, watch, useTemplateRef, onMounted } from 'vue';
import * as echarts from 'echarts/core';
import { useLangStore } from '@/store/lang'
import type { EChartsCoreOption } from 'echarts/core';

// 用于防抖的辅助函数（可根据实际情况调整防抖时间间隔）
function debounce(func: Function, delay: number) {
    let timer: ReturnType<typeof setTimeout>;
    return function(this: any,...args: any[]) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
const useInitCharts = (containerName: string, options: EChartsCoreOption) => {
    const chartRef = useTemplateRef<HTMLElement>(containerName);
    let chartInstanceRef: echarts.ECharts | null = null
    let observer: ResizeObserver | null = null

    const store = useLangStore();
    // 初始化图表函数，提取出来方便复用和单独处理逻辑
    const initChart = () => {
        if (chartRef.value) {
            try {
                chartInstanceRef = echarts.init(chartRef.value, store.theme);
                chartInstanceRef.setOption(options);
            } catch (error) {
                console.error('初始化 Echarts 图表时出错：', error);
                throw error;
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
    const updateCharts = () => {
        if (chartRef.value) {
            chartInstanceRef?.setOption(options);
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

    return updateCharts
};

export default useInitCharts;