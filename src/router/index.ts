import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';
const routes: RouteRecordRaw[] = [
    {
        path: '/',
        name: 'Controls',
        component: () => import('@/views/control/index.vue')
    },
    {
        path: '/horizon',
        name: 'Horizon',
        component: () => import('@/views/horizontal/index.vue')
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

export default router;