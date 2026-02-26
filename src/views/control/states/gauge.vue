<script setup lang='ts'>
import { useApiDataStore } from '@/store/polling-data';
const store = useApiDataStore()

</script>

<template>
    <div class="container">
        <div class="content">
            <div class="content_left content_group">
                <div>
                    <span>旋转</span><strong>{{ store.apiThickData.CurrRotateVelocity as number | string === "NaN" ? "0" :
                        store.apiThickData.CurrRotateVelocity }}</strong> <i>s/R</i>
                </div>
                <div>
                    <span>前伸</span><strong>{{ store.apiThickData.CurrStretchPosition }} </strong> <i>mm</i>
                </div>
                <div>
                    <span>超声</span><strong>{{ store.apiThickData.CurrUs.toFixed(1) }} </strong> <i>mm</i>
                </div>

            </div>
            <div class="content_right content_group">
                <div>
                    <span>霍尔</span> <span class="special_state"><strong>{{ store.apiThickData.CurrHall.toFixed(1) }}
                        </strong> <i>mm</i></span>
                </div>
                <div>
                    <span>温度</span> <span class="special_state"><strong>{{ store.apiThickData.CurrTemp.toFixed(1) }}
                        </strong> <i>℃</i></span>
                </div>
                <div>
                    <span>加热</span><strong>{{ store.apiThickData.CurrPwm }} </strong> <i>‰</i>
                </div>
            </div>
        </div>
        <div style="margin-top: 20px;">
            <div>
                <span>气压</span><strong>{{ store.apiThickData.CurrAp.toFixed(1) }} </strong> <i>kPa</i>
            </div>
            <div>
                <span>电容</span><strong>{{ store.apiThickData.CurrThkAd }} </strong> | <span>{{
                    store.apiThickData.OrgThk }}</span>
            </div>
            <div>
                <span>空气</span><strong>{{ store.apiThickData.SampleAd }} </strong> | <span>{{
                    store.apiThickData.SampleThk }}</span>
            </div>
        </div>

    </div>
</template>

<style lang="less" scoped>
.container {
    // display: flex;
}

.special_state {
    display: inline-block;
    margin-top: 2px;
    padding: 0 2px;
    border-radius: 5px;
    color: #fff;
    background-color: #f55;
}

span {
    margin-right: 6px;
}

strong {
    display: inline-block;
}

.content {
    display: flex;

    .content_group {
        min-width: 130px;
    }

}
</style>