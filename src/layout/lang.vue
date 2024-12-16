<script setup lang="ts">
import { useLangStore } from '@/store/lang'
import { getCurrentInstance } from 'vue'
// import { ElMessage } from 'element-plus' // 手动引入 ElMessage 会导致样式丢失
import LangIcon from '@/components/icons/Lang.vue';
import ArrowDown from '@/components/icons/Arrowdown.vue';

const LangType: Record<ILanguageType, string> = {
    zhCn: "中文",
    en: "English",
}

const store = useLangStore()
const { proxy } = getCurrentInstance() as any
const handleCommand = (value: ILanguageType) => {
    if (store.language === value) return
    proxy.$i18n.locale = value
    store.changeLang(value)
    ElMessage.closeAll()
    ElMessage.success(`${value === 'en' ? '英文' : '中文'}切换成功！`)
}
</script>

<template>
    <el-dropdown @command="handleCommand" class="lang-warp" trigger="click">
        <span class="el-dropdown-link">
            <el-icon class="el-icon">
                <LangIcon />
            </el-icon>
            {{ LangType[store.language] }}
            <el-icon class="el-icon-arrow">
                <ArrowDown />
            </el-icon>
        </span>
        <template #dropdown>
            <el-dropdown-menu>
                <el-dropdown-item v-for="(value, key, index) in LangType" :command="key" :key="index">
                    {{ value }}
                </el-dropdown-item>
            </el-dropdown-menu>
        </template>
    </el-dropdown>
</template>

<style scoped lang="less">
.lang-warp {
    display: flex;
    align-items: center;
    cursor: pointer;
    min-width: 150px;
}
.el-icon {
    color: #fff;
    font-size: 18px;
    vertical-align: middle;
    margin-right: 3px;
}
.el-icon-arrow {
    color: #fff;
    font-size: 16px;
    margin-left: 10px;
    vertical-align: middle;
}
.el-dropdown-link {
    color: #fff;
    font-size: 15px;
}
</style>
