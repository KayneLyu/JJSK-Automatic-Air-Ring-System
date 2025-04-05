<script setup lang='ts'>
import { ref, onMounted } from 'vue';
import ProductList from './List.vue';
import ProductForm from './Form.vue';
import { db } from '@/utils/dexie';
import { useProduct } from '@/store/product';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const activeName = ref('')
const process = ref<IProductData | null>(null)
const productList = ref<IProductData[]>([])

const store = useProduct()
const getProductList = async () => {
   try {
      const data = await db.product.toArray()
      if (data.length) {
         productList.value = data
         chooseProcess(store.param.productName)
      } else {
         productList.value = []
      }
   } catch (error) {
      ElNotification({
         title: t("notification.error"),
         message: t("notification.fetFail"),
         type: "error",
         offset: 70
      })
   }
}

const chooseProcess = (name: string) => {
   activeName.value = name
   const product = productList.value.find(item => item.productName === name)
   if (product) {
      process.value = product
   }
}

const deleteProcess = (name: string) => {
   ElMessageBox.confirm(
      t('notification.confirmDelete'),
      t('notification.info'),
      {
         confirmButtonText: t('notification.confirm'),
         cancelButtonText:  t('notification.cancel'),
         type: 'warning',
      }
   )
      .then(async () => {
         if (activeName.value === store.param.productName || productList.value.length <= 1) {
            ElNotification({
               title: t('notification.error'),
               message: t('notification.cantDelete'),
               type: "error",
               offset: 70
            })
            return
         }
         try {
            await db.product.delete(name)
            getProductList()
            ElNotification({
               title: t('notification.info'),
               message: t('notification.success'),
               type: "success",
               offset: 70
            })
         } catch (error) {
            ElNotification({
               title: t('notification.info'),
               message: t('notification.failed'),
               type: "error",
               offset: 70
            })
         }
      })
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