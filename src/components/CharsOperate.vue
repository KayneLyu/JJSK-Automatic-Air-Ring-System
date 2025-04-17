<script setup lang='ts'>
import { ref } from 'vue';
import { ArrowLeftBold, ArrowRightBold, DArrowRight, Search, DArrowLeft } from '@element-plus/icons-vue'
import { useDateFormat, useNow } from '@vueuse/core'
import LatestIcon from "@/components/icons/Latest.vue";

const formatted = useDateFormat(useNow(), 'YYYY-MM-DD')

const pickDate = ref('')
const selectHour = ref(2)
//倒计时
const timeToLatest = ref(0)
const defineOptions = () => {
    let optionList = []
    for (let index = 1; index < 25; index++) {
        optionList.push({
            value: index,
            label: index + ' 小时'
        })
    }
    return optionList
}

const disabledDate = (time: Date) => {
    return time.getTime() > Date.now()
}

const changeDate = () => {
    const date = useDateFormat(pickDate.value, 'YYYY-MM-DD')
    console.log(date.value)
}

const changeHours = () => {
    console.log(selectHour.value)
}
const getTrendDataList = () => {
}
</script>

<template>
    <el-card class="card_content">
        <div class="operate_container">
            <div>
                <el-button :icon="ArrowLeftBold" type="primary" size="large"></el-button>
                <el-button :icon="ArrowRightBold" type="primary" size="large"></el-button>
            </div>
            <div>
                <span style="margin-left: 10px; margin-right: 5px;">步进</span>
                <el-input-number  :controls="false" style="width: 60px;"></el-input-number>
            </div>
            <div style="margin-left: 100px;">
                <el-button :icon="Search" type="primary" size="large">查询</el-button>
            </div>
            <div class="date_picker">
                <el-date-picker v-model="pickDate" type="date" :placeholder="formatted" :disabled-date="disabledDate"
                    size="large" style="width: 150px;" @change="changeDate" />
            </div>
            <div class="hour_select">
                <el-select v-model="selectHour" placeholder="Select" size="large" style="width: 100px;"
                    @change="changeHours">
                    <el-option v-for="item in defineOptions()" :key="item.value" :label="item.label"
                        :value="item.value" />
                </el-select>
            </div>

            <div class="control_btn">
                <el-button :icon="DArrowLeft" type="primary" size="large"></el-button>
                <el-button :icon="DArrowRight" type="primary" size="large"></el-button>
                <el-badge v-if="timeToLatest > 0" style="margin-left: 15px;" :value="timeToLatest">
                    <el-button @click="() => getTrendDataList()" size="large" type="primary">
                        <el-icon :size="20" color="#fff">
                            <LatestIcon />
                        </el-icon>
                    </el-button>
                </el-badge>
                <el-button v-else @click="() => getTrendDataList()" size="large" type="primary">
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