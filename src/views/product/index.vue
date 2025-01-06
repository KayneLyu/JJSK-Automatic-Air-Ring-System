<script setup lang='ts'>
import { ref, onMounted } from 'vue';
import ProductList from './List.vue';
import ProductForm from './Form.vue';
import { db } from '@/utils/dexie';
import { useConfigStore } from '@/store/config';

const activeName = ref('')
const process = ref<IProductData | null>(null)
const productList = ref<IProductData[]>([])

const store = useConfigStore()
const getProductList = async () => {
   try {
      const data = await db.product.toArray()
      if (data.length) {
         productList.value = data
         chooseProcess(store.product)
      } else {
         productList.value = []
      }
   } catch (error) {
      ElNotification({
         title: '提示',
         message: "获取配置列表失败 !",
         position: 'top-right',
         type: "error",
         offset: 70
      })
   }
}

const chooseProcess = (name: string) => {
   activeName.value = name
   const product = productList.value.find(item => item.name === name)
   if (product) {
      process.value = product
   }
}

const deleteProcess = async (name: string) => {
   if (!name) {
      return
   }
   if (activeName.value === store.product || productList.value.length <= 1) {
      ElNotification({
         title: '提示',
         message: "不能删除正在应用中的配置 !",
         position: 'top-right',
         type: "error",
         offset: 70
      })
      return
   }
   try {
      await db.product.delete(name)
      getProductList()
   } catch (error) { }
}

onMounted(() => {
   getProductList()
})

</script>

<template>
   <div class="params_container">
      <el-card>
         <ProductList :activeName="activeName" :productList="productList" :chooseProcess="chooseProcess"
            :deleteProcess="deleteProcess" />
      </el-card>
      <el-card class="item_content">
         <ProductForm :process="process" :getProductList="getProductList" />
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