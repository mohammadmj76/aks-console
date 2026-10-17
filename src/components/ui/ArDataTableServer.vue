<script setup>
import { computed } from 'vue'
import { useClassName } from '../../composables/className'
import ArCheckbox from './ArCheckbox.vue'
import ArInput from './ArInput.vue'
import ArPagination from './ArPagination.vue'

/*
 * Prototype stand-in for @panel/uikit ArDataTableServer. Same skeleton as
 * the real component: a bordered container (flex column, gap space-4,
 * padding space-6) holding the header actions slot, a full-width search
 * ArInput with a prepended magnifier, the fixed-layout table, a noContent
 * row and the ArPagination footer. Cell anatomy mirrors DataTableServerCell:
 * bottom borders live on the cell (t1-4 header / t3-4 body, none on the
 * last row), the flex wrapper carries the 8px padding, vertical dividers
 * are header-only (a 1x16 t3-4 line centered at the cell boundary) and the
 * sort icon is the filled double chevron, dim unless the column is sorted.
 */
const props = defineProps({
    columns: { type: Array, required: true }, // [{ label, name, width, sortable, align }]
    items: { type: Array, default: () => [] },
    search: { type: String, default: '' },
    searchable: { type: Boolean, default: false },
    searchPlaceholder: { type: String, default: 'Search' },
    selectable: { type: Boolean, default: false },
    selectedIds: { type: Object, default: () => new Set() },
    headChecked: { type: Boolean, default: false },
    sort: { type: Object, default: null }, // { name, desc } | null
    rowlink: { type: Boolean, default: false },
    pagination: { type: Object, default: null }, // { current, total }
    noContentText: { type: String, default: 'No content available' },
})

const emit = defineEmits([
    'update:search',
    'update:sort',
    'toggle-select',
    'toggle-select-all',
    'row-click',
    'page-change',
])

const { blockClassName, className } = useClassName('ArDataTableServer')

const colspan = computed(() => props.columns.length + (props.selectable ? 1 : 0))

/* SortIcon colors per the real component: #4c4c4c for the active
   direction, dim gray otherwise (token stand-ins for #4c4c4c / #ccc) */
const SORT_ACTIVE = 'var(--fg-neutral-t1-2-default)'
const SORT_IDLE = 'var(--st-neutral-t1-4-default)'

function sortType(col) {
    if (props.sort && props.sort.name === col.name) return props.sort.desc ? 'desc' : 'asc'
    return false
}

function onClickSort(col) {
    if (!col.sortable) return
    if (props.sort && props.sort.name === col.name) {
        emit('update:sort', props.sort.desc ? null : { name: col.name, desc: true })
    } else {
        emit('update:sort', { name: col.name, desc: false })
    }
}
</script>

<template>
    <div :class="blockClassName">
        <div v-if="$slots.actions" :class="className('header')">
            <div :class="className('headerActions')">
                <slot name="actions" />
            </div>
        </div>

        <div v-if="searchable" :class="className('search')">
            <svg
                :class="className('searchIcon')"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <circle cx="11" cy="11" r="7.25" stroke="currentColor" stroke-width="1.8" />
                <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <ArInput
                :model-value="search"
                :placeholder="searchPlaceholder"
                style="--inputPadStart: 37px"
                @update:model-value="emit('update:search', $event)"
            />
        </div>

        <div :class="className('tableWrapper')">
            <table :class="className('table')">
                <thead>
                    <tr :class="className('row', ['header'])">
                        <th
                            v-if="selectable"
                            :class="className('cell')"
                            :style="{ width: '48px' }"
                            @click.stop
                        >
                            <div :class="className('cellWrapper')">
                                <ArCheckbox :model-value="headChecked" @update:model-value="emit('toggle-select-all', $event)" />
                            </div>
                        </th>
                        <th
                            v-for="col in columns"
                            :key="col.name"
                            :class="className('cell', ['header', col.sortable ? 'sortable' : ''])"
                            :style="col.width ? { width: col.width } : null"
                            @click="onClickSort(col)"
                        >
                            <div :class="className('cellWrapper', col.sortable ? 'sortable' : '')">
                                <span :class="className('cellContent')">{{ col.label }}</span>
                                <div
                                    v-if="col.sortable"
                                    :class="className('sortIconWrapper')"
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                        <path
                                            fill-rule="evenodd"
                                            clip-rule="evenodd"
                                            d="M9.99999 4.16675C10.1989 4.16675 10.3897 4.24577 10.5303 4.38642L13.8637 7.71975C14.1565 8.01265 14.1565 8.48752 13.8637 8.78041C13.5708 9.07331 13.0959 9.07331 12.803 8.78041L9.99999 5.97741L7.19699 8.78041C6.90409 9.07331 6.42922 9.07331 6.13633 8.78041C5.84343 8.48752 5.84343 8.01265 6.13633 7.71975L9.46966 4.38642C9.61031 4.24577 9.80108 4.16675 9.99999 4.16675Z"
                                            :fill="sortType(col) === 'asc' ? SORT_ACTIVE : SORT_IDLE"
                                        />
                                        <path
                                            fill-rule="evenodd"
                                            clip-rule="evenodd"
                                            d="M6.13633 11.2197C6.42922 10.9268 6.90409 10.9268 7.19699 11.2197L9.99999 14.0227L12.803 11.2197C13.0959 10.9268 13.5708 10.9268 13.8637 11.2197C14.1565 11.5126 14.1565 11.9875 13.8637 12.2804L10.5303 15.6137C10.3897 15.7544 10.1989 15.8334 9.99999 15.8334C9.80108 15.8334 9.61031 15.7544 9.46966 15.6137L6.13633 12.2804C5.84343 11.9875 5.84343 11.5126 6.13633 11.2197Z"
                                            :fill="sortType(col) === 'desc' ? SORT_ACTIVE : SORT_IDLE"
                                        />
                                    </svg>
                                </div>
                                <span :class="className('divider')" aria-hidden="true" />
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <template v-if="items.length">
                        <tr
                            v-for="(row, rowIndex) in items"
                            :key="row.id ?? rowIndex"
                            :class="className('row', rowlink ? ['link'] : [])"
                            @click="rowlink && emit('row-click', row)"
                        >
                            <td
                                v-if="selectable"
                                :class="className('cell', selectable && selectedIds.has(row.id) ? ['body', 'selected'] : ['body'])"
                                @click.stop
                            >
                                <div :class="className('cellWrapper')">
                                    <ArCheckbox
                                        :model-value="selectedIds.has(row.id)"
                                        @update:model-value="emit('toggle-select', row.id)"
                                    />
                                </div>
                            </td>
                            <td
                                v-for="col in columns"
                                :key="col.name"
                                :class="className('cell', selectable && selectedIds.has(row.id) ? ['body', 'selected'] : ['body'])"
                            >
                                <div :class="className('cellWrapper')">
                                    <span :class="className('cellContent', col.align === 'end' ? 'end' : 'start')">
                                        <slot :name="`item-${col.name}`" :item="row" :row-index="rowIndex">{{ row[col.name] }}</slot>
                                    </span>
                                </div>
                            </td>
                        </tr>
                    </template>
                    <tr v-else>
                        <td :colspan="colspan" :class="className('cell', ['body'])">
                            <div :class="className('cellWrapper')" class="no-content">
                                <slot name="noContent">
                                    <span class="text-body-2 muted">{{ noContentText }}</span>
                                </slot>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="pagination" :class="className('pagination')">
            <ArPagination :current="pagination.current" :total="pagination.total" @page-change="emit('page-change', $event)" />
        </div>
    </div>
</template>

<style scoped>
.ArDataTableServer {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6);
    background: var(--bg-neutral-t1-1-default);
    border: 1px solid var(--st-neutral-t1-4-default);
    border-radius: var(--radius-md);
}
.ArDataTableServer__header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
}
.ArDataTableServer__headerActions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}
.ArDataTableServer__search {
    position: relative;
    color: var(--fg-neutral-t1-3-default);
}
.ArDataTableServer__searchIcon {
    position: absolute;
    top: 50%;
    inset-inline-start: 13px;
    transform: translateY(-50%);
    pointer-events: none;
}
.ArDataTableServer__tableWrapper {
    overflow: auto;
}
.ArDataTableServer__table {
    width: 100%;
    min-width: 960px;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
}
.ArDataTableServer__cell {
    position: relative;
    padding: 0;
    text-align: start;
    vertical-align: middle;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: -0.28px;
    font-weight: 325;
    background: var(--bg-neutral-t1-1-default);
}
.ArDataTableServer__cell--header {
    color: var(--fg-neutral-t1-3-default);
    user-select: none;
    border-bottom: 1px solid var(--st-neutral-t1-4-default);
}
.ArDataTableServer__cell--sortable {
    cursor: pointer;
}
.ArDataTableServer__cell--body {
    color: var(--fg-neutral-t1-2-default);
    border-bottom: 1px solid var(--st-neutral-t3-4-default);
}
tbody tr:last-child .ArDataTableServer__cell--body {
    border-bottom: none;
}
.ArDataTableServer__cell--selected {
    background: var(--bg-primary-t1-1-selected);
}
.ArDataTableServer__cell:last-of-type {
    overflow: hidden;
}
.ArDataTableServer__cellWrapper {
    display: flex;
    align-items: center;
    padding: 8px;
}
.ArDataTableServer__cellWrapper--sortable {
    cursor: pointer;
}
.ArDataTableServer__cellContent {
    display: flex;
    align-items: center;
    flex-grow: 1;
    gap: 4px;
    min-width: 0;
}
.ArDataTableServer__cellContent--end {
    justify-content: end;
}
.ArDataTableServer__divider {
    position: absolute;
    inset-inline-end: -7.5px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 100%;
    z-index: 1;
    pointer-events: none;
}
.ArDataTableServer__divider::before {
    content: '';
    position: absolute;
    width: 1px;
    height: 16px;
    background: var(--st-neutral-t3-4-default);
}
.ArDataTableServer__sortIconWrapper {
    margin-inline-start: auto;
    display: flex;
}
.ArDataTableServer__sortIconWrapper svg {
    display: block;
}
.ArDataTableServer__row--link {
    cursor: pointer;
}
.ArDataTableServer__row--link:hover .ArDataTableServer__cell--body {
    background: var(--bg-neutral-t1-1-hover);
}
.no-content {
    justify-content: center;
    min-height: 96px;
}
.ArDataTableServer__pagination {
    display: flex;
    justify-content: flex-start;
}
</style>
