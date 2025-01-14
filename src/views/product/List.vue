<script setup lang='ts'>

const props = defineProps<{
    chooseProcess:(name: string) => void,
    deleteProcess: (name: string) => void,
    activeName: string,
    productList: Array<IProductData>
}>()

</script>

<template>
    <div class="items_list">
        <el-scrollbar height="780px" noresize>
            <div v-for="(item, index) in productList" :key="index" class="scrollbar-item" :class="{ 'scrollbar-item-active': item.name === activeName }" @click="chooseProcess(item.name)">
                <p>
                    {{ item.name }}
                </p>
            </div>
        </el-scrollbar>
        <div class="delete_btn">
            <el-button :disabled="productList.length < 1 " @click="deleteProcess(activeName)" type="danger" size="large">
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
            background: #d4eaf7;
        }
    }
}

.delete_btn {
   display: flex;
   justify-content: flex-end;
   margin-top: 20px;
}
.scrollbar-item-active {
    background: #409EFF!important;
    color: #fff!important;
}
</style>