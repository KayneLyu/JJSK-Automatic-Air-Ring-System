<script setup lang='ts'>
import Header from './header.vue';
import Footer from './footer.vue';
import { useApiDataStore } from '@/store/polling-data';
import PositionIcon from '@/components/icons/Position.vue';

const store = useApiDataStore();

</script>

<template>
    <div class="container">
        <div class="layout_header">
            <Header />
            <div class="progress">
                <el-progress :text-inside="true" :show-text="false" :duration="30" striped-flow :percentage="50"
                    :stroke-width="20" :striped="store.VDPData.targetTmdState == 'measuring_TD'">
                    <span>
                        <el-icon>
                            <PositionIcon />
                        </el-icon>
                        22 um / 
                        {{ store.VDPData.position }} °
                    </span>
                </el-progress>
            </div>
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

    .layout_views {
        flex: 1;
        box-sizing: border-box;
        padding: 10px;
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