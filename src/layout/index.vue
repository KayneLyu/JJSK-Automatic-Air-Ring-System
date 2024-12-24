<script setup lang='ts'>
import HeaderComponent from './header/index.vue';
import MenuComponent from './menu/index.vue';
import ContentComponent from './content/index.vue';
</script>

<template>
    <div class="layout">
        <HeaderComponent />
        <div class="layout_content">
            <div class="layout_menu">
                <MenuComponent />
            </div>
            <div class="layout_main">
                <div class="layout_views">
                    <ContentComponent />
                </div>

                <div class="layout_footer">
                    自动风环状态: 
                </div>
            </div>

        </div>
    </div>
</template>

<style scoped lang="less">
.layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

.layout_content {
    display: flex;
    flex: 1;
    overflow: hidden;

    .layout_menu {
        height: 100%;
    }

    .layout_main {
        flex: 1;
        background-color: var(--clr);
        display: flex;
        flex-direction: column;
        .layout_views {
            flex: 1;
        }
        .layout_footer {
            display: flex;
            align-items: center;
            height: 22px;
            width: 100%;
            background-color: var(--menu-bg);
            border-left: 1px solid #9d9d9d17;
            font-size: 12px;
        }
    }
}
</style>
