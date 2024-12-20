import { createApp } from 'vue'
import { createPinia } from 'pinia';
// pinia 持久化
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from '@/router/index';
import './style.css'
import App from './App.vue'
// i18n
import i18n from '@/i18n';

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(i18n)
app.provide('$i18n', i18n)

app.use(pinia)
app.use(router)
app.mount('#app')

// app.mount('#app').$nextTick(() => {
//   window.ipcRenderer.on('main-process-message', (_event, message) => {
//     console.log(message)
//   })
// })
