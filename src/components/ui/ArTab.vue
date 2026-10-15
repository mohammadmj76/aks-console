<script setup>
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArTab (tab bar only, no panels —
 * the create pages don't use the item-* content slots). Structure and
 * classes follow the real component: root ArTab, ArTab__items--{variant}
 * list (40px tall; elevated = grey pill container with rounded items,
 * flat = underlined items with a filler border line), ArTab__item--{variant}
 * buttons with --selected/--disabled states, ArTab__content-wrapper +
 * ArTab__title. Same API: items as strings or {key, title, disabled, icon},
 * v-model, flat variant, defaultValue fallback.
 */
const props = defineProps({
    modelValue: { type: [String, Number], default: null },
    defaultValue: { type: [String, Number], default: null },
    items: { type: Array, required: true },
    flat: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const { blockClassName, className } = useClassName('ArTab')

const modifier = props.flat ? 'flat' : 'elevated'

function keyOf(item) {
    return typeof item === 'object' ? item.key : item
}
function titleOf(item) {
    return typeof item === 'object' ? item.title : item
}
function changeTab(item) {
    if (typeof item === 'object' && item.disabled) return
    emit('update:modelValue', keyOf(item))
}
</script>

<template>
    <div :class="blockClassName">
        <div :class="className('container', modifier)">
            <ul :class="className('items', modifier)">
                <li
                    v-for="(item, i) in items"
                    :key="i"
                >
                    <button
                        type="button"
                        :class="className('item', [
                            modifier,
                            keyOf(item) === modelValue && 'selected',
                            typeof item === 'object' && item.disabled && 'disabled',
                        ])"
                        :tabindex="keyOf(item) === modelValue ? -1 : 0"
                        @click="changeTab(item)"
                        @keydown.enter.space.prevent="changeTab(item)"
                    >
                        <span :class="className('content-wrapper')">
                            <span :class="className('title')">{{ titleOf(item) }}</span>
                        </span>
                    </button>
                </li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.ArTab {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

/* 40px tall tab strip */
.ArTab__items {
    display: inline-flex;
    list-style-type: none;
    margin: 0;
    height: 40px;
    padding: 0;
}
.ArTab__items--elevated {
    background-color: var(--bg-neutral-t1-4-default);
    border-radius: 12px;
    padding: 4px;
    gap: 4px;
}
.ArTab__items--flat {
    width: 100%;
    background-color: var(--bg-neutral-t1-1-default);
    padding: 0;
}
/* filler line so the 2px bottom border runs to the end of the row */
.ArTab__items--flat::after {
    content: '';
    flex-grow: 1;
    border-bottom: 2px solid var(--st-neutral-t1-5-default);
}

.ArTab__item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    outline: 0;
    text-decoration: none;
    user-select: none;
    background-color: transparent;
    text-align: center;
    cursor: pointer;
    transition: background-color 200ms ease-in-out;
    outline-offset: -2px;
    white-space: nowrap;
    height: 100%;
    font-size: 14px; /* body-2 */
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
}
.ArTab__item--elevated {
    padding: var(--space-1);
    border-radius: 8px;
    color: var(--fg-neutral-t1-3-default);
    background-color: var(--bg-neutral-t1-4-default);
}
.ArTab__item--elevated:hover {
    color: var(--fg-neutral-t1-3-hover);
    background-color: var(--bg-neutral-t1-4-hover);
}
.ArTab__item--elevated:focus-visible {
    outline: 2px solid var(--st-neutral-focus);
}
.ArTab__item--elevated.ArTab__item--selected {
    color: var(--fg-neutral-t1-3-selected);
    background-color: var(--bg-neutral-t1-4-selected);
    pointer-events: none;
    box-shadow: 0 2px 4px 0 rgba(16, 24, 40, 0.16), 0 0 2px 0 rgba(16, 24, 40, 0.12); /* shadow md */
}
.ArTab__item--elevated.ArTab__item--disabled {
    color: var(--fg-neutral-t1-3-disabled);
    background-color: var(--bg-neutral-t1-4-disabled);
    pointer-events: none;
}

.ArTab__item--flat {
    padding: 8px 12px;
    color: var(--fg-neutral-t1-3-default);
    border-bottom: 2px solid var(--st-neutral-t1-5-default);
}
.ArTab__item--flat:hover {
    color: var(--fg-neutral-t1-3-hover);
    border-color: var(--st-neutral-t1-5-hover);
}
.ArTab__item--flat:focus-visible {
    color: var(--fg-neutral-t1-3-focus);
    outline: 2px solid var(--st-neutral-focus);
}
.ArTab__item--flat.ArTab__item--selected {
    color: var(--fg-neutral-t1-3-selected);
    border-color: var(--st-neutral-t1-5-selected);
    pointer-events: none;
}
.ArTab__item--flat.ArTab__item--disabled {
    color: var(--fg-neutral-t1-3-disabled);
    border-color: var(--st-neutral-t1-5-disabled);
    pointer-events: none;
}

.ArTab__content-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-1);
}
.ArTab__title {
    padding: var(--space-0-5, 2px) var(--space-1);
}
</style>
