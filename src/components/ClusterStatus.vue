<script setup>
import { computed } from 'vue'
import ArBadge from './ui/ArBadge.vue'

/*
 * Status chip, mirroring the real VPC Status component: an ArBadge whose
 * variant and prepend icon come from the status (success check-circle for
 * running, info refresh for in-progress states, danger error for failures).
 */
const props = defineProps({ status: { type: String, required: true } })

const map = {
  running: { variant: 'success', icon: 'check-circle', label: 'Running' },
  provisioning: { variant: 'info', icon: 'refresh', label: 'Creating' },
  upgrading: { variant: 'warning', icon: 'refresh', label: 'Upgrading' },
  error: { variant: 'danger', icon: 'error', label: 'Error' },
}
const s = computed(() => map[props.status] || map.running)
</script>

<template>
  <ArBadge :variant="s.variant" :prepend-icon="s.icon" :text="s.label" />
</template>
