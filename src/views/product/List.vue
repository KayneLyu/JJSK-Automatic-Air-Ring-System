<script setup lang='ts'>

</script>

<template>
    <div class="items_list">
        <el-scrollbar height="800px" noresize>
            <div v-for="item in 20" :key="item" class="scrollbar-item">
                <p>
                    {{ "ABCD" }}
                </p>
            </div>
        </el-scrollbar>
        <div class="delete_btn">
            <el-button type="danger" size="large">
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
</style>