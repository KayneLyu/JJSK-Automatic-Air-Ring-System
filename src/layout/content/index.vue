<script setup lang='ts'>
import Header from './header.vue';
import Footer from './footer.vue';
import { useApiDataStore } from '@/store/polling-data';
import { useProduct } from '@/store/product';
import PositionIcon from '@/components/icons/Position.vue';

const store = useApiDataStore();
const productStore = useProduct();

</script>

<template>
    <div class="container">
        <div class="layout_header">
            <Header />
            <div class="progress">
                <el-progress :text-inside="true" :show-text="false" :duration="30" striped-flow :percentage="store.VDPData.position/360"
                    :stroke-width="20" :striped="store.VDPData.targetTmdState == 'measuring_TD'">
                    <span>
                        <el-icon>
                            <PositionIcon />
                        </el-icon>
                        {{ store.VDPData.actualVal }} um /
                        {{ store.VDPData.position }} °
                    </span>
                </el-progress>
            </div>
            <!-- 警告信息 -->
            <div v-show="productStore.param.trigAlert && store.isOverFlow">
                <el-alert :closable="false" center class="alert" show-icon :title="$t('product.trig')" type="error" effect="dark" />
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
.alert {
    margin-top: 5px;
    height: 32px;
}
</style>