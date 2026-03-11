<script setup lang='ts'>
import { useApiDataStore } from '@/store/polling-data';
import { setHeat, setCool } from '@/api/index';
const store = useApiDataStore()
type Option = {
    label: string;
    value: string;
}
const options: Option[] = [
    {
        label: "加热",
        value: "FIX"
    },
    {
        label: "降温",
        value: 'SCAN',
    },
    // {
    //     label:  "归边",
    //     value: "ORG"
    // }
]

const changeState = async (state: string) => {
    try {
        if (state == "heat") {
            await setHeat()
        } else {
            await setCool()
        }

    } catch (error) {
    }
}
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
                    <span>超声</span><strong>{{ store.apiThickData.CurrUs as string | number == "NaN" ? 0 :
                        store.apiThickData.CurrUs.toFixed(1) }} </strong> <i>mm</i>
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
        <div class="state_bottom">
            <div class="state">
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
            <div class="set_hot">
                <div>
                    <el-segmented @change="changeState" style="height: 45px;"
                        v-model="store.apiThickData.ControllerState" :options="options" block size="small">
                        <template #default="{ item }">
                            <div>
                                <div>{{ (item as Option).label }}</div>
                            </div>
                        </template>
                    </el-segmented>
                </div>
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

.state_bottom {
    display: flex;
    margin-top: 20px;

    .state {
        min-width: 130px;
    }

    .set_hot {
        margin-left: 20px;
    }
}
</style>