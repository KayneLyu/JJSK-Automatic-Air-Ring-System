<script setup lang='ts'>
import { ref, onMounted } from 'vue';
import {
    Search,
    RefreshRight
} from '@element-plus/icons-vue'
import TableComponent from './table.vue';
import { clearThickWarningList, clearAirRingWarningList } from '@/api/index';
import { showNotification } from '@/utils/common';
import dayjs from 'dayjs';

import { useI18n } from 'vue-i18n';
const { t } = useI18n();

const tableChild = ref<InstanceType<typeof TableComponent> | null>(null)
const datePick = ref(Date.now())
const showItems = ref(10)
const disabledDate = (time: Date) => {
    return time.getTime() > Date.now()
}

const resetAlert = async () => {
    try {
        await clearThickWarningList()
        await clearAirRingWarningList()
        showNotification(t("notification.info"), t("notification.resetSuccess"), "success")
    } catch (error) {
        showNotification(t("notification.info"), t("notification.resetError"), "error")
    }
}

// 按日期查询
const getTableList = () => {
    // 确保 tableChild 已经初始化
    if (!tableChild?.value) return;
    const formattedDate = dayjs(datePick.value).format('YYYY-MM-DD');
    tableChild.value.getWarningList(formattedDate);
}

const options = [
    {
        value: 10,
        label: '10条'
    },
    {
        value: 20,
        label: '20条'
    },
    {
        value: 30,
        label: '30条'
    },
    {
        value: 40,
        label: '40条'
    },
    {
        value: 50,
        label: '50条'
    }
]
// 显示最近记录
const changeShowItems = () => {
    if (!tableChild?.value) return;
    tableChild.value.getWarningList(datePick.value,showItems.value);
}

onMounted(() => {
    changeShowItems()
})

</script>

<template>
    <el-card class="content">
        <div class="btn_container">
            <el-button size="large" :icon="RefreshRight" type="danger" @click="resetAlert">{{ t('alarm.reset')
            }}</el-button>
            <div class="search">

                <el-date-picker v-model="datePick" :clearable="false" type="date" :disabled-date="disabledDate"
                    size="large" style="width: 160px;" />
                <el-button style="margin-left: 10px;" :icon="Search" size="large" type="primary"
                    @click="getTableList">{{ t('alarm.query') }}</el-button>
            </div>

            <div class="show_recently">
                <p>显示最近记录:</p>
                <el-select @change="changeShowItems"
                    v-model="showItems"
                    style="width: 90px; margin: 0 6px;
                    ">
                    <el-option
                        v-for="item in options"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                </el-select>
            </div>
        </div>

        <div class="table_content">
            <TableComponent ref="tableChild" />
        </div>
    </el-card>
</template>

<style scoped>
.content {
    width: 100%;
    height: 100%;
}

.btn_container {
    display: flex;
}

.IO_btn {
    margin-left: 50px;
}

.search {
    margin-left: 40px;
}

.table_content {
    overflow: hidden;
}

.show_recently {
    display: flex;
    align-items: center;
    margin-left: 100px;
}

.show_recently p {
    font-size: 16px;
}
</style>