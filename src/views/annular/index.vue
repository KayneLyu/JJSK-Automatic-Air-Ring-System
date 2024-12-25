<script setup lang='ts'>
import { ref } from 'vue';
 import { useIntervalFn } from '@vueuse/core'



const num = ref(0)
const count = ref(100)

const changeCount = (seconds: number) => {
   count.value = seconds * 1000
}
const { pause, resume, isActive } = useIntervalFn(() => {
  /* your function */
  num.value++
}, count.value)
</script>

<template>
 <div> 
   <p>{{ num }}</p>
    <el-button @click="changeCount(1)"> 1S</el-button>
    <el-button @click="changeCount(3)"> 3S</el-button>
    <el-button @click="pause"> 停止 </el-button>
    <el-button @click="resume"> 开始 </el-button>
 </div>
</template>

<style scoped>
   
</style>