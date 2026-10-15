<script setup>
import { computed } from 'vue'
import { useClassName } from '../../composables/className'

/*
 * Prototype stand-in for @panel/uikit ArTableCell.
 * Same API: header, align (start/center/end) props; renders th/td.
 */
const props = defineProps({
    header: { type: Boolean, default: false },
    align: {
        type: String,
        default: 'start',
        validator: (value) => ['start', 'center', 'end'].includes(value),
    },
    colspan: { type: [String, Number], default: undefined },
})
const { blockClassName } = useClassName('ArTableCell')
const tag = computed(() => (props.header ? 'th' : 'td'))
</script>

<template>
    <component
        :is="tag"
        :colspan="colspan"
        :class="[blockClassName, `${blockClassName}--${align}`, `${blockClassName}--${header ? 'header' : 'body'}`]"
    >
        <slot />
    </component>
</template>

<style scoped>
.ArTableCell {
    padding: var(--space-3) var(--space-4);
    white-space: nowrap;
}
.ArTableCell--start {
    text-align: start;
}
.ArTableCell--center {
    text-align: center;
}
.ArTableCell--end {
    text-align: end;
}
.ArTableCell--header {
    border-bottom: 1px solid var(--st-neutral-t1-4-default, var(--st-neutral-t1-5-default));
    font-size: 12px;
    font-weight: 450;
    line-height: 16px;
    letter-spacing: -0.24px;
    color: var(--fg-neutral-t1-3-default);
}
.ArTableCell--body {
    border-bottom: 1px solid var(--st-neutral-t1-5-default);
    font-size: 14px;
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-2-default);
    vertical-align: middle;
}
tr:last-child .ArTableCell--body {
    border-bottom: none;
}
</style>
