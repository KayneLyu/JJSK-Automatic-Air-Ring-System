<script setup lang='ts'>
import { computed, watch, ref } from 'vue';
import { useApiDataStore } from '@/store/polling-data';
import { setActuatorValue } from "@/api/index";
// import dayjs from "dayjs";

const { sigmaList } = defineProps<{
  sigmaList: Array<[string, number]>
}>()

const configStore = useApiDataStore()
const rotationDeg = ref(0)
const biasValue = ref(0)

const sigmaTotalInfo = computed(() => {
  if (!sigmaList || !sigmaList.length) return
  const sigmaListData = sigmaList.map(item => item[1])
  const meanSigma = (sigmaList.reduce((acc, cur) => acc + cur[1], 0) / sigmaList.length).toFixed(1)
  const MaxNum = Math.max(...sigmaListData);
  const meanNum = Math.min(...sigmaListData);
  return {
    meanSigma,
    MaxNum,
    meanNum
  }
})

// 拿到当前初始值
watch([() => configStore.KPEData.rotation, () => configStore.KPEData.bias], ([rotation, bias]) => {
  rotationDeg.value = rotation;
  biasValue.value = bias;
},
  {
    immediate: true
  }
)

const setRotaionBias = async () => {
  try {
    await setActuatorValue(rotationDeg.value, biasValue.value)
  } catch (error) {

  }
}
</script>

<template>
  <el-card>
    <div class="info_container">
      <div class="sigma_info">
        <p>2σ{{ $t("horizon.mean") }}: <b>{{ sigmaTotalInfo?.meanSigma || 0 }}</b> %</p>
        <p>{{ $t("horizon.max") }}: <b>{{ sigmaTotalInfo?.MaxNum || 0 }}</b> %</p>
        <p>{{ $t("horizon.min") }}: <b>{{ sigmaTotalInfo?.meanNum || 0 }}</b> %</p>
      </div>

      <div class="value_set">
        <div class="value_item"> <span>{{ $t("control.rotation") }} : </span><span style="width: 80px;"><el-input size="default"
              v-model="rotationDeg" /></span>
        </div>
        <div class="value_item"><span>{{ $t("control.bias") }}: </span> <span style="width: 80px;"><el-input size="default"
              v-model="biasValue" /></span> </div>
        <div>
          <el-button @click="setRotaionBias" type="primary">{{ $t("control.apply") }}</el-button>
        </div>
      </div>

      <!-- <div class="effective_time">
        <p style="margin-bottom: 5px;">
          {{$t("horizon.effectTime")}}:
        </p>
        <p>
          <b>{{ configStore.apiAirRingData.StableTime && dayjs(configStore.apiAirRingData.StableTime).format('HH:mm:ss') }}</b>
        </p>
      </div> -->
    </div>
  </el-card>
</template>

<style scoped lang="less">
.info_container {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 200px;
  height: 100%;
  box-sizing: border-box;
  padding: 10px;
}

.sigma_info {
  p {
    font-size: 15px;
    margin-bottom: 10px;

    b {
      font-size: 15px;
    }
  }
}

.effective_time {
  width: 100%;
  border-top: 1px solid #a9a9a990;
  padding-top: 10px;

  b {
    font-size: 16px;
  }
}

.value_set {
  font-size: 14px;

  .value_item {
    display: flex;
    align-items: center;
    margin-bottom: 5px;

    span:first-child {
      min-width: 60%;
    }
  }
}
</style>