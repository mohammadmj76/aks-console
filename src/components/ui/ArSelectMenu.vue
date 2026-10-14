<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

/* Custom dropdown menu replacing the native select popup —
   matches the ArSelect look: floating white menu, rounded corners,
   Ar shadow, teal selected/hover states. Keyboard + outside-click.
   The menu is teleported to <body> and positioned over the trigger
   (flipping up when there is no room below). */
const props = defineProps({
  options: { type: Array, required: true }, // [{ value, label }] or strings
  modelValue: { type: [String, Number], default: '' },
  disabled: Boolean,
  ariaLabel: String,
  searchable: Boolean,
  searchPlaceholder: { type: String, default: 'Search…' },
  emptyText: { type: String, default: 'No results found' },
})
const emit = defineEmits(['update:modelValue'])

const norm = computed(() =>
  props.options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }))
)
const current = computed(() => norm.value.find((o) => o.value === props.modelValue))
const search = ref('')
const searchInput = ref(null)
const visibleOptions = computed(() => props.searchable
  ? norm.value.filter((o) => o.value !== '' && o.label.toLowerCase().includes(search.value.trim().toLowerCase()))
  : norm.value)
function onSearch() {
  activeIdx.value = -1
  nextTick(place)
}

const open = ref(false)
const root = ref(null)
const pop = ref(null)
const activeIdx = ref(-1)
const pos = ref({ top: 0, left: 0, minWidth: 0 })
const dropUp = ref(false)

function viewportHeight() {
  const vv = window.visualViewport
  const h = vv?.height || window.innerHeight || document.documentElement.clientHeight || 0
  return h > 0 ? h : 800 // sane fallback when the viewport can't be measured
}
function place() {
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vh = viewportHeight()
  const spaceBelow = vh - r.bottom
  const estHeight = Math.min(300, Math.max(1, visibleOptions.value.length) * 40 + 12 + (props.searchable ? 38 : 0))
  dropUp.value = spaceBelow < estHeight + 12 && r.top > estHeight + 12
  pos.value = {
    left: r.left,
    minWidth: r.width,
    ...(dropUp.value
      ? { bottom: vh - r.top + 6 }
      : { top: r.bottom + 6 }),
  }
}

function pick(opt) {
  emit('update:modelValue', opt.value)
  open.value = false
  root.value?.querySelector('.asm-trigger')?.focus()
}
function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    search.value = ''
    activeIdx.value = visibleOptions.value.findIndex((o) => o.value === props.modelValue)
    nextTick(() => {
      place()
      // keep the selected option in view
      const sel = pop.value?.querySelector('.asm-opt.sel')
      sel?.scrollIntoView({ block: 'nearest' })
      searchInput.value?.focus({ preventScroll: true })
    })
  }
}
function onDocClick(e) {
  if (root.value?.contains(e.target) || pop.value?.contains(e.target)) return
  open.value = false
}
function onKey(e) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      toggle()
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    open.value = false
    root.value?.querySelector('.asm-trigger')?.focus()
  }
  if (e.key === 'Tab') open.value = false
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const dir = e.key === 'ArrowDown' ? 1 : -1
    activeIdx.value = Math.min(visibleOptions.value.length - 1, Math.max(0, activeIdx.value + dir))
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (visibleOptions.value[activeIdx.value]) pick(visibleOptions.value[activeIdx.value])
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
</script>

<template>
  <div class="ar-select-menu" ref="root" tabindex="0" :aria-label="ariaLabel" @keydown="onKey">
    <button type="button" class="asm-trigger" :class="{ open, disabled }" :disabled="disabled" @click="toggle">
      <span class="asm-label">{{ current?.label ?? '—' }}</span>
      <svg class="chev" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 6.5 4 4 4-4"/></svg>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="pop"
        class="asm-pop"
        :class="{ up: dropUp }"
        :style="{ left: pos.left + 'px', minWidth: pos.minWidth + 'px', ...(dropUp ? { bottom: pos.bottom + 'px' } : { top: pos.top + 'px' }) }"
      >
        <input
          v-if="searchable"
          ref="searchInput"
          v-model="search"
          class="asm-search"
          type="search"
          :placeholder="searchPlaceholder"
          aria-label="Search options"
          @click.stop
          @keydown.stop="onKey"
          @input="onSearch"
        />
        <template v-for="(o, i) in visibleOptions" :key="o.value">
          <!-- group header: rendered once when the group value changes -->
          <span v-if="o.group && (i === 0 || visibleOptions[i - 1].group !== o.group)" class="asm-group">{{ o.group }}</span>
          <button
            type="button"
            class="asm-opt"
            :class="{ sel: o.value === modelValue, act: i === activeIdx }"
            @click="pick(o)"
            @mousemove="activeIdx = i"
          >{{ o.label }}</button>
        </template>
        <span v-if="searchable && !visibleOptions.length" class="asm-empty">{{ emptyText }}</span>
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
</style>

<style>
/* teleported menu lives outside the component — unscoped styles */
.asm-pop {
  position: fixed; z-index: 70;
  padding: 6px;
  background: var(--bg-neutral-t1-1-default);
  border: 1px solid var(--st-neutral-t1-1-default);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 32px -8px rgba(16,24,40,.18), 0 4px 8px -2px rgba(16,24,40,.08);
  max-height: 300px; overflow-y: auto;
  animation: asmIn .14s cubic-bezier(.2,.7,.2,1);
  transform-origin: top center;
}
.asm-pop.up { transform-origin: bottom center; }
@keyframes asmIn { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
.asm-search {
  display: block; width: 100%; height: 34px; padding: 0 10px;
  margin: 0 0 4px; border: 0; border-bottom: 1px solid var(--st-neutral-t1-1-default);
  outline: 0; background: transparent; color: var(--fg-neutral-t1-1-default); font: inherit; font-size: 13px;
}
.asm-search:focus { border-bottom-color: var(--st-primary-t1-1-default); }
.asm-opt {
  display: flex; align-items: center; width: 100%;
  border: 0; background: none; cursor: pointer; text-align: left;
  font: inherit; font-size: 14px; color: var(--fg-neutral-t1-1-default);
  padding: 9px 12px; border-radius: var(--radius-md);
}
.asm-empty { display: block; padding: 10px 12px; color: var(--fg-neutral-t1-3-default); font-size: 13px; }
.asm-group {
  display: block; padding: 8px 12px 3px;
  font-size: 11px; font-weight: 550; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--fg-neutral-t1-3-default); user-select: none; cursor: default;
}
.asm-opt.act { background: var(--bg-neutral-t1-4-default); }
.asm-opt.sel { color: var(--fg-primary-t1-1-default); font-weight: 450; background: var(--bg-primary-t3-1-default); }
.asm-opt.sel::after {
  content: ""; margin-left: auto; width: 6px; height: 6px;
  border-radius: var(--radius-circular); background: var(--bg-primary-t1-1-default);
}
</style>
