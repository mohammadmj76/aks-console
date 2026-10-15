<script setup>
import { computed, inject } from 'vue'
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArInput.
 * Structure matches the real component: token-driven box
 * (--inputHeight/--inputBorder/--inputShadowColor…), ArInput__wrapper +
 * ArInput__input (body-2, padding via --inputPadStart/End), hover/focus
 * swap t1-4 border + fg colors, --error adds a 1px error ring via
 * box-shadow (no red border). Same API subset used by the panel:
 * v-model, prefix, disabled, readonly, ltr, size (sm/md/lg), error
 * (falls back to the wrapping ArField state).
 */
const props = defineProps({
    modelValue: { type: [String, Number], default: '' },
    prefix: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    readonly: { type: Boolean, default: false },
    ltr: { type: Boolean, default: false },
    error: { type: Boolean, default: undefined },
    size: {
        type: String,
        default: 'md',
        validator: (value) => ['sm', 'md', 'lg'].includes(value),
    },
})
const emit = defineEmits(['update:modelValue'])

const { blockClassName, className } = useClassName('ArInput')
const fieldError = inject('fieldError', null)
const innerError = computed(() =>
    typeof props.error !== 'undefined' ? props.error : Boolean(fieldError && fieldError())
)

function onInput(e) {
    emit('update:modelValue', e.target.value)
}
</script>

<template>
    <div
        :class="[
            blockClassName,
            innerError && `${blockClassName}--error`,
            disabled && `${blockClassName}--disabled`,
            ltr && `${blockClassName}--ltr`,
            `${blockClassName}--${size}`,
        ]"
    >
        <span
            v-if="prefix"
            :class="className('affix')"
        >{{ prefix }}</span>
        <div :class="className('wrapper')">
            <input
                :value="modelValue"
                :class="className('input')"
                :disabled="disabled"
                :readonly="readonly"
                v-bind="$attrs"
                @input="onInput"
            >
        </div>
    </div>
</template>

<style scoped>
.ArInput {
    --inputHeight: 40px;
    --inputPadStart: 13px; /* 14px - border width */
    --inputPadEnd: 13px;
    --inputColor: var(--fg-neutral-t1-2-default);
    --inputBgColor: var(--bg-neutral-t1-1-default);
    --inputBorder: var(--st-neutral-t1-4-default);
    --inputShadowColor: transparent;

    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--inputHeight);
    color: var(--inputColor);
    background-color: var(--inputBgColor);
    border: 1px solid var(--inputBorder);
    border-radius: 8px;
    transition: border-color 0.15s, color 0.15s, background-color 0.15s;
    box-shadow: 0 0 0 1px var(--inputShadowColor);
}
.ArInput--sm { --inputHeight: 32px; }
.ArInput--md { --inputHeight: 40px; }
.ArInput--lg { --inputHeight: 48px; }
.ArInput:hover:not(.ArInput--disabled) {
    --inputColor: var(--fg-neutral-t1-2-hover);
    --inputBorder: var(--st-neutral-t1-4-hover);
}
.ArInput:focus-within:not(.ArInput--disabled) {
    --inputColor: var(--fg-neutral-t1-2-focus);
    --inputBorder: var(--st-neutral-t1-4-focus);
}
.ArInput--error {
    --inputShadowColor: var(--st-error-t1-1-default);
}
.ArInput--disabled {
    --inputColor: var(--fg-neutral-t1-2-disabled);
    --inputBorder: var(--st-neutral-t1-4-disabled);
    cursor: not-allowed;
}
.ArInput--ltr {
    direction: ltr;
}
.ArInput__wrapper {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    height: 100%;
}
.ArInput__affix {
    font-size: 14px; /* body-2 */
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t2-1-default);
    background: var(--bg-neutral-t1-3-default);
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    padding-inline: var(--space-2);
    border-start-start-radius: 8px;
    border-end-start-radius: 8px;
}
.ArInput__input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 14px; /* body-2 */
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--inputColor);
    padding-block: 0;
    padding-inline-start: var(--inputPadStart);
    padding-inline-end: var(--inputPadEnd);
}
.ArInput__input::placeholder {
    color: var(--fg-neutral-t1-3-default);
}
.ArInput__input:disabled {
    cursor: not-allowed;
}
</style>
