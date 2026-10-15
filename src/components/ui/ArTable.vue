<script setup>
import { useClassName } from '../../composables/className'
import ArTableRow from './ArTableRow.vue'
import ArTableCell from './ArTableCell.vue'

/*
 * Prototype stand-in for @panel/uikit ArTable.
 * Same API: columns [{label, name, align}], items, keyField, striped +
 * slots: header (override all), header-<name>, body (override all rows),
 * row (override one row), col-<name>, noContent, error, footer.
 */
defineProps({
    columns: { type: Array, default: () => [] },
    items: { type: Array, default: () => [] },
    keyField: { type: String, default: 'name' },
    striped: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    error: { type: Boolean, default: false },
})
const { blockClassName, className } = useClassName('ArTable')
</script>

<template>
    <div :class="blockClassName">
        <div :class="className('tableWrapper')">
            <table :class="className('table')">
                <thead>
                    <slot name="header">
                        <ArTableRow header>
                            <slot
                                v-for="col of columns"
                                :key="col[keyField]"
                                :name="`header-${col[keyField]}`"
                                v-bind="col"
                            >
                                <ArTableCell
                                    :key="col[keyField]"
                                    header
                                    :align="col.align"
                                >
                                    {{ col.label }}
                                </ArTableCell>
                            </slot>
                        </ArTableRow>
                    </slot>
                </thead>
                <tbody>
                    <template v-if="loading">
                        <ArTableRow
                            v-for="i of 3"
                            :key="`skeleton-${i}`"
                            :striped="striped"
                        >
                            <ArTableCell
                                v-for="(col, colIndex) of columns"
                                :key="colIndex"
                                :align="col.align"
                            >
                                <span class="ArTable__skeleton" />
                            </ArTableCell>
                        </ArTableRow>
                    </template>
                    <ArTableRow v-else-if="error">
                        <ArTableCell :colspan="columns?.length || 1">
                            <slot name="error" />
                        </ArTableCell>
                    </ArTableRow>
                    <ArTableRow v-else-if="!items.length">
                        <ArTableCell :colspan="columns?.length || 1">
                            <slot name="noContent" />
                        </ArTableCell>
                    </ArTableRow>
                    <slot
                        v-else
                        name="body"
                    >
                        <slot
                            v-for="(item, index) of items"
                            :key="item.id || index"
                            name="row"
                            v-bind="{ _index: index, ...item }"
                        >
                            <ArTableRow :key="item.id || index">
                                <slot
                                    v-for="column of columns"
                                    :key="column[keyField]"
                                    :name="`col-${column[keyField]}`"
                                    v-bind="{ _index: index, ...item }"
                                >
                                    <ArTableCell :align="column.align">
                                        {{ item[column[keyField]] }}
                                    </ArTableCell>
                                </slot>
                            </ArTableRow>
                        </slot>
                    </slot>
                </tbody>
            </table>
        </div>
        <slot name="footer" />
    </div>
</template>

<style scoped>
.ArTable {
    font-size: 14px;
    font-weight: 325;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-2-default);
}
.ArTable__tableWrapper {
    overflow-x: auto;
    padding-bottom: var(--space-1);
    border: 1px solid var(--st-neutral-t1-5-default);
    border-radius: var(--radius-md);
}
.ArTable__table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}
.ArTable__skeleton {
    display: inline-block;
    width: 80px;
    height: 14px;
    border-radius: var(--radius-sm);
    background: var(--bg-neutral-t1-4-default);
}
</style>
