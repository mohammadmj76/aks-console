<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { REGIONS } from '../../data'
import ArBadge from './ArBadge.vue'
import ArIcon from './ArIcon.vue'

/*
 * Prototype stand-in for the vpc-mfe RegionSelect (c-vpc-RegionSelect):
 * a 240x40 trigger (flag + region name + chevron that flips when open)
 * opening a dropdown grouped by country — caption-1 group label, region
 * rows with flag + name + gray code and AZ ArBadges, hairline separators
 * between groups. Only enabled regions are selectable; disabled ones
 * dim to opacity .4 (the "New" badge stays visible).
 */
const props = defineProps({
    modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const root = ref(null)

const COUNTRY_BY_FLAG = { ir: 'Iran', de: 'Europe', fr: 'France' }

const groups = computed(() => {
    const map = new Map()
    for (const region of REGIONS) {
        const label = COUNTRY_BY_FLAG[region.flag] || 'Other'
        if (!map.has(label)) map.set(label, { label, items: [] })
        map.get(label).items.push(region)
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
})

const current = computed(() => REGIONS.find((r) => r.id === props.modelValue) || REGIONS[0])

function pick(region) {
    if (!region.enabled) return
    emit('update:modelValue', region.id)
    open.value = false
}

function onDocClick(e) {
    if (root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
    <div ref="root" class="region-select">
        <button type="button" class="rs-input" :class="{ open }" @click="open = !open">
            <span class="flag" :class="current.flag" />
            <span class="rs-name">{{ current.name }}</span>
            <ArIcon name="chevron-down" size="sm" class="rs-chevron" :class="{ flip: open }" />
        </button>

        <div v-if="open" class="rs-modal">
            <template v-for="(group, gi) in groups" :key="group.label">
                <div class="rs-group-label">{{ group.label }}</div>
                <button
                    v-for="region in group.items"
                    :key="region.id"
                    type="button"
                    class="rs-item"
                    :class="{ selected: region.id === modelValue, disabled: !region.enabled }"
                    @click="pick(region)"
                >
                    <span class="rs-item-head">
                        <span class="flag" :class="region.flag" />
                        <span class="rs-item-name">{{ region.name }}</span>
                        <span class="rs-item-code">{{ region.id }}</span>
                    </span>
                    <span class="rs-item-zones">
                        <ArBadge v-for="zone in region.zones" :key="zone" variant="neutral" size="sm" :text="zone" />
                        <ArBadge v-if="region.badge" variant="primary" size="sm" :text="region.badge" />
                    </span>
                </button>
                <hr v-if="gi < groups.length - 1" class="rs-hr" />
            </template>
        </div>
    </div>
</template>

<style scoped>
.region-select {
    position: relative;
    width: 240px;
}
.rs-input {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    height: 40px;
    padding: var(--space-2);
    background: var(--bg-neutral-t1-1-default);
    border: 1px solid var(--st-neutral-t1-4-default);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: start;
    transition: background-color 0.15s;
}
.rs-input:hover,
.rs-input.open {
    background: var(--bg-neutral-t1-1-hover);
}
.rs-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-2-default);
}
.rs-chevron {
    flex: none;
    color: var(--fg-neutral-t1-3-default);
    transition: transform 0.15s;
}
.rs-chevron.flip {
    transform: rotate(180deg);
}
.rs-modal {
    position: absolute;
    top: 44px;
    inset-inline-start: 0;
    width: 100%;
    min-width: 264px;
    z-index: 70;
    padding: var(--space-2);
    background: var(--bg-neutral-t1-1-default);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.14);
}
.rs-group-label {
    padding: 4px 8px;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: -0.24px;
    color: var(--fg-neutral-t1-3-default);
}
.rs-item {
    display: block;
    width: 100%;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: start;
    transition: background-color 0.15s;
}
.rs-item:hover,
.rs-item.selected {
    background: var(--bg-neutral-t1-1-hover);
}
.rs-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.rs-item.disabled:hover {
    background: none;
}
.rs-item-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}
.rs-item-name {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: -0.28px;
    color: var(--fg-neutral-t1-2-default);
}
.rs-item-code {
    font-size: 12px;
    line-height: 16px;
    letter-spacing: -0.24px;
    color: var(--fg-neutral-t1-3-default);
}
.rs-item-zones {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}
.rs-hr {
    border: none;
    border-top: 1px solid var(--st-neutral-t1-5-default);
    margin: var(--space-1) 0;
}
</style>
