<script setup lang='ts'>
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import Minimize from "@/components/icons/Minimize.vue";
import Maximize from '@/components/icons/Maximize.vue';
import CloseWindow from '@/components/icons/Close.vue';

type IWindowControl = 'win-minimize' | 'win-maximize' | 'win-close'

const { t } = useI18n()

const windowControlBtnList: { icon: Component , method: IWindowControl }[] = [
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
const windowControls = (method: IWindowControl) => {
   if (method === "win-close") {
      ElMessageBox.confirm(t("notification.confirmQuite"), t("notification.info"), {
         confirmButtonText: t("notification.confirm"),
         cancelButtonText: t("notification.cancel"),
         type: "warning",
      }).then(() => {
         window.ipcApi.send("win-close")
      }).catch(() => { })
      return
   }
   window.ipcApi.send(method)
}
</script>

<template>
   <ul>
      <li v-for="(item, index) in windowControlBtnList" :key="index" @click="windowControls(item.method)">
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