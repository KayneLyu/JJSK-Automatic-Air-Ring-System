<script setup lang='ts'>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router';
import { Eleme } from '@element-plus/icons-vue'
import { Vue3Marquee } from 'vue3-marquee'
import { useProduct } from "@/store/product";
import { useFrameStore } from '@/store/frame';
import { useApiDataStore } from "@/store/polling-data";
import { useConfigStore } from '@/store/config';
import { decimalToBinary } from "@/utils/format-data";
import { compareArrays } from "@/utils/index";
import { db } from '@/utils/dexie';
import { useI18n } from 'vue-i18n';
import { magnification } from '@/api';
import { showNotification } from '@/utils';
import dayjs from 'dayjs';
import AlarmIcon from "@/components/icons/Alert.vue";

const { t } = useI18n()
const router = useRouter()
const store = useProduct()
const pollingStore = useApiDataStore()
const frameStore = useFrameStore()
const configStore = useConfigStore()
const warningList = ref<string[]>([])
const targetThick = ref(store.param.thick)
// 存储报警数据
const saveAlarmHandle = async (addAlarmList: IAlarmsData[]) => {
  try {
    await db.Alarm.bulkAdd(addAlarmList)
  } catch (error) {
    console.error('save alarm data error!');
  }
}

watch([() => pollingStore.apiThickData.ErrCode, () => pollingStore.apiAirRingData.ErrCode], ([thickVal, airRingVal]) => {
  if (thickVal == 0 && airRingVal == 0) {
    warningList.value = []
    return
  }
  let thickErrList: string[] = []
  let ariRingErrList: string[] = []
  if (thickVal !== 0) {
    thickErrList = decimalToBinary(thickVal).map((item) => {
      return `warning1.${item}`
    })
  }
  if (airRingVal !== 0) {
    ariRingErrList = decimalToBinary(airRingVal).map((item) => {
      return `warning2.${item}`
    })
  }
  const errCodeList = [...thickErrList, ...ariRingErrList]

  const saveAlarmList = compareArrays(warningList.value, errCodeList)
  if (saveAlarmList && saveAlarmList.length) {
    let addAlarmList: IAlarmsData[] = saveAlarmList.map(item => {
      return {
        date: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        type: item.includes('warning1') ? "air" : "thick",
        content: item,
        code: item.split('.')[1]
      }
    })
    saveAlarmHandle(addAlarmList)
  }

  if (errCodeList.includes('warning2.1')) {
    frameStore.hasBadChannels = true
  }
  warningList.value = [...errCodeList]
},
  {
    immediate: true
  }
)

const loading = ref(false)
const fixScaleHandle = async () => {
  loading.value = true
  try {
    const scaleSetVal = (targetThick.value / frameStore.meanValue) * pollingStore.apiThickData.K
    await magnification(scaleSetVal)
    setTimeout(() => {
      loading.value = false
    }, 5000);
    ElNotification({
      title: t("notification.info"),
      message: t("notification.success"),
      type: "success",
      offset: 70
    })
  } catch (error) {
    showNotification(t("notification.info"), t("notification.failed"), "error")
  }
}
const changeThick = (e:FocusEvent) => {
  if( targetThick.value !== 0 && targetThick.value !== null) return
  targetThick.value = store.param.thick
}
</script>

<template>
  <div class="header">
    <div class="product_info">
      <p>{{ store.param.productName }} </p>
      <p>{{ store.param.order }} - {{ store.param.roll }}</p>
    </div>
    <div class="target_value">
      <div class="target_content">
        <p class="target_tittle">{{ t('product.target') }} : </p>
        <el-input-number v-on:blur="changeThick" class="target_input" :controls="false" v-model="targetThick" />
        <span>μm</span>
      </div>
      <div class="target_content">
        <p class="target_tittle">{{t('product.scale')}} : </p>
        <p>{{ pollingStore.apiThickData.K.toFixed(3) }}</p>
      </div>
    </div>
    <div class="update_roll">
      <!-- <div class="update_roll_content">
        <p>{{ `${useDateFormat(frameStore.lastFrame.StartTime, dateType).value} ~
          ${useDateFormat(frameStore.lastFrame.EndTime, dateType).value}` }}</p>
      </div> -->
      <el-button :loading-icon="Eleme" :loading="loading" @click="fixScaleHandle"
        style="padding: 0 10px; height: 32px; letter-spacing: 1px;" type="primary">
        {{ t('product.revise') }}
      </el-button>

      <span style="margin-left: 30px;">{{t('layout.show')}}:</span>
      <el-switch
        size="large"
        v-model="configStore.showPercent"
        class="ml-2"
        inline-prompt
        style="--el-switch-on-color: #409EFF; --el-switch-off-color: #E36781; margin-left: 5px;"
        :active-text="t('layout.percent')"
        :inactive-text="t('layout.value')"
      />
    </div>

    <div @click="router.push('/alarm')" v-if="warningList.length" class="marquee">
      <div style="margin:0 10px;">
        <el-icon :size="34" color="#e82f2f" class="icon_box">
          <AlarmIcon />
        </el-icon>
      </div>
      <Vue3Marquee :duration="6">
        <p class="marquee-item" v-for="(item, index) in warningList" :key="index">{{ $t(`${item}`) }}</p>
      </Vue3Marquee>
    </div>
  </div>
</template>

<style scoped lang="less">
.header {
  display: flex;
  align-items: center;
  width: 100%;
  height: 50px;
  border-left: 1px solid #9d9d9d17;
  background-color: var(--menu-bg);
  box-sizing: border-box;
}

:deep(.el-input__wrapper) {
  padding-left: 5px !important;
  padding-right: 5px !important;
  font-size: 15px;
}

.target_input {
  width: 40px;
  height: 25px;
  padding: 0 5px;
}

.product_info {
  margin-left: 10px;
  text-align: left;

  p:first-child {
    font-size: 18px;
    font-weight: 700;
  }
}

.update_roll {
  text-align: center;
  margin-left: 20px;
}

.update_roll_content {
  p:first-child {
    font-size: 10px;
  }
}

.target_value {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;

  .target_content {
    display: flex;

    .target_tittle {
      width: 150px;
      text-align: right;
    }

    p:last-child {
      margin-left: 5px;
    }
  }
}

.marquee {
  display: flex;
  align-items: center;
  background-color: var(--alarm-bg);
  width: 30vw;
  height: 90%;
  cursor: pointer;
  margin-left: auto;
  margin-right: 2px;
  border-radius: 3px;

  .marquee-item {
    font-size: 18px;
    font-weight: 700;
    margin: 0 50px;
  }
}

.icon_box {
  animation: alert 0.8s linear infinite alternate;
}

@keyframes alert {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}
</style>