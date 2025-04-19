<script setup lang='ts'>
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import ControlsIcon from '@/components/icons/Controls.vue';
import HorizonIcon from '@/components/icons/Horizon.vue';
import AnnularIcon from '@/components/icons/Annular.vue';
import VerticalIcon from '@/components/icons/Vertical.vue';
import AlarmIcon from '@/components/icons/Alarm.vue';
import ProductIcon from '@/components/icons/Product.vue';
import UnfoldIcon from '@/components/icons/Unfold.vue';

const menuItemList = [
    {
        name: "menu.horizon",
        color: "#2196f3",
        location: "/",
        icon: HorizonIcon,
    },
    {
        name: "menu.control",
        color: "#b145e9",
        location: "/Controls",
        icon: ControlsIcon,
    },
    {
        name: "menu.annular",
        color: "#ffa117",
        location: "/annular",
        icon: AnnularIcon,
    },
    {
        name: "menu.vertical",
        color: "#0fc70f",
        location: "/vertical",
        icon: VerticalIcon,
    },
    {
        name: "menu.product",
        color: "#24ADF3",
        location: "/product",
        icon: ProductIcon,
    },
    {
        name: "menu.alarm",
        color: "#f44336",
        location: "/alarm",
        icon: AlarmIcon,
    },
]

const route = useRoute();
const isFold = ref(false)

// 阻止按住ctrl 跳转默认事件
const preventDefault = (e: MouseEvent) => {
    if (e.ctrlKey) {
        e.preventDefault();
    }
}

</script>

<template>
    <div class="sidebar">
        <ul :style="{ width: isFold ? '190px' : '70px' }">
            <li class="logo"></li>
            <div class="menu-list">
                <li v-for="(item, index) in menuItemList" :key="index" @click="preventDefault"
                    :class="{ 'active': route.path === item.location }" :style="{ '--bg': item.color }">
                    <RouterLink :to="item.location">
                        <div className="icon">
                            <el-icon :size="40">
                                <component :is="item.icon" />
                            </el-icon>
                        </div>
                        <div className="text">{{ $t(item.name) }}</div>
                    </RouterLink>
                </li>
            </div>
            <li @click="() => isFold = !isFold" class="unfold">
                <el-icon :size="28" :class="isFold ? 'rotate_animate' : 'rotate_animate_back'">
                    <UnfoldIcon />
                </el-icon>
            </li>
        </ul>
    </div>
</template>

<style scoped lang="less">
.sidebar {
    height: 100%;
    background-color: var(--menu-bg);
    transition: 0.5s;
    padding-left: 10px;
    overflow: hidden;

    ul {
        position: relative;
        overflow: hidden;
        height: 100%;
        transition: all 0.3s ease-in-out;

        li {
            position: relative;
            list-style: none;
            margin-bottom: 20px;
            -webkit-tap-highlight-color: transparent;

            &.active {
                background-color: var(--clr);
                border-top-left-radius: 50px;
                border-bottom-left-radius: 50px;
            }
        }
    }
}

.sidebar ul li.active::before {
    content: '';
    position: absolute;
    top: -20px;
    right: 0;
    width: 20px;
    height: 20px;
    border-bottom-right-radius: 20px;
    box-shadow: 5px 5px 0 4px var(--clr);
    background-color: transparent;
}

.sidebar ul li.active::after {
    content: '';
    position: absolute;
    bottom: -20px;
    right: 0;
    width: 20px;
    height: 20px;
    border-top-right-radius: 20px;
    box-shadow: 5px -5px 0 4px var(--clr);
    background-color: transparent;
}

.sidebar ul li.logo {
    margin-bottom: 80px;
}

.sidebar ul li.logo .icon {
    font-size: 2em;
    color: var(--clr);
}

.sidebar ul li.logo .text {
    font-size: 1.2em;
    font-weight: 500;
    color: var(--clr);
}

.sidebar ul li a {
    position: relative;
    display: flex;
    white-space: nowrap;
    text-decoration: none;
}

.sidebar ul li a .icon {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--text-color);
    transition: 0.5s;
    padding-left: 10px;
}

.sidebar ul li a .text {
    position: relative;
    height: 70px;
    display: flex;
    align-items: center;
    font-size: 16px;
    color: var(--text-color);
    padding-left: 20px;
    // text-transform: uppercase; 大写
    letter-spacing: 0.05em;
    transition: 0.5s;
}

.sidebar ul li.active a .icon {
    color: #fff;
}

.sidebar ul li.active:hover a .icon {
    color: #fff;
}

.sidebar ul li.active a .text {
    color: var(--bg);
    font-weight: 700;
    padding-left: 25px;
}

.sidebar ul li:hover a .icon,
.sidebar ul li:hover a .text {
    color: var(--bg);
}

.sidebar ul li.active a .icon::before {
    content: '';
    position: absolute;
    inset: 5px;
    width: 60px;
    background-color: var(--bg);
    border-radius: 50%;
    transition: 0.5s;
}

.sidebar ul .unfold {
    position: absolute;
    bottom: 10px;
    right: 5px;
    padding: 5px;
    cursor: pointer;
}

.rotate_animate {
    animation: rotate_icon 0.3s forwards;
}

@keyframes rotate_icon {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(180deg);
    }
}

.rotate_animate_back {
    animation: rotate_icon_back 0.3s forwards;
}

@keyframes rotate_icon_back {
    0% {
        transform: rotate(180deg);
    }

    100% {
        transform: rotate(0deg);
    }
}

// .sidebar ul li:hover.active a .icon::before {
//     background-color: var(--menu-bg);
// }</style>