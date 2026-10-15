<script setup>
import { computed, useSlots } from 'vue'
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArSection.
 * Same API: title, description, contentClass + header/actions slots.
 */
defineProps({
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    contentClass: { type: [String, Array, Object], default: () => ({}) },
})

const slots = useSlots()
const { blockClassName, className } = useClassName('ArSection')
const hasHeaderSlot = computed(() => Boolean(slots.header))
const hasActions = computed(() => Boolean(slots.actions))
</script>

<template>
    <section :class="blockClassName">
        <header
            v-if="title || description || hasHeaderSlot"
            :class="className('section', 'header')"
        >
            <slot
                v-if="hasHeaderSlot"
                name="header"
            />
            <template v-else>
                <div>
                    <h6 :class="className('title')">{{ title }}</h6>
                    <p
                        v-if="description"
                        :class="className('description')"
                    >
                        {{ description }}
                    </p>
                </div>
                <div
                    v-if="hasActions"
                    :class="className('actions')"
                >
                    <slot name="actions" />
                </div>
            </template>
        </header>
        <div
            :class="[contentClass, className('section', 'content')]"
        >
            <slot />
        </div>
    </section>
</template>

<style scoped>
.ArSection {
    display: flex;
    flex-direction: column;
    background: var(--bg-neutral-t1-1-default);
    border-radius: 8px;
    color: var(--fg-neutral-t1-1-default);
}
.ArSection__section--header {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-6);
    padding: var(--space-6);
    border-bottom: 1px solid var(--st-neutral-t1-5-default);
}
@media (min-width: 640px) {
    .ArSection__section--header {
        flex-direction: row;
        align-items: center;
    }
}
.ArSection__section--content {
    flex-grow: 1;
    padding: var(--space-6);
    font-size: 14px;
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
}
.ArSection__title {
    margin: 0;
    font-size: 16px; /* body-1 */
    font-weight: 450;
    line-height: 24px;
    letter-spacing: -0.32px;
    color: var(--fg-neutral-t1-1-default);
}
.ArSection__description {
    margin: 0;
    font-size: 14px;
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-3-default);
}
.ArSection__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
}
</style>
