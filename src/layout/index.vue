<script setup lang='ts'>
import { watch } from 'vue';
import { useApiDataStore } from '@/store/polling-data';
import { db } from "@/utils/dexie";
import { getFrame } from "@/api/index";
import { formatFrameData } from '@/utils/format-data';
import HeaderComponent from './header/index.vue';
import MenuComponent from './menu/index.vue';
import ContentComponent from './content/index.vue';

const store = useApiDataStore();

watch(() => store.apiThickData.LastScanDataId, async (newValue) => {
    const data = await getFrame(null)
    if (data && data !== null) {
        const formatValue = formatFrameData(data)
        await db.Frame.put(formatValue)
    }
});

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

    }
}
</style>
