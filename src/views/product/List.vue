<script setup lang='ts'>
import { Delete } from '@element-plus/icons-vue'
defineProps<{
    chooseProcess: (name: string) => void,
    deleteProcess: (name: string) => void,
    activeName: string,
    productList: Array<IProductData>
}>()

</script>

<template>
    <div class="items_list">
        <el-scrollbar height="750px" noresize>
            <div v-for="(item, index) in productList" :key="index" class="scrollbar-item"
                :class="{ 'scrollbar-item-active': item.productName === activeName }" @click="chooseProcess(item.productName)">
                <p>
                    {{ item.productName }}
                </p>
            </div>
        </el-scrollbar>
        <div class="delete_btn">
            <el-button :icon="Delete" :disabled="productList.length < 1" @click="deleteProcess(activeName)"
                type="danger" size="large">
                {{ $t("product.delete") }}
            </el-button>
        </div>
    </div>
</template>

<style scoped lang="less">
.items_list {
    width: 300px;
    height: 100%;
    .scrollbar-item {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        height: 50px;
        background: var(--menu-bg);
        margin-top: 10px;
        border-radius: 4px;
        cursor: pointer;
        margin: 10px;

        p {
            padding-left: 10px;
        }

        &:hover {
            background: var(--item-hover);
        }
    }
}

.delete_btn {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
}

.scrollbar-item-active {
    background: #409EFF !important;
    color: #fff !important;
}
</style>