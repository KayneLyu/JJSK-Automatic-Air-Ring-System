<script lang="ts" setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { db } from '@/utils/dexie';

const { t } = useI18n();

const tableData = ref<IAlarmsData[]>([])
const getWarningList = async (queryDate: string | number, limitNumber?: number,) => {
    let result: IAlarmsData[] = [];
    try {
        if (limitNumber) {
            result = await db.Alarm.reverse().limit(limitNumber).toArray()
        } else {
            result = await db.Alarm.where('date').between(`${queryDate} 00:00:00`, `${queryDate} 23:59:59`).reverse().toArray()
        }
        if (result && result.length) {
            tableData.value = result
        } else {
            tableData.value = []
        }
    } catch (error) {
        ElNotification({
            title: t("notification.info"),
            type: "error",
            message: t("notification.readError"),
            position: 'bottom-right',
        })
    }
}

defineExpose({
    getWarningList
})
</script>

<template>
    <el-table class="table_container" size="large" :row-style="{ backgroundColor: 'transparent' }"
        :header-cell-style="{ backgroundColor: 'transparent' }" :header-row-style="{ backgroundColor: 'transparent' }"
        highlight-current-row :data="tableData" height="760" style="width: 99%">
        <el-table-column prop="id" label="ID" width="90" />

        <el-table-column prop="date" :label="t('alarm.time')" width="250">
        </el-table-column>
        <el-table-column prop="type" :label="t('alarm.type')" width="150">
            <template #default="scope">
                <span>{{ scope.row.type == 'air' ?  t('layout.ring'):  $t('layout.gauge') }}</span>
            </template>
        </el-table-column>
        <el-table-column prop="code" :label="t('alarm.code')" width="150" />
        <el-table-column :label="t('alarm.content')">
            <template #default="scope">
                <span>{{ scope.row.content && t(`${scope.row.content}`) }}</span>
            </template>
        </el-table-column>
    </el-table>
</template>

<style scoped lang="less">
.table_container {
    margin-top: 30px;
    background: transparent !important;
}
</style>