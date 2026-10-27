<script setup>
import { computed } from 'vue'

const props = defineProps({
  pct: { type: Number, required: true }, // 0..100
  label: { type: String, default: '' },
})

const dash = computed(() => `${Math.min(100, Math.max(0, props.pct))} ${100 - Math.min(100, Math.max(0, props.pct))}`)
</script>

<template>
  <div class="donut-gauge">
    <svg viewBox="0 0 42 42" aria-hidden="true">
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--bg-neutral-t1-4-default)" stroke-width="4" />
      <circle
        cx="21" cy="21" r="15.9" fill="none"
        stroke="var(--bg-primary-t3-1-default)" stroke-width="4"
        stroke-linecap="round" pathLength="100"
        :stroke-dasharray="dash" transform="rotate(-90 21 21)"
      />
    </svg>
    <div class="dg-center">
      <div class="dg-pct">{{ pct }}</div>
      <div class="dg-label muted">{{ label }}</div>
    </div>
  </div>
</template>

<style scoped>
.donut-gauge { position: relative; width: 180px; margin: var(--space-3) auto 0; }
.donut-gauge svg { display: block; width: 100%; }
.dg-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.dg-pct { font-size: 26px; font-weight: 450; letter-spacing: -0.5px; }
.dg-pct::after { content: "%"; font-size: 14px; vertical-align: top; }
.dg-label { font-size: 11px; margin-top: 2px; max-width: 110px; }
</style>
