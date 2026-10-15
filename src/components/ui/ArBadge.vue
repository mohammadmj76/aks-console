<script setup>
import { useClassName } from '../../composables/className'
import ArIcon from './ArIcon.vue'

/*
 * Prototype stand-in for @panel/uikit ArBadge.
 * Same API: variant (primary/neutral/danger/info/warning/success),
 * size (sm/md/lg), text, icon, prependIcon, appendIcon, pill.
 */
const props = defineProps({
    variant: {
        type: String,
        default: 'primary',
        validator: (value) => ['primary', 'neutral', 'danger', 'info', 'warning', 'success'].includes(value),
    },
    size: {
        type: String,
        default: 'md',
        validator: (value) => ['sm', 'md', 'lg'].includes(value),
    },
    text: { type: [String, Number], default: '' },
    icon: { type: String, default: '' },
    prependIcon: { type: String, default: '' },
    appendIcon: { type: String, default: '' },
    pill: { type: Boolean, default: false },
})

const { blockClassName, className } = useClassName('ArBadge')
const iconSize = props.size === 'lg' ? 'sm' : 'xs'
</script>

<template>
    <span
        :class="[
            blockClassName,
            `${blockClassName}--${size}`,
            `${blockClassName}--${variant}`,
            pill && `${blockClassName}--pill`,
        ]"
        :title="text"
    >
        <ArIcon
            v-if="prependIcon"
            :name="prependIcon"
            :size="iconSize"
            :class="className('icon')"
        />
        <ArIcon
            v-else-if="icon"
            :name="icon"
            :size="iconSize"
            :class="className('icon')"
        />
        <span :class="className('text')">
            <slot>{{ text }}</slot>
        </span>
        <ArIcon
            v-if="appendIcon"
            :name="appendIcon"
            :size="iconSize"
            :class="className('icon')"
        />
    </span>
</template>

<style scoped>
.ArBadge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    gap: 2px;
    border-radius: 4px;
    white-space: nowrap;
}
.ArBadge--pill {
    border-radius: 9999px;
}
/* variants — soft tinted backgrounds with matching fg (t2 pairing) */
.ArBadge--primary {
    background: var(--bg-primary-t2-1-default);
    color: var(--fg-primary-t2-1-default);
}
.ArBadge--neutral {
    background: var(--bg-neutral-t1-4-default);
    color: var(--fg-neutral-t1-3-default);
}
.ArBadge--danger {
    background: var(--bg-error-t2-1-default);
    color: var(--fg-error-t2-1-default);
}
.ArBadge--info {
    background: var(--bg-info-t2-1-default);
    color: var(--fg-info-t2-1-default);
}
.ArBadge--warning {
    background: var(--bg-warning-t2-1-default);
    color: var(--fg-warning-t2-1-default);
}
.ArBadge--success {
    background: var(--bg-success-t2-1-default);
    color: var(--fg-success-t2-2-default);
}
/* sizes — caption-1-strong / body-2-strong per the real component */
.ArBadge--sm {
    font-size: 12px;
    font-weight: 450;
    line-height: 16px;
    letter-spacing: -0.24px;
    padding: 2px;
}
.ArBadge--md {
    font-size: 12px;
    font-weight: 450;
    line-height: 16px;
    letter-spacing: -0.24px;
    padding: 4px;
}
.ArBadge--lg {
    font-size: 14px;
    font-weight: 450;
    line-height: 20px;
    letter-spacing: -0.28px;
    padding: 8px;
}
.ArBadge__icon {
    flex: none;
    display: inline-flex;
}
.ArBadge__text {
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
