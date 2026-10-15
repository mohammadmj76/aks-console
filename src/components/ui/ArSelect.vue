<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import ArIcon from './ArIcon.vue'
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArSelect (vue-select based).
 * Structure and classes follow the real component: root ArSelect with
 * --active/--disabled/--error/--above modifiers, ArSelect__tags--{size}
 * trigger, ArSelect__single label, ArSelect__placeholder, ArSelect__indicator
 * (chevron rotates when open), teleported ArSelect__content-wrapper--open
 * dropdown with ArSelect__element > ArSelect__option--highlight rows and an
 * ArSelect__option-check check icon on the selected option.
 * Same API subset: options (strings or {value,label}), v-model, size,
 * disabled, error, placeholder, searchable.
 */
const props = defineProps({
    options: { type: Array, required: true }, // strings or { value, label }
    modelValue: { type: [String, Number], default: '' },
    label: { type: String, default: 'label' },
    placeholder: { type: String, default: 'Select an option…' },
    size: { type: String, default: 'md' }, // sm | md | lg
    disabled: Boolean,
    error: Boolean,
    searchable: Boolean,
    ariaLabel: String,
})
const emit = defineEmits(['update:modelValue'])
const { blockClassName, className } = useClassName('ArSelect')

const norm = computed(() =>
    props.options.map((o) => (typeof o === 'object' ? o : { value: o, [props.label]: o }))
)
const current = computed(() => norm.value.find((o) => o.value === props.modelValue))

const open = ref(false)
const root = ref(null)
const pop = ref(null)
const activeIdx = ref(-1)
const pos = ref({ top: 0, left: 0, minWidth: 0 })
const dropUp = ref(false)
const search = ref('')
const searchInput = ref(null)

const visibleOptions = computed(() => props.searchable
    ? norm.value.filter((o) => o.value !== '' && String(o[props.label]).toLowerCase().includes(search.value.trim().toLowerCase()))
    : norm.value)

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
    const estHeight = Math.min(300, Math.max(1, visibleOptions.value.length) * 40 + 16 + (props.searchable ? 38 : 0))
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
    root.value?.focus()
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
            const sel = pop.value?.querySelector('.ArSelect__option--selected')
            sel?.scrollIntoView({ block: 'nearest' })
            searchInput.value?.focus({ preventScroll: true })
        })
    }
}
function close() {
    open.value = false
    root.value?.focus()
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
        close()
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
    <div
        ref="root"
        :class="[blockClassName, {
            [`${blockClassName}--active`]: open,
            [`${blockClassName}--disabled`]: disabled,
            [`${blockClassName}--error`]: error,
            [`${blockClassName}--above`]: dropUp,
        }]"
        role="combobox"
        :aria-label="ariaLabel"
        tabindex="0"
        @keydown="onKey"
    >
        <div
            :class="className('tags', size)"
            @click="toggle"
        >
            <span
                v-if="current && !open"
                :class="className('single')"
            >
                <span :class="className('single-text')">{{ current[props.label] }}</span>
            </span>
            <span :class="className('placeholder', [!(!current || open) && 'none'])">{{ placeholder }}</span>
            <div :class="className('indicator', 'chevron')">
                <ArIcon name="chevron-down" />
            </div>
        </div>
        <Teleport to="body">
            <div
                v-if="open"
                ref="pop"
                :class="className('content-wrapper', 'open')"
                :style="{ left: pos.left + 'px', minWidth: pos.minWidth + 'px', ...(dropUp ? { bottom: pos.bottom + 'px' } : { top: pos.top + 'px' }) }"
            >
                <input
                    v-if="searchable"
                    ref="searchInput"
                    v-model="search"
                    :class="className('input')"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="placeholder"
                    aria-label="Search options"
                    @click.stop
                    @keydown.stop="onKey"
                    @input="activeIdx = -1; nextTick(place)"
                >
                <ul
                    :class="className('content')"
                    role="listbox"
                >
                    <li
                        v-for="(o, i) in visibleOptions"
                        :key="o.value"
                        :class="className('element')"
                        role="option"
                    >
                        <span
                            :class="className('option', [
                                i === activeIdx && 'highlight',
                                o.value === modelValue && 'selected',
                            ])"
                            @click.stop="pick(o)"
                            @mouseenter="activeIdx = i"
                        >
                            <ArIcon
                                name="check"
                                size="sm"
                                :class="className('option-check', o.value !== modelValue && 'invisible')"
                            />
                            <span dir="auto">{{ o[props.label] }}</span>
                        </span>
                    </li>
                    <li v-if="searchable && !visibleOptions.length">
                        <div :class="className('option', ['pointer-none', 'empty'])">
                            {{ 'No results found' }}
                        </div>
                    </li>
                </ul>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.ArSelect {
    display: inline-flex;
    outline: none;
    cursor: pointer;
}
.ArSelect:focus-visible .ArSelect__tags { box-shadow: 0 0 0 3px var(--st-primary-t1-2-default); }
.ArSelect--disabled { pointer-events: none; opacity: 0.5; }
.ArSelect--error .ArSelect__tags { outline: 1px solid var(--st-error-t1-1-default); }

/* trigger box — heights per size like the real component */
.ArSelect__tags {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    border-radius: 8px;
    border: 1px solid var(--st-neutral-t1-4-default);
    background: var(--bg-neutral-t1-1-default);
    padding-inline: calc(12px - 1px);
    transition: border-color .15s, background .15s;
}
.ArSelect__tags--sm { height: 32px; }
.ArSelect__tags--md { height: 40px; }
.ArSelect__tags--lg { height: 48px; }
.ArSelect__tags:hover { border-color: var(--st-neutral-t1-4-hover); background: var(--bg-neutral-t1-1-hover); }
.ArSelect--active { z-index: 50; }
.ArSelect--active .ArSelect__tags {
    border-color: var(--st-neutral-t1-4-default);
    background: var(--bg-neutral-t1-1-hover);
}
.ArSelect--active .ArSelect__indicator--chevron { transform: rotateZ(180deg); }

.ArSelect__single {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    max-width: 100%;
    font-size: 14px; /* body-2 */
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-1-default);
}
.ArSelect__single-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ArSelect__placeholder {
    font-size: 14px; /* body-2 */
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-3-default);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ArSelect__placeholder--none { display: none; }

.ArSelect__indicator {
    display: inline-flex;
    margin-inline-start: auto;
    color: var(--fg-neutral-t1-3-default);
    transition: transform 0.2s ease;
}

/* dropdown — teleported, unscoped styles below */
</style>

<style>
/* the dropdown is teleported to <body>, so its styles are unscoped */
.ArSelect__content-wrapper {
    position: fixed;
    z-index: 70;
    background: var(--bg-neutral-t1-1-default);
    overflow: auto;
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.16);
    margin: 8px 0;
    max-height: 300px;
    cursor: auto;
}
.ArSelect__content {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0;
    margin: 0;
    min-width: 100%;
    width: max-content;
}
.ArSelect__element { display: block; }
.ArSelect__option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    white-space: nowrap;
    cursor: pointer;
    border-radius: 8px;
    background: var(--bg-neutral-t1-1-default);
    padding: 6px 8px;
    font-size: 14px; /* body-2 */
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-1-default);
}
.ArSelect__option--highlight { background: var(--bg-neutral-t1-1-hover); }
.ArSelect__option--selected { background: var(--bg-neutral-t1-1-hover); }
.ArSelect__option--empty {
    cursor: default;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--fg-neutral-t1-3-default);
}
.ArSelect__option-check {
    flex-shrink: 0;
    color: var(--fg-primary-t1-1-default);
}
.ArSelect__option-check--invisible { visibility: hidden; }
</style>
