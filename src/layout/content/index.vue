<script setup lang='ts'>
import Header from './header.vue';
</script>

<template>
    <div class="container">
        <div class="layout_header">
            <Header />
        </div>
        <div class="layout_views">
            <router-view v-slot="{ Component }">
                <transition name="fade" mode="out-in">
                    <component :is="Component" />
                </transition>
            </router-view>
        </div>
    </div>
</template>

<style scoped lang="less">
.container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    .layout_views {
        flex: 1;
    }
}
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>