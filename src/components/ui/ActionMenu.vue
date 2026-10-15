<script>
/* module-level registry: only one ActionMenu open across ALL instances */
let closeActiveMenu = null
</script>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({ items: { type: Array, required: true } }) // [{ label, danger, disabled, sep, action }]
const emit = defineEmits(['select'])
const open = ref(false)
const root = ref(null)
const pop = ref(null)
const pos = ref({ top: 0, left: 0 })

/* menu teleports to <body> so table/card overflow can't clip it */
function place() {
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vh = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 800
  const vw = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1200
  const estH = 120, estW = 190
  const flipUp = r.bottom + estH + 8 > vh && r.top > estH + 8
  pos.value = {
    top: flipUp ? r.top - estH - 4 : r.bottom + 4,
    left: Math.max(8, Math.min(r.right - estW, vw - estW - 8)),
  }
}
function toggle() {
  if (!open.value) {
    closeActiveMenu?.()
    open.value = true
    closeActiveMenu = () => { open.value = false }
    nextTick(place)
  } else {
    open.value = false
    closeActiveMenu = null
  }
}
function onDocClick(e) {
  if (root.value?.contains(e.target) || pop.value?.contains(e.target)) return
  if (open.value) {
    open.value = false
    closeActiveMenu = null
  }
}
function onReposition() {
  if (open.value) place()
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('scroll', onReposition, true)
  window.addEventListener('resize', onReposition)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})

function pick(item) {
  if (item.disabled) return
  open.value = false
  closeActiveMenu = null
  emit('select', item)
}
onBeforeUnmount(() => {
  if (closeActiveMenu && open.value) closeActiveMenu = null
})
</script>

<template>
  <div class="menu-wrap" ref="root">
    <button class="ar-btn ghost icon sm" aria-label="Actions" @click.stop="toggle">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3.4" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="8" cy="12.6" r="1.3"/></svg>
    </button>
    <Teleport to="body">
      <div v-if="open" ref="pop" class="menu" :style="{ top: pos.top + 'px', left: pos.left + 'px' }">
        <template v-for="(item, i) in items" :key="i">
          <hr v-if="item.sep" />
          <button v-else :class="{ danger: item.danger }" :disabled="item.disabled" @click="pick(item)">{{ item.label }}</button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.menu-wrap { position: relative; display: inline-flex; }
</style>

<style>
/* teleported menu — unscoped */
.menu {
  position: fixed; z-index: 70;
  min-width: 190px; padding: var(--space-1);
  background: var(--bg-neutral-t1-1-default);
  border: 1px solid var(--st-neutral-t1-5-default); border-radius: var(--radius-md);
  box-shadow: 0 12px 32px -8px rgba(16,24,40,.18), 0 4px 8px -2px rgba(16,24,40,.08);
  animation: menuIn .14s cubic-bezier(.2,.7,.2,1);
}
@keyframes menuIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.menu button {
  display: flex; align-items: center; gap: var(--space-2); width: 100%;
  border: 0; background: none; cursor: pointer; text-align: left;
  font: inherit; font-size: 13px; font-weight: 450; color: var(--fg-neutral-t1-1-default);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
}
.menu button:hover:not(:disabled) { background: var(--bg-neutral-t1-4-default); }
.menu button.danger { color: var(--fg-error-t1-1-default); }
.menu button:disabled { opacity: .45; cursor: not-allowed; }
.menu hr { border: 0; border-top: 1px solid var(--st-neutral-t1-5-default); margin: var(--space-1) 0; }
</style>
