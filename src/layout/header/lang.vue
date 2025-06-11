<script setup lang="ts">
import { useConfigStore } from '@/store/config'
import { inject , Ref } from 'vue'
import LangIcon from '@/components/icons/Lang.vue';
import ArrowDown from '@/components/icons/Arrowdown.vue';
import { I18n } from 'vue-i18n';
// import { ElMessage } from 'element-plus' // 手动引入 ElMessage 会导致样式丢失
// import { ElNotification } from 'element-plus'

const LangType: Record<ILanguageType, string> = {
    zhCn: "中文",
    en: "English",
    vi: "Tiếng Việt"
}

const store = useConfigStore()
const i18n = inject('$i18n') as I18n;
const openNotification = () => {
        ElNotification({
            title: 'Language',
            message: "check out language success !",
            position: 'bottom-left',
            type: "success"
        })
    }
    
const handleCommand = (value: ILanguageType) => {
    if (store.language === value) return
    (i18n.global.locale as Ref<string>).value = value;
    store.changeLang(value)
    openNotification()
    ElMessage.closeAll()
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
    color:var(--tool-btn-color);
    font-size: 18px;
    vertical-align: middle;
    margin-right: 3px;
}

.el-icon-arrow {
    color:var(--tool-btn-color);
    font-size: 16px;
    margin-left: 10px;
    vertical-align: middle;
}

.el-dropdown-link {
    color:var(--tool-btn-color);
    font-size: 15px;
}
:deep(.el-dropdown-menu__item) {
    padding: 5px 20px;
}
</style>
