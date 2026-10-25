<script setup>
import ArBadge from './ArBadge.vue'

defineProps({
  label: String,
  badge: String,
  badgeTone: { type: String, default: 'neutral' },
  value: String,
  unit: String,
})
</script>

<template>
  <div class="ar-card stat-card">
    <div class="top">
      <span class="text-caption-1-strong muted">{{ label }}</span>
      <ArBadge v-if="badge" :variant="badgeTone" :text="badge" />
    </div>
    <p class="text-title-1 value">
      {{ value }}<span v-if="unit" class="unit"> {{ unit }}</span>
    </p>
    <div v-if="$slots.default" class="foot"><slot /></div>
  </div>
</template>
