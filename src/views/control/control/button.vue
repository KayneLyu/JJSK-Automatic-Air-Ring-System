<script setup lang='ts'>
import TurnOff from "@/assets/images/guan.png";
import TurnOn from "@/assets/images/kai.png";


defineProps<{
    text: string;
    // status: 'apcStateActive' | 'apcStateHold' | 'apcStateStopped' | 'measuring_TD',
    isTurnOn: boolean;
    checkStatus: () => void;
}>();



</script>

<template>
    <div class="button-status">
        <p>{{ text }}:</p>
        <div class="status" @click="checkStatus">
            <img :src="isTurnOn ? TurnOn : TurnOff " alt="status">
        </div>
    </div>
</template>

<style scoped lang="less">
.button-status {
    display: flex;
    justify-content: space-between;
    width: 100%;
    box-sizing: border-box;
    padding: 0 5px;
}
.status {
    cursor: pointer;
    width: 100px;
    height: 100px;
    filter: drop-shadow(0px 0px 5px rgba(0, 0, 0, 0.5));
    img {
        width: 100%;
        height: 100%;
    }
}
</style>