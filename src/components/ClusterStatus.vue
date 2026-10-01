<script setup>
import { computed } from 'vue'

const props = defineProps({ status: { type: String, required: String } })

const map = {
  running: { cls: 'success', label: 'Running', pulse: false },
  provisioning: { cls: 'info', label: 'Creating', pulse: true },
  upgrading: { cls: 'warning', label: 'Upgrading', pulse: true },
  error: { cls: 'error', label: 'Error', pulse: false },
}
const s = computed(() => map[props.status] || map.running)
</script>

<template>
  <span class="ar-tag" :class="s.cls"><span class="dot" :class="{ pulse: s.pulse }"></span>{{ s.label }}</span>
</template>
