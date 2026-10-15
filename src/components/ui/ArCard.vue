<script setup>
import { computed } from 'vue'
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArCard.
 * Same API: selectable radio-like card — modelValue/value/trueValue/
 * falseValue/disabled, variant (secondary/tertiary). Clicking emits
 * update:modelValue (like the real component used in flavorCard.vue).
 */
const props = defineProps({
    variant: {
        type: String,
        default: 'tertiary',
        validator: (value) => ['secondary', 'tertiary'].includes(value),
    },
    modelValue: { type: [String, Boolean], default: false },
    disabled: { type: Boolean, default: false },
    value: { type: [String, Boolean], default: true },
    trueValue: { type: [String, Boolean], default: undefined },
    falseValue: { type: [String, Boolean], default: false },
})
const emit = defineEmits(['update:modelValue'])
const { blockClassName, className } = useClassName('ArCard')

const computedTrueValue = computed(() =>
    typeof props.trueValue !== 'undefined' ? props.trueValue : props.value
)
const isChecked = computed(() => props.modelValue === computedTrueValue.value)

function toggleSelect() {
    if (props.disabled) return
    emit('update:modelValue', isChecked.value ? props.falseValue : computedTrueValue.value)
}
</script>

<template>
    <div
        :class="[
            blockClassName,
            `${blockClassName}--${variant}`,
            isChecked && `${blockClassName}--selected`,
            disabled && `${blockClassName}--disabled`,
        ]"
        :tabindex="disabled ? -1 : 0"
        @click="toggleSelect"
        @keydown.space.enter.self="toggleSelect"
    >
        <slot />
    </div>
</template>

<style scoped>
.ArCard {
    position: relative;
    display: block;
    padding: var(--space-5);
    background: var(--bg-neutral-t1-1-default);
    border: 1px solid var(--st-neutral-t1-5-default);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
}
.ArCard--tertiary {
    background: var(--bg-neutral-t1-1-default);
}
.ArCard--secondary {
    background: var(--bg-neutral-t3-1-default);
}
.ArCard:hover:not(.ArCard--disabled) {
    border-color: var(--st-primary-t1-1-default);
}
.ArCard:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--st-primary-t1-2-default);
}
.ArCard--selected {
    border-color: var(--st-primary-t1-1-default);
    box-shadow: 0 0 0 1px var(--st-primary-t1-1-default);
}
.ArCard--disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
