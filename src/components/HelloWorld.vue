<script setup lang="ts">
import { ref } from 'vue'
import ClipPath from '@/components/Clip-Path.vue';

defineProps<{ msg: string }>()

const count = ref(0)

const minimizeWindow = () => {
  window.ipcRenderer.send("win-minimize")
  console.log('111');
  
}

</script>

<template>
  <div>
    <ClipPath />
    <p @click="minimizeWindow">{{ msg }}</p>
  </div>
</template>

<style scoped>

.read-the-docs {
  color: #888;
}

p {
  color: var(--theme-color)
}
</style>
