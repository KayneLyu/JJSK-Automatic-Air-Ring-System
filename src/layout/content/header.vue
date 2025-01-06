<script setup lang='ts'>
 import { useConfigStore } from "@/store/config";
const store = useConfigStore()
</script>

<template>
 <div class="header"> 
   {{ store.product }} - {{ store.order }} - {{ store.roll }}
 </div>
</template>

<style scoped>
 .header {
    width: 100%;
    height: 50px;
    border-left: 1px solid #9d9d9d17;
    background-color: var(--menu-bg);
    box-sizing: border-box;
 }
</style>