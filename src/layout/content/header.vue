<script setup lang='ts'>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router';
import { Vue3Marquee } from 'vue3-marquee'
import { useProduct } from "@/store/product";
import { useFrameStore } from '@/store/frame';
import { useApiDataStore } from "@/store/polling-data";
import { compareArrays } from "@/utils/index";
import { db } from '@/utils/dexie';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import AlarmIcon from "@/components/icons/Alert.vue";

const { t } = useI18n()
const router = useRouter()
const store = useProduct()
const pollingStore = useApiDataStore()
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

watch(() => store.param.thick, (newVal) => {
  targetThick.value = newVal
})


watch(() => pollingStore.warning.length, (value) => {
  console.log('warningList', pollingStore.warning);
  if (value == 0) {
    warningList.value = []
    return
  }

  let errorList = pollingStore.warning.map((item) => {
    const code = item.replace(/\./g, '-');
    return `alarmKun.${code}`
  })

  const saveAlarmList = compareArrays(warningList.value, errorList)
  if (saveAlarmList && saveAlarmList.length) {
    let addAlarmList: IAlarmsData[] = saveAlarmList.map(item => {
      return {
        date: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        type: "thick",
        content: item,
        code: item.split('alarmKun.')[1]
      }
    })
    saveAlarmHandle(addAlarmList)
  }
  warningList.value = [...errorList]
},
  {
    immediate: true,
  }
)

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
        <!-- <el-input-number v-on:blur="changeThick" class="target_input" :controls="false" v-model="targetThick" /> -->
        <span>μm</span>
      </div>
      <div class="target_content">
        <p class="target_tittle">{{ t('product.scale') }} : </p>
        <!-- <p>{{ pollingStore.apiThickData.K.toFixed(3) }}</p> -->
      </div>
    </div>
    <div class="update_roll">
      <!-- <div class="update_roll_content">
        <p>{{ `${useDateFormat(frameStore.lastFrame.StartTime, dateType).value} ~
          ${useDateFormat(frameStore.lastFrame.EndTime, dateType).value}` }}</p>
      </div> -->

    </div>

    <div @click="router.push('/alarm')" v-if="warningList.length" class="marquee_container">
      <div style="margin:0 10px;">
        <el-icon :size="34" color="#e82f2f" class="icon_box">
          <AlarmIcon />
        </el-icon>
      </div>
      <div>
        <Vue3Marquee :duration="10">
          <p class="marquee-item" v-for="(item, index) in warningList" :key="index">{{ $t(item) }}</p>
        </Vue3Marquee>
      </div>
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

.marquee_container {
  display: flex;
  align-items: center;
  background-color: var(--alarm-bg);
  width: 35vw;
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