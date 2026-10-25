<script setup>
import { watch } from 'vue'

const props = defineProps({
  open: Boolean,
  title: String,
  subtitle: String,
  size: {
    type: String,
    default: 'sm',
    validator: (v) => ['sm', 'md'].includes(v),
  },
})
const emit = defineEmits(['close'])

watch(
  () => props.open,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : ''
  }
)
</script>

<template>
  <Teleport to="body">
    <div class="overlay" :class="{ open }" @click="emit('close')" />
    <aside class="side-panel" :class="[{ open }, size !== 'sm' && `side-panel--${size}`]" :aria-label="title">
      <header>
        <div>
          <h2 class="text-title-3" style="margin: 0">{{ title }}</h2>
          <p v-if="subtitle" class="text-caption-1 muted" style="margin: 2px 0 0">{{ subtitle }}</p>
        </div>
        <button class="ar-btn ghost icon sm" aria-label="Close" @click="emit('close')">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 4 8 8M12 4l-8 8"/></svg>
        </button>
      </header>
      <div class="body"><slot /></div>
      <footer v-if="$slots.footer"><slot name="footer" /></footer>
    </aside>
  </Teleport>
</template>
