<script setup lang="ts">
import { ref } from 'vue'
import ClipPath from '@/components/Clip-Path.vue';

defineProps<{ msg: string }>()

const count = ref(0)

</script>

<template>
  <div>
    <ClipPath />
  </div>
</template>

<style scoped>

.read-the-docs {
  color: #888;
}
</style>
