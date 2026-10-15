<script setup>
import { useClassName } from '../../composables/className'
import ArIcon from './ArIcon.vue'

/*
 * Prototype stand-in for @panel/uikit ArTag.
 * Matches the real chip: white bg, 1px st-neutral-t3-3 border, radius 4,
 * caption-1 text, cross icon; hover/focus/active/disabled swap the
 * neutral-t1-4 backgrounds. Same API: text prop or default slot,
 * disabled, click emits.
 */
defineProps({
    text: { type: [String, Number], default: '' },
    disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['click'])
const { blockClassName, className } = useClassName('ArTag')

function onClick() {
    emit('click')
}
</script>

<template>
    <button
        type="button"
        :class="[blockClassName, disabled && `${blockClassName}--disabled`]"
        :disabled="disabled"
        @click="onClick"
    >
        <span
            :class="className('text')"
            dir="auto"
        >
            <slot>{{ text }}</slot>
        </span>
        <ArIcon
            name="cross"
            :class="className('icon')"
        />
    </button>
</template>

<style scoped>
.ArTag {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    gap: 4px;
    color: var(--fg-neutral-t1-1-default);
    background: var(--bg-neutral-t1-1-default);
    border: 1px solid var(--st-neutral-t3-3-default);
    border-radius: 4px;
    padding-block: calc(2px - 1px);
    padding-inline-start: calc(4px - 1px);
    padding-inline-end: calc(2px - 1px);
    font: inherit;
    cursor: pointer;
    transition: color .15s, background .15s, border-color .15s;
}
.ArTag:hover {
    color: var(--fg-neutral-t1-1-hover);
    background: var(--bg-neutral-t1-4-hover);
    border-color: var(--st-neutral-t1-4-hover);
}
.ArTag:focus-visible {
    outline: none;
    color: var(--fg-neutral-t1-1-focus);
    background: var(--bg-neutral-t1-4-focus);
    border-color: var(--st-neutral-focus);
}
.ArTag:active {
    color: var(--fg-neutral-t1-1-active);
    background: var(--bg-neutral-t1-4-active);
    border-color: var(--st-neutral-t1-4-active);
}
.ArTag--disabled {
    color: var(--fg-neutral-t1-1-disabled);
    background: var(--bg-neutral-t1-4-disabled);
    cursor: not-allowed;
}
.ArTag__text {
    padding: var(--space-0-5, 2px) 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px; /* caption-1 */
    font-weight: 325;
    line-height: 16px;
    letter-spacing: -0.24px;
}
.ArTag__icon {
    flex: none;
    color: var(--fg-neutral-t1-3-default);
}
</style>
