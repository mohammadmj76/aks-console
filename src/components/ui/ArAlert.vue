<script setup>
import { computed } from 'vue'
import { useClassName } from '../../composables/className'
import ArIcon from './ArIcon.vue'

/*
 * Prototype stand-in for @panel/uikit ArAlert.
 * Same API: type (info/success/warning/danger/default), icon, title,
 * description (string or string[] which renders as a list) + slots.
 */
const props = defineProps({
    type: {
        type: String,
        default: 'default',
        validator: (value) => ['info', 'success', 'warning', 'danger', 'default'].includes(value),
    },
    icon: { type: String, default: '' },
    title: { type: [String, Number], default: '' },
    description: { type: [String, Number, Array], default: '' },
})

const { blockClassName, className } = useClassName('ArAlert')

const DEFAULT_ICONS = {
    info: 'info',
    success: 'check-circle',
    warning: 'warning',
    danger: 'error',
    default: 'info',
}
const iconName = computed(() => props.icon || DEFAULT_ICONS[props.type])
const hasTitle = computed(() => Boolean(props.title))
const hasDescription = computed(() =>
    Boolean(props.description || (Array.isArray(props.description) && props.description.length))
)
</script>

<template>
    <div :class="[blockClassName, `${blockClassName}--${type}`]">
        <ArIcon
            :name="iconName"
            size="md"
            :class="className('icon')"
        />
        <div :class="className('content')">
            <div
                v-if="hasTitle"
                :class="className('title')"
            >
                <slot name="title">{{ title }}</slot>
            </div>
            <div
                v-if="hasDescription"
                :class="className('description')"
            >
                <slot name="description">
                    <ul
                        v-if="Array.isArray(description)"
                        :class="className('list')"
                    >
                        <li
                            v-for="desc of description"
                            :key="desc"
                            :class="className('item')"
                        >
                            {{ desc }}
                        </li>
                    </ul>
                    <template v-else>{{ description }}</template>
                </slot>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ArAlert {
    display: flex;
    gap: var(--space-2);
    border-radius: var(--radius-sm);
    padding: var(--space-4) var(--space-6);
}
.ArAlert--info {
    background: var(--bg-info-t2-1-default);
}
.ArAlert--success {
    background: var(--bg-success-t2-1-default);
}
.ArAlert--warning {
    background: var(--bg-warning-t2-1-default);
}
.ArAlert--danger {
    background: var(--bg-error-t2-1-default);
}
.ArAlert--default {
    background: var(--bg-neutral-t1-4-default);
}
.ArAlert__icon {
    flex-shrink: 0;
    color: var(--fg-neutral-t1-2-default);
}
.ArAlert__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    align-self: center;
}
.ArAlert__title {
    font-size: 16px; /* body-1 */
    font-weight: 450;
    line-height: 24px;
    letter-spacing: -0.32px;
    color: var(--fg-neutral-t1-1-default);
}
.ArAlert__description {
    font-size: 14px;
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-1-default);
}
.ArAlert__list {
    margin: 0;
    padding-inline-start: var(--space-4);
}
.ArAlert__item {
    padding-inline-start: var(--space-2);
}
.ArAlert__item::marker {
    content: '\2022';
}
</style>
