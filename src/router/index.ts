import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';
const routes: RouteRecordRaw[] = [
    {
        path: '/',
        name: 'Controls',
        component: () => import('@/views/control/index.vue')
    },
    {
        path: '/annular',
        name: 'Annular',
        component: () => import('@/views/annular/index.vue')
    },
    {
        path: '/horizon',
        name: 'Horizon',
        component: () => import('@/views/horizontal/index.vue')
    },
    {
        path: '/vertical',
        name: 'Vertical',
        component: () => import('@/views/vertical/index.vue')
    },
    {
        path: '/product',
        name: 'Product',
        component: () => import('@/views/product/index.vue')
    },
    {
        path: '/alarm',
        name: 'Alarm',
        component: () => import('@/views/alarm/index.vue')
    }
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

export default router;