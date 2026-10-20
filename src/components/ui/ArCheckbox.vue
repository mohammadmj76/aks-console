<script setup>
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArCheckbox.
 * Structure matches the real component: a bare ArCheckbox wrapper div
 * with the input styled as the visible box (ArCheckbox__input, 16px,
 * 2px border, radius xs, white check drawn via background svg when
 * checked, hover ring via box-shadow) and an optional ArCheckbox__label
 * (body-2, 6px padding-inline-start). Same API: v-model, label (slot or
 * prop), disabled, indeterminate.
 */
const props = defineProps({
    modelValue: { type: Boolean, default: false },
    label: { type: [String, Number], default: '' },
    disabled: { type: Boolean, default: false },
    indeterminate: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const { blockClassName, className } = useClassName('ArCheckbox')
const id = `ar-checkbox-${Math.random().toString(36).slice(2)}`

function onToggle() {
    if (!props.disabled) emit('update:modelValue', !props.modelValue)
}
</script>

<template>
    <div :class="[blockClassName, disabled && `${blockClassName}--disabled`]">
        <input
            :id="id"
            type="checkbox"
            role="checkbox"
            :class="className('input')"
            :checked="modelValue"
            :indeterminate.prop="indeterminate"
            :disabled="disabled"
            @click.prevent="onToggle"
        >
        <label
            v-if="label || $slots.default"
            :for="id"
            :class="className('label')"
        >
            <slot>{{ label }}</slot>
        </label>
    </div>
</template>

<style scoped>
.ArCheckbox {
    display: flex;
    cursor: pointer;
    align-items: center;
}
.ArCheckbox--disabled {
    cursor: not-allowed;
}
.ArCheckbox__input {
    display: inline-block;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    margin: 0;
    padding: 0;
    border: 2px solid var(--st-neutral-t1-2-default);
    background-color: var(--bg-neutral-t1-1-default);
    border-radius: 4px;
    /* box-shadow only — like the real component; a background-color
       transition stalls in Chrome when the check svg swaps in the same
       style recalc, leaving the box white while checked */
    transition: box-shadow 200ms ease, border-color 150ms ease;
    cursor: inherit;
    appearance: none;
}
.ArCheckbox__input:hover:not(:disabled) {
    background-color: var(--bg-neutral-t1-1-hover);
    box-shadow: 0 0 0 2px var(--st-neutral-t1-5-hover);
}
.ArCheckbox__input:focus-visible {
    outline: 2px solid var(--st-neutral-focus);
    outline-offset: 2px;
}
.ArCheckbox__input:checked,
.ArCheckbox__input:indeterminate {
    border-color: transparent;
    background-color: var(--bg-primary-t3-1-default);
    background-position: center;
    background-repeat: no-repeat;
}
.ArCheckbox__input:checked {
    background-image: url('data:image/svg+xml,<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.819 2.68258C10.9947 2.85832 10.9947 3.14324 10.819 3.31898L4.63148 9.50648C4.45574 9.68221 4.17082 9.68221 3.99508 9.50648L1.18258 6.69398C1.00685 6.51824 1.00685 6.23332 1.18258 6.05758C1.35832 5.88185 1.64324 5.88185 1.81898 6.05758L4.31328 8.55188L10.1826 2.68258C10.3583 2.50685 10.6432 2.50685 10.819 2.68258Z" fill="white"/></svg>');
}
.ArCheckbox__input:indeterminate {
    background-image: url('data:image/svg+xml,<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.39844 6.00078C2.39844 5.75225 2.61334 5.55078 2.87844 5.55078H9.11844C9.38353 6.00078 9.38353 6.45078 9.11844 6.45078H2.87844C2.61334 6.45078 2.39844 6.24931 2.39844 6.00078Z" fill="white"/></svg>');
}
.ArCheckbox__input:disabled {
    border-color: var(--st-neutral-t1-2-disabled);
    cursor: not-allowed;
}
.ArCheckbox__input:disabled:checked {
    background-color: var(--bg-primary-t3-1-disabled);
}
.ArCheckbox__label {
    display: inline-block;
    color: var(--fg-neutral-t1-1-default);
    padding-inline-start: 6px;
    cursor: inherit;
    font-size: 14px; /* body-2 */
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
}
</style>
