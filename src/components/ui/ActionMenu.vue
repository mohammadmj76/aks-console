<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'

defineProps({ items: { type: Array, required: true } }) // [{ label, danger, disabled, action }]
const emit = defineEmits(['select'])
const open = ref(false)
const root = ref(null)

const onDocClick = (e) => {
  if (root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function pick(item) {
  if (item.disabled) return
  open.value = false
  emit('select', item)
}
</script>

<template>
  <div class="menu-wrap" ref="root">
    <button class="ar-btn ghost icon sm" aria-label="Actions" @click.stop="open = !open">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3.4" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="8" cy="12.6" r="1.3"/></svg>
    </button>
    <div v-if="open" class="menu">
      <template v-for="(item, i) in items" :key="i">
        <hr v-if="item.sep" />
        <button v-else :class="{ danger: item.danger }" :disabled="item.disabled" @click="pick(item)">{{ item.label }}</button>
      </template>
    </div>
  </div>
</template>
