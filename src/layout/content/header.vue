<script setup lang='ts'>
import { useProduct } from "@/store/product";
const store = useProduct()
</script>

<template>
  <div class="header">
    <div class="product_info">
      <p>{{ store.param.productName }} </p>
      <p>{{ store.param.order }} - {{ store.param.roll }}</p>
    </div>
  </div>
</template>

<style scoped lang="less">
.header {
  width: 100%;
  height: 50px;
  border-left: 1px solid #9d9d9d17;
  background-color: var(--menu-bg);
  box-sizing: border-box;
}
</style>