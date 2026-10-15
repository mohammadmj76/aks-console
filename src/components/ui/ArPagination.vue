<script setup>
import { computed } from 'vue'
import { useClassName } from '../../composables/className'
import ArButton from './ArButton.vue'

/*
 * Prototype stand-in for @panel/uikit ArPagination. The real component
 * delegates its pages module to ArPaginationPages: a bordered white box
 * (ArPaginationPages) holding ArButton sm ghost chevrons and ArButton sm
 * page buttons — the selected page is a `primary` variant button, inactive
 * pages get ArPaginationPages__item--inactive (pointer-events none).
 * Same API subset: current, total (number of pages), disabled,
 * emits page-change.
 */
const props = defineProps({
    current: { type: Number, required: true },
    total: { type: Number, required: true },
    disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['page-change'])
const { blockClassName, className } = useClassName('ArPaginationPages')

/* mirrors the real pagesRange: ≤7 pages shown whole, otherwise a window
   with ellipsis markers and the first/last page */
const pagesRange = computed(() => {
    const { current, total: length } = props
    const MAX_LENGTH_WITHOUT_ELLIPSIS = 7
    const MAX_INNER_RANGE_LENGTH = 5
    const MAX_INNER_RANGE_SIDE_LENGTH = 4
    const INNER_RANGE_SIDE_LENGTH = 1

    const make = (number, label) => ({ number, key: number || label })

    const list = []
    let rangeStart = current - INNER_RANGE_SIDE_LENGTH
    let rangeEnd = current + INNER_RANGE_SIDE_LENGTH

    if (length <= MAX_LENGTH_WITHOUT_ELLIPSIS) {
        rangeStart = 1
        rangeEnd = length
    } else if (current < MAX_INNER_RANGE_LENGTH) {
        rangeStart = 1
        rangeEnd = MAX_INNER_RANGE_LENGTH
    } else if (current > length - MAX_INNER_RANGE_SIDE_LENGTH) {
        rangeStart = length - MAX_INNER_RANGE_SIDE_LENGTH
        rangeEnd = length
    }
    rangeStart = Math.max(1, rangeStart)
    rangeEnd = Math.min(rangeEnd, length)

    const innerRange = new Array(rangeEnd - rangeStart + 1)
        .fill(rangeStart)
        .map((n, i) => make(n + i))

    if (MAX_LENGTH_WITHOUT_ELLIPSIS < length && current > MAX_INNER_RANGE_SIDE_LENGTH) {
        list.push(make(1))
        list.push(make(null, 'startingEllipsis'))
    }
    list.push(...innerRange)
    if (MAX_LENGTH_WITHOUT_ELLIPSIS < length && current <= length - MAX_INNER_RANGE_SIDE_LENGTH) {
        list.push(make(null, 'endingEllipsis'))
        list.push(make(length))
    }

    return list.map((item) => ({
        ...item,
        selected: item.number === Number(props.current),
        inactive: !item.number || item.number === props.current,
    }))
})

const prevDisabled = computed(() => props.disabled || props.current <= 1)
const nextDisabled = computed(() => props.disabled || props.current >= props.total)

function onClick(page) {
    emit('page-change', page)
}
</script>

<template>
    <div
        :class="[blockClassName, { [`${blockClassName}--disabled`]: disabled }]"
    >
        <ArButton
            size="sm"
            variant="ghost"
            icon="chevron-left"
            :disabled="prevDisabled"
            aria-label="Previous page"
            @click="onClick(current - 1)"
        />
        <div :class="className('list')">
            <ArButton
                v-for="item of pagesRange"
                :key="item.key"
                size="sm"
                :variant="item.selected ? 'primary' : 'ghost'"
                :disabled="disabled"
                :tabindex="item.inactive ? -1 : 0"
                :class="className('item', item.inactive && 'inactive')"
                @click="onClick(item.number)"
            >
                <span :class="className('itemLabel')">{{ item.number || '…' }}</span>
            </ArButton>
        </div>
        <ArButton
            size="sm"
            variant="ghost"
            icon="chevron-right"
            :disabled="nextDisabled"
            aria-label="Next page"
            @click="onClick(current + 1)"
        />
    </div>
</template>

<style scoped>
.ArPaginationPages {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-1);
    background-color: var(--bg-neutral-t1-1-default);
    border: 1px solid var(--st-neutral-t3-3-default);
    border-radius: var(--radius-sm);
    direction: ltr;
    font-size: 14px; /* body-2-strong */
    font-weight: 450;
    line-height: 20px;
    letter-spacing: -0.28px;
}
.ArPaginationPages--disabled {
    border-color: var(--st-neutral-t3-3-disabled);
    cursor: not-allowed;
}
.ArPaginationPages__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
}
.ArPaginationPages__item {
    padding: var(--space-1);
    min-width: var(--space-8);
}
.ArPaginationPages__item--inactive {
    pointer-events: none;
}
</style>
