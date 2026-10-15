<script setup>
import { provide } from 'vue'

/*
 * Prototype stand-in for @panel/uikit ArRadioGroup.
 * The real component renders ArRadio options from props inline; the
 * prototype keeps the slot form. Same inject contract: value/disabled/
 * select. `inline` kept for the prototype's horizontal pickers.
 */
const props = defineProps({
    modelValue: { type: [String, Number, Boolean], default: '' },
    disabled: { type: Boolean, default: false },
    inline: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

provide('radioGroupValue', () => props.modelValue)
provide('radioGroupDisabled', () => props.disabled)
provide('radioGroupSelect', (value) => emit('update:modelValue', value))
</script>

<template>
    <div
        class="ArRadioGroup flex flex-column gap-4"
        :class="{ 'ArRadioGroup--inline': inline }"
        role="radiogroup"
    >
        <slot />
    </div>
</template>

<style scoped>
/* the real group is a plain `flex flex-column gap-4` wrapper; inline
   variant kept for the prototype's horizontal pickers. Specificity is
   doubled so the utilities on the same node (`flex flex-column gap-4`)
   can never override the direction. */
.ArRadioGroup.ArRadioGroup--inline {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-5);
}
</style>
