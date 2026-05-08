<script setup lang='ts'>
import Header from './header.vue';
import Footer from './footer.vue';
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
        <div class="layout_footer">
            <Footer />
        </div>
    </div>
</template>

<style scoped lang="less">
.container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;

    .layout_footer {
        flex: 0 0 22px;
    }

    .layout_views {
        flex: 1;
        min-height: 0;
        box-sizing: border-box;
        padding: 10px;
        overflow: hidden;
    }
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.1s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}


</style>