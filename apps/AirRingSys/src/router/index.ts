import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import HorizonView from '@/views/horizontal/index.vue'
import ControlsView from '@/views/control/index.vue'
import AnnularView from '@/views/annular/index.vue'
import VerticalView from '@/views/vertical/index.vue'
import ProductView from '@/views/product/index.vue'
import AlarmView from '@/views/alarm/index.vue'
import SettingView from '@/views/settings/rack/index.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'Horizon', component: HorizonView },
  { path: '/Controls', name: 'Controls', component: ControlsView },
  { path: '/annular', name: 'Annular', component: AnnularView },
  { path: '/vertical', name: 'Vertical', component: VerticalView },
  { path: '/product', name: 'Product', component: ProductView },
  { path: '/alarm', name: 'Alarm', component: AlarmView },
  { path: '/setting', name: 'setting', component: SettingView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
