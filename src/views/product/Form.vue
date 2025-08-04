<script setup lang='ts'>
import { ref, reactive, watch } from 'vue';
import { ArrowDown, ArrowUp, Eleme } from '@element-plus/icons-vue'
import { useProduct } from "@/store/product";
import { useFrameStore } from "@/store/frame";
// import { isValidNumber } from '@/utils';
import { setCalibration } from '@/api';
import { db } from '@/utils/dexie';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
    process: null | IProductData,
    getProductList: () => void
}>()

const { t } = useI18n()

const productStore = useProduct()
const frameStore = useFrameStore();
const form = reactive({
    productName: 'ABCDE',
    order: '00000001',
    roll: 1,
    thick: productStore.param.thick,
    displayValue: frameStore.meanValue,
    tolerance: 5,
    scale: 1,
    trigAlert: true
});

watch(() => props.process, async (newVal) => {
    if (newVal) {
        Object.assign(form, {
            ...newVal,
            displayValue: frameStore.meanValue
        })
    }
},
    {
        immediate: true
    }
)

const buttonLoading = ref(false)
const showCompute = ref(false)

// 计算并设置放大倍数
const computeScale = async () => {
    // if (!isValidNumber(store.apiThickData.K)) {
    //     ElNotification({
    //         title: t("notification.error"),
    //         message: t("notification.invalidNumber"),
    //         type: "error",
    //         offset: 70
    //     })
    //     return
    // }
    buttonLoading.value = true
    setTimeout(() => {
        const newVal = (form.thick / form.displayValue) * productStore.param.scale
        form.scale = Number(newVal.toFixed(3))
        buttonLoading.value = false
        ElNotification({
            title: t("notification.info"),
            message: t("notification.calcComplete"),
            type: "success",
            offset: 70
        })
    }, 2000)
}

// 应用、保存配置
const onSubmit = async () => {
    buttonLoading.value = true
    try {
        await setCalibration(form.scale, form.thick)
        await db.product.put({ ...form })
        productStore.updateProduction(form)
        props.getProductList()
        ElNotification({
            title: t("notification.info"),
            message: t("notification.success"),
            type: "success",
            offset: 70
        })
        buttonLoading.value = false
    } catch (error) {
        ElNotification({
            title: t("notification.info"),
            message: t("notification.failed"),
            type: "error",
            offset: 70
        })
        buttonLoading.value = false
    }
}

</script>

<template>
    <el-form size="large" :model="form" label-width="200" style="max-width: 600px">
        <el-form-item :label="$t('product.name')">
            <el-input v-model="form.productName" />
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
        <el-form-item :label="$t('product.trig')">
            <el-switch v-model="form.trigAlert" size="large"  />
        </el-form-item>
        <el-form-item :label="$t('product.scale')">
            <el-input-number class="scale" v-model="form.scale" :step="0.1" :max="50" :precision="3" />
            <el-button style="margin-left: 20px;" type="primary" size="large" @click="() => showCompute = !showCompute">
                {{ $t("product.revise") }}
                <el-icon style="margin-left: 5px;">
                    <component :is="showCompute ? ArrowUp : ArrowDown" />
                </el-icon>
            </el-button>
        </el-form-item>
        <el-form-item v-if="showCompute" :label="$t('product.actual')">
            <el-input-number v-model="form.thick" :min="10" :max="500" :precision="1" />
        </el-form-item>
        <el-form-item v-if="showCompute" :label="$t('product.display')">
            <el-input-number v-model="form.displayValue" :min="10" :max="500" :precision="1" />
            <el-button @click="computeScale" :loading="buttonLoading" :loading-icon="Eleme"
                style="margin-left: 20px;  font-size: 15px;" type="warning" size="large">
                {{ $t('product.setting') }}
            </el-button>
        </el-form-item>
        <el-form-item>
            <el-button :loading="buttonLoading" :loading-icon="Eleme" style="margin-top: 30px;" type="primary"
                @click="onSubmit">{{ $t("product.save") }}</el-button>
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