<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 }, // 0..100
  label: { type: String, default: '' },
})

const cls = computed(() => (props.value > 85 ? 'danger' : props.value >= 70 ? 'warning' : ''))
</script>

<template>
  <div class="cpu-cell">
    <div class="ar-progress" :class="cls">
      <div class="fill" :style="{ width: Math.min(100, value) + '%' }" />
    </div>
    <span v-if="label" class="text-caption-1 muted">{{ label }}</span>
  </div>
</template>
