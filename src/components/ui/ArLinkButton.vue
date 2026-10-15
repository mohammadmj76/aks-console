<script setup>
import { computed } from 'vue'
import { useClassName } from '../../composables/className'
import ArIcon from './ArIcon.vue'

/*
 * Prototype stand-in for @panel/uikit ArLinkButton.
 * Same API: to (router-link), href (a), otherwise a plain button;
 * prependIcon/appendIcon, disabled.
 */
const props = defineProps({
    to: { type: [String, Object], default: '' },
    href: { type: String, default: '' },
    prependIcon: { type: String, default: '' },
    appendIcon: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
})

const { blockClassName, className } = useClassName('ArLinkButton')
const comp = computed(() => {
    if (props.href) return 'a'
    if (props.to) return 'router-link'
    return 'button'
})
const destinationAttr = computed(() => {
    if (comp.value === 'a') return { href: props.href }
    if (comp.value === 'router-link') return { to: props.to }
    return {}
})
</script>

<template>
    <component
        :is="comp"
        v-bind="destinationAttr"
        :class="blockClassName"
        :disabled="disabled"
        type="button"
    >
        <ArIcon
            v-if="prependIcon"
            :name="prependIcon"
            size="sm"
            :class="className('icon')"
        />
        <span :class="className('text')"><slot /></span>
        <ArIcon
            v-if="appendIcon"
            :name="appendIcon"
            size="sm"
            :class="className('icon')"
        />
    </component>
</template>

<style scoped>
.ArLinkButton {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 12px;
    font-weight: 450;
    line-height: 16px;
    letter-spacing: -0.24px;
    color: var(--fg-primary-t1-1-default);
    cursor: pointer;
    text-decoration: none;
}
.ArLinkButton:hover {
    text-decoration: underline;
}
.ArLinkButton:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    text-decoration: none;
}
.ArLinkButton__icon {
    flex: none;
}
.ArLinkButton__text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
