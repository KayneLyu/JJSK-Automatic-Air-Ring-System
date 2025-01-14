<script setup lang='ts'>
import { ref } from 'vue';
 import { ArrowLeftBold, ArrowRightBold, DArrowRight, Search } from '@element-plus/icons-vue'
 import { useDateFormat, useNow } from '@vueuse/core'

const formatted = useDateFormat(useNow(), 'YYYY-MM-DD')

const pickDate = ref('')
const selectHour = ref(2)

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
    const date = useDateFormat(pickDate.value,  'YYYY-MM-DD')
    console.log(date.value)
}   

const changeHours = () => {
    console.log(selectHour.value)
}
</script>

<template>
 <div class="operate_container"> 
    <div>
        <el-button :icon="ArrowLeftBold" type="primary" size="large"></el-button>
        <el-button :icon="ArrowRightBold" type="primary" size="large"></el-button>
        <el-button :icon="DArrowRight" type="primary" size="large"></el-button>
    </div>
    <div class="date_picker">
        <el-date-picker
            v-model="pickDate"
            type="date"
            :placeholder="formatted"
            :disabled-date="disabledDate"
            size="large"
            style="width: 200px;"
            @change = "changeDate"
        />
    </div>
    <div class="hour_select">
        <el-select
            v-model="selectHour"
            placeholder="Select"
            size="large"
            style="width: 100px;"
            @change = "changeHours"
        >
            <el-option
              v-for="item in defineOptions()"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
    </el-select>
    </div>

    <div>
        <el-button :icon="Search" type="primary" size="large">查询</el-button>
    </div>
 </div>
</template>

<style scoped>
 .operate_container {
    display: flex;
    align-items: center;
    width: 100%;
    height: 60px;
 }
 .date_picker {
    margin: 0 20px;
 }
 .hour_select {
    margin-right: 20px;
 }
</style>