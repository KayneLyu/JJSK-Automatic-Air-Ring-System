<script setup lang='ts'>
import { ref, onMounted } from 'vue';
import ProductList from './List.vue';
import ProductForm from './Form.vue';
import { db } from '@/utils/dexie';

const activeName = ref('')
const process = ref<IProductData | null>(null)
const productList = ref<IProductData[]>([])
const getProductList = async () => {
   try {
      const data = await db.product.toArray()
      if (data.length) {
         productList.value = data
      }
   } catch (error) {
      console.log('get product list error:', error)
   }
}

const chooseProcess = (name: string) => {
   activeName.value = name
   const product = productList.value.find(item => item.name === name)
   if (product) {
      process.value = product
   }
}

onMounted(() => {
   getProductList()
})

</script>

<template>
   <div class="params_container">
      <el-card>
         <ProductList :activeName="activeName" :productList="productList" :chooseProcess="chooseProcess" />
      </el-card>
      <el-card class="item_content">
         <ProductForm :process="process"/>
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