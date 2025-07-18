<script setup lang='ts'>
import { computed } from 'vue';
import { useApiDataStore } from '@/store/polling-data';
import dayjs from "dayjs";

const { sigmaList } = defineProps<{
  sigmaList: Array<[string, number]>
}>()

const configStore = useApiDataStore()

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
</script>

<template>
  <el-card>
    <div class="info_container">
      <div class="sigma_info">
        <p>2σ{{$t("horizon.mean")}}: <b>{{ sigmaTotalInfo?.meanSigma || 0 }}</b> %</p>
        <p>{{$t("horizon.max")}}: <b>{{ sigmaTotalInfo?.MaxNum  || 0 }}</b> %</p>
        <p>{{$t("horizon.min")}}: <b>{{ sigmaTotalInfo?.meanNum || 0 }}</b> %</p>
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
</style>