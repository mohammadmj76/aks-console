<script setup>
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArTableRow.
 * Same API: header, striped props.
 */
defineProps({
    header: { type: Boolean, default: false },
    striped: { type: Boolean, default: false },
})
const { blockClassName, className } = useClassName('ArTableRow')
</script>

<template>
    <tr :class="[blockClassName, className(undefined, [header ? 'header' : 'body', striped && 'striped'], true)]">
        <slot />
    </tr>
</template>

<style scoped>
.ArTableRow {
    position: relative;
}
.ArTableRow--header {
    color: var(--fg-neutral-t1-3-default);
    background: var(--bg-neutral-t1-1-default);
    position: sticky;
    top: 0;
    z-index: 1;
}
.ArTableRow--body {
    background: var(--bg-neutral-t1-1-default);
}
.ArTableRow--striped:nth-of-type(odd) {
    background: var(--bg-neutral-t1-3-default);
}
</style>
