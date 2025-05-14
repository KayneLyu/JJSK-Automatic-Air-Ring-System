<script setup lang='ts'>
 import { computed } from 'vue';

 const { sigmaList } = defineProps<{
   sigmaList: Array<[string, number]>
 }>()
 const sigmaTotalInfo = computed(() => {
   if (!sigmaList || !sigmaList.length) return
   const sigmaListData = sigmaList.map(item => item[1])
   const meanSigma = (sigmaList.reduce((acc, cur) => acc + cur[1], 0) / sigmaList.length).toFixed(1)
   const MaxNum =  Math.max(...sigmaListData);
   const meanNum =  Math.min(...sigmaListData);
   return {
      meanSigma,
      MaxNum,
      meanNum
   }
 })
</script>

<template>
 <div class="info_container"> 
   <p>2σ平均值: {{ sigmaTotalInfo?.meanSigma }}</p>
   <p>2σ最大值: {{ sigmaTotalInfo?.MaxNum }}</p>
   <p>2σ最小值: {{ sigmaTotalInfo?.meanNum }}</p>
 </div>
</template>

<style scoped>
 .info_container {
    width: 200px;
    height: 100%;
 }
</style>