<script setup>
import { computed, inject } from 'vue'
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArRadio.
 * Structure matches the real component: native input styled as the circle
 * (ArRadio__input, 16px, 2px border, checked border goes primary) plus an
 * absolutely-positioned ArRadio__thumb svg dot that scales in when checked,
 * then ArRadio__label (body-2, 6px padding-inline-start). Label click is
 * forwarded to the input. Sits inside an ArRadioGroup (modelValue comes
 * from the group), same API: value, label, disabled.
 */
const props = defineProps({
    value: { type: [String, Number, Boolean], default: false },
    label: { type: [String, Number], default: '' },
    disabled: { type: Boolean, default: false },
})

const { blockClassName, className } = useClassName('ArRadio')
const id = `ar-radio-${Math.random().toString(36).slice(2)}`
const groupValue = inject('radioGroupValue', null)
const groupDisabled = inject('radioGroupDisabled', () => false)
const groupSelect = inject('radioGroupSelect', () => {})

const checked = computed(() => (groupValue ? groupValue() === props.value : false))
const isDisabled = computed(() => groupDisabled() || props.disabled)

function onClick() {
    if (!isDisabled.value) groupSelect(props.value)
}
</script>

<template>
    <div :class="[blockClassName, isDisabled && `${blockClassName}--disabled`]">
        <input
            :id="id"
            type="radio"
            role="radio"
            :class="className('input')"
            :value="value"
            :disabled="isDisabled"
            :checked="checked"
            @click.prevent="onClick"
        >
        <svg
            viewBox="0 0 16 16"
            xmlns="http://www.w3.org/2000/svg"
            :class="className('thumb')"
        >
            <circle
                cx="8"
                cy="8"
                r="4"
            />
        </svg>
        <label
            v-if="label || $slots.default"
            :for="id"
            :class="className('label')"
            @click.prevent="onClick"
        >
            <span :class="className('label-text')">
                <slot>{{ label }}</slot>
            </span>
        </label>
    </div>
</template>

<style scoped>
.ArRadio {
    position: relative;
    display: flex;
    align-items: center;
}
.ArRadio--disabled .ArRadio__input,
.ArRadio--disabled .ArRadio__label {
    cursor: not-allowed;
}

/* the input itself is the visible circle */
.ArRadio__input {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    cursor: pointer;
    margin: 0;
    appearance: none;
    border: 2px solid var(--st-neutral-t1-2-default);
    border-radius: 9999px;
    background-color: var(--bg-neutral-t1-1-default);
    transition: background-color .15s, border-color .15s, box-shadow .15s;
}
.ArRadio__input:hover:not(:disabled) {
    background-color: var(--bg-neutral-t1-1-hover);
    border-color: var(--st-neutral-t1-2-hover);
    box-shadow: 0 0 0 2px var(--st-neutral-t1-4-default);
}
.ArRadio__input:focus-visible {
    outline: 2px solid var(--st-neutral-focus);
    outline-offset: 2px;
}
.ArRadio__input:checked {
    border-color: var(--st-primary-t1-1-default);
}
.ArRadio__input:checked:hover:not(:disabled) {
    border-color: var(--bg-primary-t3-1-hover);
    box-shadow: 0 0 0 2px var(--st-primary-t1-2-default);
}
.ArRadio__input:disabled {
    border-color: var(--st-neutral-t1-2-disabled);
}

/* the inner dot, scales in on check */
.ArRadio__thumb {
    position: absolute;
    width: 16px;
    height: 16px;
    fill: var(--bg-primary-t3-1-default);
    transition: 120ms transform ease-in-out;
    transform: scale(0);
    pointer-events: none;
    inset-inline-start: 0;
}
.ArRadio__input:checked ~ .ArRadio__thumb {
    transform: scale(1);
}

.ArRadio__label {
    cursor: pointer;
    padding-inline-start: 6px;
    color: var(--fg-neutral-t1-1-default);
    font-size: 14px; /* body-2 */
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
}
.ArRadio__label-text { display: block; }
</style>
