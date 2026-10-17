<script setup>
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArSubHeader: the sticky page bar
 * under the app header. A mainSection (min-height 56px, hairline bottom
 * border) holding a space-between container: the start side has the page
 * title (title-3) + the selector slot (the RegionSelect), the end side
 * the actions slot.
 */
defineProps({
    title: { type: String, default: '' },
})

const { blockClassName, className } = useClassName('ArSubHeader')
</script>

<template>
    <header :class="blockClassName">
        <div :class="className('mainSection')">
            <div :class="className('container')">
                <div :class="className('sideSection', 'start')">
                    <h2
                        v-if="title"
                        :class="className('title')"
                    >{{ title }}</h2>
                    <slot name="selector" />
                </div>
                <div :class="className('sideSection', 'end')">
                    <slot name="actions" />
                </div>
            </div>
        </div>
    </header>
</template>

<style scoped>
.ArSubHeader {
    position: sticky;
    top: var(--header-height);
    z-index: 20;
    background: var(--bg-neutral-t1-1-default);
}
.ArSubHeader__mainSection {
    display: flex;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--st-neutral-t1-5-default);
    min-height: 56px;
}
.ArSubHeader__container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: 0 var(--space-6);
}
.ArSubHeader__sideSection--start {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-width: 0;
}
.ArSubHeader__sideSection--end {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}
.ArSubHeader__title {
    margin: 0;
    font-size: 18px;
    font-weight: 450;
    line-height: 24px;
    letter-spacing: -0.36px;
    color: var(--fg-neutral-t1-1-default);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
