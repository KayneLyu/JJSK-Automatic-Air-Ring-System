<script setup lang="ts">
import { ref } from 'vue';
import { useLangStore } from '@/store/lang'
import MoonIcon from '@/components/icons/Moon.vue';
import SunIcon from '@/components/icons/Sun.vue';

declare global {
    interface Document {
        startViewTransition: (fc: Function) => {
            ready: Promise<void>
        };
    }
}
const store = useLangStore()
let isDark = ref(false)
function changeTheme() {
    // 切换页面主题
    isDark.value = !isDark.value;
    document.documentElement.classList.toggle("dark");

    store.theme = isDark.value ? 'dark' : 'light'
    // const bg = document.querySelector('.kan_fixed') as HTMLElement;
    // const snakeAnimate = document.querySelector('.snake_animate') as HTMLImageElement;
    // if (isDark.value) {
    //     bg.style.backgroundImage = 'none'
    //     snakeAnimate.src= snakeDark
    //     return
    // }
    // bg.style.backgroundImage = `url(${backgroundBg})`
    // snakeAnimate.src= snake
}

function updateView(event: MouseEvent) {
    // 在不支持的浏览器里不做动画
    if (!document.startViewTransition) {
        changeTheme();
        return;
    }
    // 开始一次视图过渡：
    const transition = document.startViewTransition(() => changeTheme());
    transition.ready.then(() => {
        const x = event.clientX;
        const y = event.clientY;
        // 计算按钮到最远点的距离用作裁剪圆形的半径
        const endRadius = Math.hypot(
            Math.max(x, innerWidth - x),
            Math.max(y, innerHeight - y)
        );
        const clipPath = [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
        ];
        // 开始动画
        document.documentElement.animate(
            {
                clipPath: isDark.value ? [...clipPath].reverse() : clipPath,
            },
            {
                duration: 400,
                easing: "ease-in",
                pseudoElement: isDark.value
                    ? "::view-transition-old(root)"
                    : "::view-transition-new(root)",
            }
        );
    });
}

</script>

<template>
    <div @click="updateView" class="switch_box">
        <input v-model="isDark" class="switch_input" type="checkbox" />
        <span class="slider round">
            <i>
                <component :is="isDark ? MoonIcon : SunIcon" />
            </i>
        </span>
    </div>
</template>

<style scoped>
.switch_box {
    position: relative;
    display: inline-flex;
    align-items: center;
    position: relative;
    vertical-align: middle;
    width: 50px;
    height: 24px;
}

.switch_input {
    opacity: 0;
    width: 0;
    height: 0;
}

.slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: transparent;
    transition: .4s;
    border-radius: 12px;
    border: 1px solid #ccc;
}

.slider i {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    top: 2px;
    left: 2px;
    transition: .4s;
    border-radius: 50%;
    font-size: 18px;

}

input:checked+.slider {
    border: none;
    background-color: #2C2C2C;
}

input:focus+.slider {
    box-shadow: 0 0 1px #000000;
}

input:checked+.slider i {
    transform: translateX(24px);
}

.slider.round i {
    border-radius: 50%;
}
</style>