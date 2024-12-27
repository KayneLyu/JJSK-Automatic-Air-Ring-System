<script setup lang='ts'>
 import StateComponent from './State.vue';
 import SigmaCharts from './SigmaCharts.vue';
 import Segmented from "./Segmented.vue";
 import RelationCharts from './RelationCharts.vue';
</script>

<template>
 <div> 
    <StateComponent />
    <el-card>
      <SigmaCharts />
    </el-card>

    <el-card>
      <RelationCharts />
    </el-card>
    <Segmented />
 </div>
</template>

<style scoped>
 
</style>