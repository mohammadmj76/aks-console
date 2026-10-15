<script setup>
import { onBeforeUnmount, watch } from 'vue'

/*
 * Centered dialog for short, focused actions (adjust node count, rename,
 * confirms). Closes on overlay click and Escape; locks body scroll while open.
 */
const props = defineProps({
  open: Boolean,
  title: String,
  subtitle: String,
  width: { type: Number, default: 480 },
})
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape' && props.open) emit('close')
}
watch(
  () => props.open,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : ''
    if (v) document.addEventListener('keydown', onKey)
    else document.removeEventListener('keydown', onKey)
  }
)
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <!-- :duration keeps close reliable even when the tab is not painting -->
    <Transition name="ar-modal" :duration="190">
      <div v-if="open" class="ar-modal-overlay" @click.self="emit('close')">
        <div
          class="ar-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          :style="{ maxWidth: width + 'px' }"
        >
          <header class="ar-modal-head">
            <div style="min-width: 0">
              <h2 class="text-title-3" style="margin: 0">{{ title }}</h2>
              <p v-if="subtitle" class="text-caption-1 muted" style="margin: 2px 0 0">{{ subtitle }}</p>
            </div>
            <button class="ar-modal-x" aria-label="Close" @click="emit('close')">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 4 8 8M12 4l-8 8"/></svg>
            </button>
          </header>
          <div class="ar-modal-body"><slot /></div>
          <footer v-if="$slots.footer" class="ar-modal-foot"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ar-modal-overlay {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(15, 19, 26, .45);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4);
}
.ar-modal {
  width: 100%;
  background: var(--bg-neutral-t1-1-default);
  border: 1px solid var(--st-neutral-t1-5-default);
  border-radius: var(--radius-sm);
  box-shadow: 0 24px 64px -12px rgba(15, 19, 26, .3);
  max-height: calc(100vh - var(--space-8));
  display: flex; flex-direction: column;
}
.ar-modal-head {
  flex: none;
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4);
  padding: var(--space-5) var(--space-6) var(--space-4);
}
.ar-modal-x {
  flex: none; border: 0; background: none; cursor: pointer;
  padding: 6px; border-radius: var(--radius-sm);
  color: var(--fg-neutral-t1-3-default); display: inline-flex;
}
.ar-modal-x:hover { color: var(--fg-neutral-t1-1-default); background: var(--bg-neutral-t1-4-default); }
.ar-modal-body {
  padding: 0 var(--space-6) var(--space-6);
  overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--space-5);
}
.ar-modal-foot {
  flex: none;
  display: flex; justify-content: flex-end; gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--st-neutral-t1-5-default);
}

/* open/close transition */
.ar-modal-enter-active, .ar-modal-leave-active { transition: opacity .18s ease; }
.ar-modal-enter-active .ar-modal, .ar-modal-leave-active .ar-modal { transition: transform .18s cubic-bezier(.2, .7, .2, 1); }
.ar-modal-enter-from, .ar-modal-leave-to { opacity: 0; }
.ar-modal-enter-from .ar-modal, .ar-modal-leave-to .ar-modal { transform: translateY(10px) scale(.98); }
</style>
