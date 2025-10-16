<script setup lang='ts'>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue';
import { ArrowLeftBold, ArrowRightBold, DArrowRight, Search, DArrowLeft } from '@element-plus/icons-vue'
import { useDateFormat, useNow, useTimeoutFn } from '@vueuse/core'
import LatestIcon from "@/components/icons/Latest.vue";
import { useFrameStore } from '@/store/frame.ts';
import { useConfigStore } from '@/store/config.ts';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const props = defineProps<{
    nextPageQuery: (isNext: boolean) => void,
    getTrendDataList: (date?: string) => void,
    changeStep: (step: number) => void,
    currentIndex: number,
    lastFrameIndex: number,
    lastFrameId: number,
    currentId: number,
    isFreshData: boolean
}>()
const store = useFrameStore()
const configStore = useConfigStore()

const formatted = useDateFormat(useNow(), 'YYYY-MM-DD')

// 选择日期
const pickDate = ref('')
// 小时
const selectHour = ref(2)
//倒计时
const timeToLatest = ref(0)
// 步进
const stepNumber = ref(1)

const emit = defineEmits(['send'])
const defineOptions = () => {
    let optionList = []
    for (let index = 1; index <= 6; index++) {
        optionList.push({
            value: index,
            label: index + ' ' + t("control.hours")
        })
    }
    return optionList
}

const disabledDate = (time: Date) => {
    return time.getTime() > Date.now()
}

const changeDate = (e: string) => {
    pickDate.value = useDateFormat(e, 'YYYY-MM-DD').value
}

const changeHours = (e: number) => {
    configStore.queryHours = e
}

// 开始倒计时
const { start, stop } = useTimeoutFn(() => {
    timeToLatest.value -= 1
    if (timeToLatest.value <= 0) {
        props.getTrendDataList()
        pickDate.value = useDateFormat(new Date(), 'YYYY-MM-DD').value
        stop()
        return
    }
    start()
}, 1000, { immediate: false }) // 组件加载不执行

// 监听触发倒计时条件
watch([() => props.isFreshData, () => props.currentId], ([isFresh, index]) => {
    stop()
    if (!isFresh) {
        timeToLatest.value = 30
        start()
    } else {
        timeToLatest.value = 0
    }
})

// 根据ID更新视图
watch(() => store.updateFrameId, (newIndex) => {
    if (timeToLatest.value > 0) return
    props.getTrendDataList()
})

onBeforeUnmount(() => {
    stop()
})
onMounted(() => {
    props.getTrendDataList()
})

</script>

<template>
    <el-card class="card_content">
        <div class="operate_container">
            <div>
                <el-button @click="changeStep(-stepNumber)" :icon="ArrowLeftBold" type="primary"
                    size="large"></el-button>
                <el-button @click="changeStep(stepNumber)" :disabled="store.updateFrameId == currentId"
                    :icon="ArrowRightBold" type="primary" size="large"></el-button>
            </div>
            <div>
                <span style="margin-left: 10px; margin-right: 5px;">{{ t("control.step")}}</span>
                <el-input-number v-model="stepNumber" :controls="false" style="width: 60px;"></el-input-number>
            </div>
            <div style="margin-left: 100px;">
                <el-button @click="getTrendDataList(pickDate)" :icon="Search" type="primary" size="large">{{ t("control.query")}}</el-button>
            </div>
            <div class="date_picker">
                <el-date-picker v-model="pickDate" type="date" :placeholder="formatted" :disabled-date="disabledDate"
                    size="large" style="width: 150px;" @change="changeDate" />
            </div>
            <div class="hour_select">
                <el-select v-model="selectHour" placeholder="Select" size="large" style="width: 110px;"
                    @change="changeHours">
                    <el-option v-for="item in defineOptions()" :key="item.value" :label="item.label"
                        :value="item.value" />
                </el-select>
            </div>

            <div class="control_btn">
                <el-button @click="nextPageQuery(true)" :icon="DArrowLeft" type="primary" size="large"></el-button>
                <el-button @click="nextPageQuery(false)" :disabled="store.updateFrameId == lastFrameId"
                    :icon="DArrowRight" type="primary" size="large"></el-button>
                <el-badge v-if="timeToLatest > 0" style="margin-left: 15px;" :value="timeToLatest">
                    <el-button @click="getTrendDataList()" size="large" type="primary">
                        <el-icon :size="20" color="#fff">
                            <LatestIcon />
                        </el-icon>
                    </el-button>
                </el-badge>
                <el-button v-else @click="getTrendDataList()" size="large" type="primary">
                    <el-icon :size="20" color="#fff">
                        <LatestIcon />
                    </el-icon>
                </el-button>
            </div>
        </div>
    </el-card>
</template>

<style scoped lang="less">
.card_content {
    width: 100%;

    :deep(.el-card__body) {
        padding: 10px;
    }
}

.operate_container {
    display: flex;
    align-items: center;
    width: 100%;
}

.date_picker {
    margin: 0 20px;
}

.control_btn {
    margin-left: auto;
    margin-right: 20px;
}
</style>