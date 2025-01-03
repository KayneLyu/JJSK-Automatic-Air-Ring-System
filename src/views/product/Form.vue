<script setup lang='ts'>
import { ref, reactive, watch } from 'vue';
import { ArrowDown, ArrowUp, Eleme } from '@element-plus/icons-vue'
import { useApiDataStore } from '@/store/polling-data';

import { db } from '@/utils/dexie';

const props = defineProps<{
    process: null | IProductData
}>()

const store = useApiDataStore()
const form = reactive({
    name: 'ABCD',
    order: '123456',
    roll: 1,
    thick: 80,
    tolerance: 5,
    scale: store.apiThickData.K
});

watch(props,(newVal) =>{
    if(newVal.process){
        form.name = newVal.process.name
        form.order = newVal.process.order
        form.roll = newVal.process.roll
        form.thick = newVal.process.thick
        form.tolerance = newVal.process.tolerance
    }
})

const buttonLoading = ref(false)
const showCompute = ref(false)
// 保存配置
const onSubmit = async () => {
    const saveData = {
        name: form.name,
        order: form.order,
        roll: form.roll,
        thick: form.thick,
        tolerance: form.tolerance
    }
    try {
        await db.product.put(saveData)
        console.log('save product success')
    } catch (error) {
        console.log('save product error:', error)
    }
}

// 计算并设置放大倍数
const computeScale = () => {
    buttonLoading.value = true
    setTimeout(() => {
        form.scale = 1.2
        buttonLoading.value = false
    }, 2000)
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
        <el-form-item label="卷号">
            <el-input-number v-model="form.roll" :min="0" :max="1000" :precision="0" />
        </el-form-item>
        <el-form-item label="厚度">
            <el-input-number v-model="form.thick" :min="10" :max="500" :precision="1" />
        </el-form-item>
        <el-form-item label="公差">
            <el-input-number v-model="form.tolerance" :min="1" :max="50" :precision="0" />
        </el-form-item>
        <el-form-item label="放大倍数">
            <el-input-number class="scale" v-model="form.scale" :step="0.1" :min="1" :max="50" :precision="3" />
            <el-button style="margin-left: 20px;" type="primary" size="large" @click="() => showCompute = !showCompute">
                修正
                <el-icon style="margin-left: 5px;">
                    <component :is="showCompute ? ArrowUp : ArrowDown" />
                </el-icon>
            </el-button>
        </el-form-item>
        <el-form-item v-if="showCompute" label="真实值">
            <el-input-number v-model="form.thick" :min="10" :max="500" :precision="1" />
        </el-form-item>
        <el-form-item v-if="showCompute" label="显示值">
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