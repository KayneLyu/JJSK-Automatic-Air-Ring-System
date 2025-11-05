import { createApp } from 'vue'
import { createPinia } from 'pinia'
// pinia 持久化
import piniaPluginPersistedState from 'pinia-plugin-persistedstate'
import router from '@/router'
import './style.css'
import App from './App.vue'
// i18n
import i18n from '@/i18n'
import 'element-plus/theme-chalk/dark/css-vars.css'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedState)

app.use(i18n)
app.provide('$i18n', i18n)

app.use(pinia)
app.use(router)
app.mount('#app')
