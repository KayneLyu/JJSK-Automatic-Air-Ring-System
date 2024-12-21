<script setup lang='ts'>
import Minimize from "@/components/icons/Minimize.vue";
import Maximize from '@/components/icons/Maximize.vue';
import CloseWindow from '@/components/icons/Close.vue';

const windowControlBtnList = [
   {
      icon: Minimize,
      method: "win-minimize",
   },
   {
      icon: Maximize,
      method: "win-maximize",
   },
   {
      icon: CloseWindow,
      method: "win-close",
   },
]
const windowControls = (method: string) => {
   window.ipcRenderer.send(method)
}
</script>

<template>
   <ul>
      <li v-for="(item, index) in windowControlBtnList" :key="index"  @click="windowControls(item.method)">
         <i class="icon_style">
            <component :is="item.icon" />
         </i>
      </li>
   </ul>
</template>

<style scoped lang="less">
ul {
   display: flex;
   li {
      height: 100%;
      padding: 2px 14px;
      cursor: pointer;
      box-sizing: border-box;
      height: var(--height-header);
      line-height: var(--height-header);
      &:hover {
         background: var(--color-tool-btn-bg);
      }
      &:last-of-type:hover {
         background: red;
      }
   } 
}
.icon_style {
   font-size: 14px;
}
</style>