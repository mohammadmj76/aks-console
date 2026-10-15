<script setup>
import { provide, ref } from 'vue'
import { useClassName } from '../../composables/className'
import ArIcon from './ArIcon.vue'

/*
 * Prototype stand-in for @panel/uikit ArField.
 * Same API: label, message, error, required, for, icon + default slot.
 * Provides `fieldError`/`fieldId` so ArInput inside picks up the error
 * state automatically (same inject contract as the real uikit).
 */
const props = defineProps({
    label: { type: String, default: '' },
    message: { type: String, default: '' },
    error: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    htmlFor: { type: String, default: '' },
    icon: { type: String, default: 'warning' },
})

const { blockClassName, className } = useClassName('ArField')
const id = ref(`af-${Math.random().toString(36).slice(2, 9)}`)
provide('fieldError', () => props.error)
provide('fieldId', () => props.htmlFor || id.value)
provide('fieldSetId', (newId) => {
    id.value = newId
})
</script>

<template>
    <div :class="blockClassName">
        <div
            v-if="label"
            :class="className('header')"
        >
            <label
                :for="htmlFor || id"
                :class="className('label')"
            >
                {{ label }}
                <span
                    v-if="required"
                    :class="className('requiredStar')"
                >*</span>
            </label>
        </div>
        <slot />
        <div
            v-if="message"
            :class="className('footer', error && 'error')"
        >
            <ArIcon
                :name="icon"
                size="xs"
                :class="className('icon')"
            />
            <span :class="className('message')">{{ message }}</span>
        </div>
    </div>
</template>

<style scoped>
.ArField {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}
.ArField__label {
    font-size: 14px;
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-1-default);
}
.ArField__requiredStar {
    color: var(--fg-error-t1-1-default);
    vertical-align: text-top;
}
.ArField__footer {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--fg-neutral-t1-3-default);
}
.ArField__footer--error {
    color: var(--fg-error-t1-1-default);
}
.ArField__message {
    font-size: 12px;
    font-weight: 450;
    line-height: 16px;
    letter-spacing: -0.24px;
}
.ArField__icon {
    flex-shrink: 0;
    align-self: flex-start;
}
</style>
