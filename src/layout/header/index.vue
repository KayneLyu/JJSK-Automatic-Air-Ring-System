<script setup lang='ts'>
import ClipPath from "./Clip-Path.vue";
import WindowControls from './toolbar.vue';
import LangCheckOut from './lang.vue';

</script>

<template>
  <div class="header">
    <div class="title_container">
      <div class="logo">

      </div>
      <div class="text">
        {{ $t("layout.title") }}
      </div>
    </div>
    <div class="drag_container"></div>
    <div class="functional_container">
      
      <div class="theme_checkout">
        <ClipPath />
      </div>

      <div class="lang_checkout">
        <LangCheckOut />
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
  position: sticky;
  height: var(--height-header);
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
  height: var(--height-header);
  align-items: center;

  .theme_checkout {
    margin-right: 30px;
  }
}

.title_container {
  .text {
    font-size: 13px;
    color: #fff;
    letter-spacing: 1px;
    margin-left: 10px;
  }
}

.window_control {
  height: var(--height-header);
}
</style>