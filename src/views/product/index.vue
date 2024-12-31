<script setup lang='ts'>
import ProductList from './List.vue';
import ProductForm from './Form.vue';
</script>

<template>
   <div class="params_container">
      <el-card>
         <ProductList />
      </el-card>
      <el-card class="item_content">
         <ProductForm />
      </el-card>
   </div>
</template>

<style scoped lang="less">
.params_container {
   width: 100%;
   height: 100%;
   display: flex;
}

:deep(.el-card__body) {
   padding: 10px;
}

.item_content {
   flex: 1;
   margin-left: 10px;
   padding: 20px;
}

</style>