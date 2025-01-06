<script setup lang='ts'>
import { ref, reactive, watch } from 'vue';
import { ArrowDown, ArrowUp, Eleme } from '@element-plus/icons-vue'
import { useApiDataStore } from '@/store/polling-data';
import { useConfigStore } from "@/store/config";
import { magnification } from '@/api';

import { db } from '@/utils/dexie';

const props = defineProps<{
    process: null | IProductData,
    getProductList: () => void
}>()

const store = useApiDataStore()
const configStore = useConfigStore()
const form = reactive({
    name: 'ABCDE',
    order: '00000001',
    roll: 1,
    thick: 80,
    tolerance: 5,
    scale: store.apiThickData.K
});

watch(props, (newVal) => {
    if (newVal.process) {
        form.name = newVal.process.name
        form.order = newVal.process.order
        form.roll = newVal.process.roll
        form.thick = newVal.process.thick
        form.tolerance = newVal.process.tolerance,
        form.scale = store.apiThickData.K
    }
},
    {
        immediate: true
    }
)

const buttonLoading = ref(false)
const showCompute = ref(false)

// 计算并设置放大倍数
const computeScale = () => {
    buttonLoading.value = true
    const displayValue = 80
    setTimeout(() => {
        const scale = (form.thick / displayValue) * store.apiThickData.K
        form.scale = 1.2
        buttonLoading.value = false
        ElNotification({
         title: '提示',
         message: "计算完成,如需生效请点击应用按钮 !",
         position: 'top-right',
         type: "success",
         offset: 70
      })
    }, 2000)
}

// 应用、保存配置
const onSubmit = async () => {
    const saveData = {
        name: form.name,
        order: form.order,
        roll: form.roll,
        thick: form.thick,
        tolerance: form.tolerance
    }
    configStore.product = form.name
    configStore.order = form.order
    configStore.roll = form.roll
    try {
        await db.product.put(saveData)
        await magnification(form.scale)
        props.getProductList()
        ElNotification({
         title: '提示',
         message: "应用成功 !",
         position: 'top-right',
         type: "success",
         offset: 70
      })
    } catch (error) {
        ElNotification({
         title: '提示',
         message: "应用失败 !",
         position: 'top-right',
         type: "error",
         offset: 70
      })
    }
}

</script>

<template>
    <el-form size="large" :model="form" label-width="100" style="max-width: 500px">
        <el-form-item :label="$t('product.name')">
            <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="$t('product.order')">
            <el-input v-model="form.order" />
        </el-form-item>
        <el-form-item :label="$t('product.roll')">
            <el-input-number v-model="form.roll" :min="0" :max="1000" :precision="0" />
        </el-form-item>
        <el-form-item :label="$t('product.thick')">
            <el-input-number v-model="form.thick" :min="10" :max="500" :precision="1" />
        </el-form-item>
        <el-form-item :label="$t('product.tolerance')">
            <el-input-number v-model="form.tolerance" :min="1" :max="50" :precision="0" />
        </el-form-item>
        <el-form-item :label="$t('product.scale')">
            <el-input-number class="scale" v-model="form.scale" :step="0.1" :min="1" :max="50" :precision="3" />
            <el-button style="margin-left: 20px;" type="primary" size="large" @click="() => showCompute = !showCompute">
                修正
                <el-icon style="margin-left: 5px;">
                    <component :is="showCompute ? ArrowUp : ArrowDown" />
                </el-icon>
            </el-button>
        </el-form-item>
        <el-form-item v-if="showCompute" :label="$t('product.actual')">
            <el-input-number v-model="form.thick" :min="10" :max="500" :precision="1" />
        </el-form-item>
        <el-form-item v-if="showCompute" :label="$t('product.display')">
            <el-input-number v-model="form.thick" :min="10" :max="500" :precision="1" />
            <el-button @click="computeScale" :loading="buttonLoading" :loading-icon="Eleme"
                style="margin-left: 20px;  font-size: 15px;" type="warning" size="large">
                {{ buttonLoading ? $t('product.counting') : $t('product.setting') }}
            </el-button>
        </el-form-item>
        <el-form-item>
            <el-button style="margin-top: 30px;" type="primary" @click="onSubmit">{{ $t("product.save") }}</el-button>
        </el-form-item>
    </el-form>
</template>

<style scoped lang="less">
.scale {
    color: red;
    :deep(.el-input__inner) {
        color: rgb(255, 0, 0);
        font-weight: 700;
    }
}
</style>