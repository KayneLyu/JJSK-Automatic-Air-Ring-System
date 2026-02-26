<script setup lang='ts'>
defineProps<{
    thickInfo: IFrameThickData | null,
    isColumn?: boolean
}>()
</script>

<template>
    <el-card class="card_content">
        <div :class="isColumn ? 'thick_column' : ''" class="thick-info">
            <p>{{ $t("horizon.mean")}}: <span>{{ thickInfo?.mean }}</span> μm 
                <b>{{ thickInfo?.IsBackw ? $t("horizon.reverse") : $t("horizon.forward") }}</b>
            </p>
            <p>
                2σ: <span>{{ thickInfo?.sigmaVal }} <i>μm</i></span>
                <span class="more_info">{{ thickInfo?.sigmaPercent.toFixed(1) }}<i>%</i></span>
            </p>

            <p >
                {{$t("horizon.max")}}: <span>{{ thickInfo?.maxVal }} <i>μm</i></span>
                <span class="more_info">{{ thickInfo?.maxPercent.toFixed(1) }}<i>%</i></span>
            </p>


            <p>
                {{ $t("horizon.min")}}: <span>{{ thickInfo?.minVal }} <i>μm</i> </span>
                <span class="more_info">{{ thickInfo?.minPercent.toFixed(1) }}<i>%</i></span>
            </p>

            <p>
                {{$t("control.rotate")}}:
                <span>{{ thickInfo?.rotateSpeed.toFixed(1) }} <i>min/R</i></span>
            </p>

            <p>
                {{ $t("horizon.filmWidth") }}: <span>{{ thickInfo?.width }} <i>mm</i></span>
            </p>
        </div>
    </el-card>
</template>

<style scoped lang="less">
.card_content,
.thick-info-container {
    width: 100%;
    height: 100%;
}

.thick_column {
    flex-direction: column;
}

.thick-info {
    box-sizing: border-box;
    padding: 5px;
    display: flex;
    justify-content: space-between;
    height: 100%;
    width: 100%;

    p {
        flex: 1;
        font-size: 12px;
        display: flexbox;
        padding-left: 5px;

        span {
            font-size: 14px;
            font-weight: 700;

            i {
                font-weight: 500;
                font-size: 13px;
                font-style: normal;
            }
        }
        .more_info {
            background-color: #409EFF;
            color: #fff;
            font-size: 13px;
            padding: 1px 2px;
            border-radius: 3px;
            margin-left: 2px;
        }
    }
}

b {
    font-size: 13px;
    padding: 2px;
    background-color: #409EFF;
    border-radius: 3px;
    color: #fff;
    margin-left: 2px;
}

:deep(.el-card__body) {
    padding: 0;
}
</style>