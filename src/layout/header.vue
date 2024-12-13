<script setup lang='ts'>
 import ClipPath from "@/components/Clip-Path.vue";
 import WindowControls from './toolbar.vue';

</script>

<template>
 <div class="header"> 
    <div class="title_container">
      <div class="logo">

      </div>
      <div class="text">
         自动风环操作界面
      </div>
    </div>
    <div class="drag_container"></div>
    <div class="functional_container">
      <div class="theme_checkout">
         <ClipPath />
      </div>
      <div class="window_control">
         <WindowControls />
      </div>
    </div>
 </div>
</template>

<style scoped lang="less">
 .header {
   display: flex;
   height: 26px;
   justify-content: space-between;
   align-items: center;
   background-color: var(--tool-bar);
 }
 .drag_container {
   flex: 1;
   height: 100%;
   -webkit-app-region: drag;
 }
 .functional_container {
   display: flex;
 }
 .title_container {
   .text {
      font-size: 13px;
   }
 }
</style>