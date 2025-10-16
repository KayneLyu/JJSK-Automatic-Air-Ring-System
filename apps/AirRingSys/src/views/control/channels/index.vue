<script setup lang='ts'>
import { ref } from 'vue'
import SaveIcon from '@/components/icons/Save.vue';
import HistoryIcon from "@/components/icons/History.vue";
import ChannelCharts from './charts.vue';
import { db } from '@/utils/dexie.ts';
import { showNotification } from '@/utils';
import { setAutoRingHeats } from '@/api';

const { currentId, getCurrentChannel } = defineProps<{
    currentId: number,
    getCurrentChannel: () => void,
}>()

const centerDialogVisible = ref(false)
const currentName = ref('')
const chooseName = ref('')
const isSave = ref(true)
const channelList = ref<ISaveHeats[]>([])

const frameInfo = ref({
    frameData: [],
    mean: 0,
    width: 0,
    sigma: 0,
    currentId: 0,
    startDate: '',
    endDate: '',
    heatsData: []
})
const showDialog = (show: boolean) => {
    centerDialogVisible.value = show
}

// 保存操作
const handleSave = async () => {
    if (currentName.value === '') {
        showNotification('error', '请输入通道名称', 'error')
        return
    }
    try {
        await db.Channel.put({
            frameId: currentId,
            name: currentName.value,
        })
        centerDialogVisible.value = false
        showNotification('success', '保存成功', 'success')
        currentName.value = ""
    } catch (error) { }
}

// 获取对应数据
const getCurrentRecord = async (id: number) => {
    try {
        const frameData = await db.Frame.get(id)
        const heatsData = await db.Heats.get(id)
        if (frameData && heatsData) {
            frameInfo.value = {
                frameData: frameData.datalist as [],
                mean: frameData.mean,
                sigma: frameData.sigmaPercent,
                currentId: id,
                startDate: frameData.startTime,
                endDate: frameData.endTime,
                width: frameData.width,
                heatsData: heatsData.heats as []
            }
        }
    } catch (error) { }
}

// 显示保存dialog
const showSavaHandle = () => {
    isSave.value = true
    getCurrentRecord(currentId)
    centerDialogVisible.value = true
}
const getHistoryHandle = async () => {
    try {
        const result = await db.Channel.toArray()
        if (result?.length) {
            channelList.value = result
            const id = result[0].frameId
            chooseName.value = result[0].name
            getCurrentRecord(id)
        }
    } catch (error) {}
}

// 显示历史dialog
const showHistoryHandle = async () => {
    isSave.value = false
    await getHistoryHandle()
    centerDialogVisible.value = true
}

const chooseChannelHandle = (name: string, id:number) => { 
    chooseName.value = name
    getCurrentRecord(id)
}
// 删除通道
const deleteChannel = async () => {
    try {
        await db.Channel.delete(chooseName.value)
        await getHistoryHandle()
        showNotification('success', '删除成功', 'success')
    } catch (error) {
        showNotification('error', '删除失败', 'error')
    } 
}

// 应用通道
const applyChannel = async () => {
    try {
        const setHeats = frameInfo.value.heatsData
        await setAutoRingHeats(setHeats)
        await getCurrentChannel()
        centerDialogVisible.value = false
        showNotification('success', '应用成功', 'success')
    } catch (error) {
        showNotification('error', '应用失败', 'error')
    }
}

</script>

<template>
    <el-dialog class="dialog_container" destroy-on-close v-model="centerDialogVisible" :title=" isSave? $t('control.saveDuct') : $t('control.history')" width="1100"
        align-center>
        <div class="dialog_content">
            <div v-if="isSave" class="charts_list">
                <el-input :placeholder="$t('control.input')" v-model="currentName" size="large" />
            </div>

            <div v-else class="charts_list">
                <el-scrollbar >
                    <p v-for="(item, index) in channelList" 
                    :key="index"
                    :class="chooseName === item.name ? 'scrollbar-item-active' : ''" 
                    @click="chooseChannelHandle(item.name, item.frameId)"
                    class="scrollbar-demo-item">{{ item.name }}</p>
                </el-scrollbar>
            </div>
            <div class="charts">
                <ChannelCharts :frame-data="frameInfo" />
            </div>
        </div>
        <template #footer>
            <div v-if="isSave" class="dialog-footer">
                <el-button @click="showDialog(false)">{{ $t('notification.cancel') }}</el-button>
                <el-button type="primary" @click="handleSave">
                    {{ $t('notification.save') }}
                </el-button>
            </div>

            <div v-else class="dialog-footer">
                <el-button @click="showDialog(false)">{{ $t('notification.cancel') }}</el-button>
                <el-button @click="deleteChannel" type="danger">{{ $t('product.delete') }}</el-button>
                <el-button @click="applyChannel" type="primary" >
                    {{ $t('product.save') }}
                </el-button>
            </div>
        </template>



    </el-dialog>
    <div class="channel-control" @click="showSavaHandle">
        <p><el-button type="warning" :icon="SaveIcon"></el-button></p>
        <p>{{ $t("control.saveDuct")}}</p>
    </div>
    <div class="channel-control" @click="showHistoryHandle">
        <p><el-button type="warning" :icon="HistoryIcon"></el-button></p>
        <p>{{ $t("control.history")}}</p>
    </div>
</template>

<style scoped lang="less">
.channel-control {
    text-align: center;
}

.dialog_content {
    display: flex;
    width: 1050px;
    height: 400px;
    text-align: center;

    .charts_list {
        width: 160px;
        margin-right: 10px;

        ul {
            width: 100%;
            height: 100px;
            overflow: auto;

            li {
                height: 40px;
                line-height: 40px;
                background-color: #2A598A;
                border-radius: 5px;
                margin-top: 5px;
                text-align: left;
                font-size: 16px;
                padding: 0 10px;
            }
        }
    }

    .charts {
        flex: 1;
        height: 400px;
    }
}

p {
    text-align: center;
    font-size: 13px;
    margin-top: 4px;
}
.scrollbar-demo-item {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  margin: 10px;
  text-align: center;
  border-radius: 4px;
  background: var(--el-color-primary-light-9);
}

.scrollbar-item-active {
    background-color: #409EFF !important;
    color: #fff;
}
</style>