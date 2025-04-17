<script setup lang='ts'>
import packageJson from "@/../package.json";
</script>

<template>
    <div class="footer_content">
        <div class="status">
            自动风环状态:
        </div>
        <div class="version">
            <i>
                {{`v${packageJson.version}`}}
            </i>
        </div>
    </div>
</template>

<style scoped lang="less">
.footer_content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 22px;
    width: 100%;
    background-color: var(--menu-bg);
    border-left: 1px solid #9d9d9d17;
    font-size: 13px;
    box-sizing: border-box;
    padding: 0 10px;
}
.status {
    letter-spacing: 1px;
}
</style>