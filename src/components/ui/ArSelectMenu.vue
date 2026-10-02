<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/* Custom dropdown menu replacing the native select popup —
   matches the ArSelect look: floating white menu, rounded corners,
   Ar shadow, teal selected/hover states. Keyboard + outside-click. */
const props = defineProps({
  options: { type: Array, required: true }, // [{ value, label }] or strings
  modelValue: { type: [String, Number], default: '' },
  disabled: Boolean,
  ariaLabel: String,
})
const emit = defineEmits(['update:modelValue'])

const norm = computed(() =>
  props.options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }))
)
const current = computed(() => norm.value.find((o) => o.value === props.modelValue))

const open = ref(false)
const root = ref(null)
const activeIdx = ref(-1)

function pick(opt) {
  emit('update:modelValue', opt.value)
  open.value = false
}
function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    activeIdx.value = norm.value.findIndex((o) => o.value === props.modelValue)
  }
}
function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}
function onKey(e) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      toggle()
    }
    return
  }
  if (e.key === 'Escape') open.value = false
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const dir = e.key === 'ArrowDown' ? 1 : -1
    activeIdx.value = Math.min(norm.value.length - 1, Math.max(0, activeIdx.value + dir))
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (norm.value[activeIdx.value]) pick(norm.value[activeIdx.value])
  }
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="ar-select-menu" ref="root" tabindex="0" :aria-label="ariaLabel" @keydown="onKey">
    <button type="button" class="asm-trigger" :class="{ open, disabled }" :disabled="disabled" @click="toggle">
      <span class="asm-label">{{ current?.label ?? '—' }}</span>
      <svg class="chev" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 6.5 4 4 4-4"/></svg>
    </button>
    <Teleport to="body">
      <div v-if="open" class="asm-pop" :style="{}">
        <button
          v-for="(o, i) in norm"
          :key="o.value"
          type="button"
          class="asm-opt"
          :class="{ sel: o.value === modelValue, act: i === activeIdx }"
          @click="pick(o)"
          @mousemove="activeIdx = i"
        >{{ o.label }}</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ar-select-menu { position: relative; display: inline-flex; outline: none; }
.ar-select-menu:focus-visible .asm-trigger { box-shadow: 0 0 0 3px var(--bg-primary-t3-1-default); }
.asm-trigger {
  display: inline-flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  width: 100%; min-width: 0;
  height: 38px; padding: 0 12px;
  background: var(--bg-neutral-t1-1-default);
  border: 1px solid var(--st-neutral-t1-2-default); border-radius: var(--radius-md);
  font: inherit; font-size: 14px; color: var(--fg-neutral-t1-1-default);
  cursor: pointer; transition: border-color .15s, box-shadow .15s;
}
.asm-trigger:hover:not(.disabled) { border-color: var(--st-neutral-t1-5-default); }
.asm-trigger.open { border-color: var(--st-primary-t1-1-default); box-shadow: 0 0 0 3px var(--bg-primary-t3-1-default); }
.asm-trigger.disabled { opacity: .5; cursor: not-allowed; }
.asm-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asm-trigger .chev { color: var(--fg-neutral-t1-3-default); transition: transform .15s; }
.asm-trigger.open .chev { transform: rotate(180deg); color: var(--fg-primary-t1-1-default); }

.asm-pop {
  position: fixed; z-index: 70; min-width: 100%;
  padding: 6px; margin-top: 6px;
  background: var(--bg-neutral-t1-1-default);
  border: 1px solid var(--st-neutral-t1-1-default);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 32px -8px rgba(16,24,40,.18), 0 4px 8px -2px rgba(16,24,40,.08);
  max-height: 300px; overflow-y: auto;
  animation: asmIn .14s cubic-bezier(.2,.7,.2,1);
  transform-origin: top center;
}
@keyframes asmIn { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
.asm-opt {
  display: flex; align-items: center; width: 100%;
  border: 0; background: none; cursor: pointer; text-align: left;
  font: inherit; font-size: 14px; color: var(--fg-neutral-t1-1-default);
  padding: 9px 12px; border-radius: var(--radius-md);
}
.asm-opt.act { background: var(--bg-neutral-t1-4-default); }
.asm-opt.sel { color: var(--fg-primary-t1-1-default); font-weight: 450; background: var(--bg-primary-t3-1-default); }
.asm-opt.sel::after {
  content: ""; margin-left: auto; width: 6px; height: 6px;
  border-radius: var(--radius-circular); background: var(--bg-primary-t1-1-default);
}
</style>
