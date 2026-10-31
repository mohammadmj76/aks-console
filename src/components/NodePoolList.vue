<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArBadge, ArButton, ArButtonMenu, ArCheckbox, ArInput, ArLinkButton, ArModal, ArSection, ArTable, ArTableCell, ArTableRow, ArTooltip } from '../uikit'
import { FLAVOR_CATALOG, REGION, flavorName } from '../data'
import { store } from '../store'
import PoolActions from './PoolActions.vue'

const props = defineProps({
  cluster: { type: Object, required: true },
  overview: { type: Boolean, default: false },
})
const emit = defineEmits(['create'])
const router = useRouter()

const query = ref('')
const selectedIds = ref([])
const expandedIds = ref(new Set(props.cluster.pools?.slice(0, 1).map((p) => p.id) || []))
const groupActionOpen = ref(false)
const refreshPending = ref(false)

const columns = [
  { name: 'select', label: '' },
  { name: 'index', label: '' },
  { name: 'expand', label: '' },
  { name: 'name', label: 'Name' },
  { name: 'nodes', label: 'Node' },
  { name: 'actions', label: '' },
]
const nodeColumns = [
  { name: 'node', label: 'Node' },
  { name: 'ip', label: 'Internal IP' },
  { name: 'az', label: 'AZ' },
  { name: 'volume', label: 'Root Volume' },
  { name: 'status', label: 'Status' },
]

const poolFlavorIds = (pool) => pool.specs?.length ? pool.specs.map((s) => s.flavorId) : [pool.flavor].filter(Boolean)
const flavorFor = (pool) => FLAVOR_CATALOG.find((f) => f.id === poolFlavorIds(pool)[0])
const flavorText = (pool) => poolFlavorIds(pool).map((id) => flavorName(id)).join(', ') || '—'
const zoneText = (id) => REGION.zones.find((z) => z.id === id)?.name || id
function nodesOf(pool) {
  const flavors = poolFlavorIds(pool)
  const flavor = flavorFor(pool)
  const seed = [...pool.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return Array.from({ length: pool.count }, (_, i) => {
    return {
      name: `${pool.name}-${(seed + i * 7919).toString(36).slice(0, 5)}`,
      ip: `172.31.${(parseInt(pool.id.slice(-1), 36) % 9) + 1}.${10 + i}`,
      zone: pool.zones?.length ? pool.zones[i % pool.zones.length] : REGION.zones[i % REGION.zones.length].id,
      ready: ['running', 'upgrading'].includes(props.cluster.status),
      status: props.cluster.status === 'provisioning' ? 'Creating' : ['running', 'upgrading'].includes(props.cluster.status) ? 'Ready' : 'NotReady',
      flavor: flavor?.id || flavors[i % Math.max(1, flavors.length)] || '—',
    }
  })
}
const filteredPools = computed(() => {
  const text = query.value.trim().toLowerCase()
  if (!text) return props.cluster.pools || []
  return (props.cluster.pools || []).filter((p) => `${p.name} ${flavorText(p)}`.toLowerCase().includes(text))
})
const allVisibleSelected = computed(() => filteredPools.value.length > 0 && filteredPools.value.every((p) => selectedIds.value.includes(p.id)))
const someVisibleSelected = computed(() => !allVisibleSelected.value && filteredPools.value.some((p) => selectedIds.value.includes(p.id)))
const selectedPools = computed(() => (props.cluster.pools || []).filter((p) => selectedIds.value.includes(p.id)))
const canDeleteSelected = computed(() => selectedPools.value.length > 0 && props.cluster.pools.length - selectedPools.value.length >= 1)
const hiddenSelectedCount = computed(() => selectedPools.value.filter(p => !filteredPools.value.some(visible => visible.id === p.id)).length)
const selectedNodeCount = computed(() => selectedPools.value.reduce((sum, pool) => sum + pool.count, 0))
const groupActionHint = computed(() => !selectedPools.value.length ? 'Select node pools to use group actions.' : !canDeleteSelected.value ? 'Keep at least one node pool. Deselect a pool to enable deletion.' : `Actions apply to all ${selectedPools.value.length} selected node pools, including those hidden by search.`)
const groupItems = computed(() => [
  { items: [{ id: 'delete', title: 'Delete selected node pools', variant: 'delete', disabled: !canDeleteSelected.value }] },
])
watch(() => props.cluster.id, () => {
  query.value = ''
  selectedIds.value = []
  expandedIds.value = new Set(props.cluster.pools?.slice(0, 1).map((p) => p.id) || [])
  groupActionOpen.value = false
})
watch(() => props.cluster.pools, (pools) => {
  const valid = new Set((pools || []).map((p) => p.id))
  selectedIds.value = selectedIds.value.filter((id) => valid.has(id))
  expandedIds.value = new Set([...expandedIds.value].filter((id) => valid.has(id)))
}, { deep: true })
function isExpanded(id) { return expandedIds.value.has(id) }
function toggleExpanded(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}
function toggleSelected(id) {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((x) => x !== id) : [...selectedIds.value, id]
}
function toggleAll() {
  const ids = filteredPools.value.map((p) => p.id)
  selectedIds.value = allVisibleSelected.value
    ? selectedIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds.value, ...ids])]
}
function openPool(pool) {
  router.push({ name: 'pool-details', params: { id: props.cluster.id, poolId: pool.id } })
}
function refresh() {
  refreshPending.value = true
  window.setTimeout(() => {
    refreshPending.value = false
    store.toast('info', 'Node pools refreshed', 'Showing the current prototype node-pool catalog.')
  }, 250)
}
function onGroupAction(item) {
  if (item.id === 'delete' && canDeleteSelected.value) groupActionOpen.value = true
}
function deleteSelected() {
  if (!canDeleteSelected.value) return
  for (const pool of selectedPools.value) store.removePool(props.cluster, pool)
  selectedIds.value = []
  groupActionOpen.value = false
}
</script>

<template>
  <ArSection class="node-pool-list" :class="{ 'node-pool-list--overview': overview }" content-class="node-pool-list__content">
    <template #header>
      <div class="node-pool-list__heading">
        <div>
          <h2>Node Pool</h2>
          <p>Expand a pool to see its worker nodes.</p>
        </div>
        <ArButton :variant="overview ? 'secondary' : 'primary'" prepend-icon="plus" @click="emit('create')">Create Node Pool</ArButton>
      </div>
    </template>
    <div class="node-pool-list__panel">
      <div class="node-pool-list__toolbar">
        <ArTooltip content="Reload the prototype node-pool catalog"><ArButton variant="tertiary" icon="refresh" aria-label="Refresh node pools" :loading="refreshPending" @click="refresh" /></ArTooltip>
        <ArTooltip :content="groupActionHint"><ArButtonMenu variant="tertiary" label="Group Action" :items="groupItems" menu-position="bottom-end" @item-clicked="onGroupAction" /></ArTooltip>
      </div>
      <div v-if="selectedPools.length" class="node-pool-list__selection" role="status">
        <span>{{ selectedPools.length }} pool{{ selectedPools.length === 1 ? '' : 's' }} selected · {{ selectedNodeCount }} worker nodes</span>
        <span v-if="hiddenSelectedCount">{{ hiddenSelectedCount }} hidden by search</span>
        <ArButton variant="ghost" size="sm" @click="selectedIds = []">Clear selection</ArButton>
      </div>
      <ArInput v-model="query" class="node-pool-list__search" placeholder="Search in node pools" aria-label="Search in node pools" prepend-icon="search" />
      <div class="node-pool-list__table-wrap" tabindex="0" role="region" aria-label="Node pools table">
        <ArTable :columns="columns" :items="filteredPools" class="node-pool-list__table">
          <template #header-select>
            <ArTableCell header><ArCheckbox class="node-pool-list__checkbox" :model-value="allVisibleSelected" :indeterminate="someVisibleSelected" label="Select all visible node pools" @update:model-value="toggleAll" /></ArTableCell>
          </template>
          <template #body>
            <template v-for="(pool, index) in filteredPools" :key="pool.id">
            <ArTableRow class="node-pool-list__pool-row" :class="{ 'is-expanded': isExpanded(pool.id) }">
              <ArTableCell><ArCheckbox class="node-pool-list__checkbox" :model-value="selectedIds.includes(pool.id)" :label="`Select ${pool.name}`" @update:model-value="toggleSelected(pool.id)" /></ArTableCell>
              <ArTableCell><span class="node-pool-list__index">{{ index + 1 }}</span></ArTableCell>
              <ArTableCell><ArButton variant="ghost" :icon="isExpanded(pool.id) ? 'chevron-up' : 'chevron-down'" :aria-label="`${isExpanded(pool.id) ? 'Collapse' : 'Expand'} ${pool.name}`" :aria-expanded="isExpanded(pool.id)" :aria-controls="`pool-workers-${pool.id}`" @click="toggleExpanded(pool.id)" /></ArTableCell>
              <ArTableCell><ArLinkButton class="node-pool-list__name" @click="openPool(pool)">{{ pool.name }}</ArLinkButton></ArTableCell>
              <ArTableCell>{{ pool.count }}</ArTableCell>
              <ArTableCell><PoolActions :cluster="cluster" :pool="pool" /></ArTableCell>
            </ArTableRow>
            <ArTableRow v-if="isExpanded(pool.id)" :id="`pool-workers-${pool.id}`" class="node-pool-list__nodes-row">
              <ArTableCell :colspan="columns.length" class="node-pool-list__nodes-cell">
                <ArTable :columns="nodeColumns" :items="nodesOf(pool)" class="node-pool-list__nodes-table">
                  <template #row="node">
                    <ArTableRow>
                      <ArTableCell class="node-pool-list__node-name">{{ node.name }}</ArTableCell>
                      <ArTableCell>{{ node.ip }}</ArTableCell>
                      <ArTableCell>{{ zoneText(node.zone) }}</ArTableCell>
                      <ArTableCell>{{ pool.volumeGb }} GB</ArTableCell>
                      <ArTableCell><ArBadge :variant="node.ready ? 'success' : node.status === 'Creating' ? 'info' : 'danger'" :text="node.status" :prepend-icon="node.ready ? 'check-circle' : ''" /></ArTableCell>
                    </ArTableRow>
                  </template>
                </ArTable>
              </ArTableCell>
            </ArTableRow>
            </template>
          </template>
          <template #noContent>
            <span>{{ query.trim() ? 'No node pools match your search.' : 'No node pools yet.' }}</span>
          </template>
        </ArTable>
      </div>
      <p v-if="cluster.pools.length && !overview" class="node-pool-list__footnote">Worker nodes are listed under their node pool.</p>
    </div>
  </ArSection>

  <ArModal v-model="groupActionOpen" title="Delete selected node pools" caption="This action cannot be undone.">
    <p>Delete {{ selectedPools.length }} node pool{{ selectedPools.length === 1 ? '' : 's' }} and {{ selectedNodeCount }} worker nodes? Their root volumes will also be removed.</p>
    <ul><li v-for="pool in selectedPools" :key="pool.id">{{ pool.name }} ({{ pool.count }} nodes)</li></ul>
    <template #footer>
      <ArButton variant="tertiary" @click="groupActionOpen = false">Cancel</ArButton>
      <ArButton variant="primary-danger" :disabled="!canDeleteSelected" @click="deleteSelected">Delete node pools</ArButton>
    </template>
  </ArModal>
</template>

<style scoped>
.node-pool-list { min-width: 0; }
:deep(.node-pool-list__content) { padding: 0 24px 24px; }
.node-pool-list__heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; width: 100%; }
.node-pool-list__heading h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 450; }
.node-pool-list__heading p { margin: 4px 0 0; color: var(--fg-neutral-t1-3-default); font-size: 14px; line-height: 20px; }
.node-pool-list__panel { padding: 24px; border: 1px solid var(--st-neutral-t1-5-default); border-radius: 8px; background: var(--bg-neutral-t1-1-default); }
.node-pool-list__toolbar { display: flex; justify-content: flex-end; gap: 16px; margin-bottom: 16px; }
.node-pool-list__selection { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; min-height: 32px; margin: -4px 0 12px; color: var(--fg-neutral-t1-3-default); font-size: 12px; }
.node-pool-list__selection > :nth-child(2) { color: var(--fg-neutral-t1-2-default); }
.node-pool-list__selection :deep(button) { margin-inline-start: auto; }
.node-pool-list__search { width: 100%; margin-bottom: 16px; }
.node-pool-list__checkbox :deep(label) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.node-pool-list__table-wrap:focus-visible { outline: 2px solid var(--st-primary-t1-1-default); outline-offset: 4px; }
.node-pool-list__table-wrap { overflow-x: auto; }
:deep(.node-pool-list__table > .v11-1-0-ArTable__tableWrapper),
:deep(.node-pool-list__nodes-table > .v11-1-0-ArTable__tableWrapper) { padding-bottom: 0; overflow: visible; }
:deep(.node-pool-list__table > .v11-1-0-ArTable__tableWrapper > table) { min-width: 680px; width: 100%; table-layout: fixed; }
:deep(.node-pool-list__table > .v11-1-0-ArTable__tableWrapper > table > thead > tr > th:nth-child(1)) { width: 44px; }
:deep(.node-pool-list__table > .v11-1-0-ArTable__tableWrapper > table > thead > tr > th:nth-child(2)) { width: 40px; }
:deep(.node-pool-list__table > .v11-1-0-ArTable__tableWrapper > table > thead > tr > th:nth-child(3)) { width: 48px; }
:deep(.node-pool-list__table > .v11-1-0-ArTable__tableWrapper > table > thead > tr > th:nth-child(5)) { width: 140px; }
:deep(.node-pool-list__table > .v11-1-0-ArTable__tableWrapper > table > thead > tr > th:nth-child(6)) { width: 56px; }
:deep(.node-pool-list__table .v11-1-0-ArTableCell) { padding: 8px 12px; font-size: 14px; line-height: 20px; color: var(--fg-neutral-t1-2-default); border-bottom: 1px solid var(--st-neutral-t1-5-default); }
:deep(.node-pool-list__table .v11-1-0-ArTableCell--header) { position: relative; height: 48px; font-weight: 400; color: var(--fg-neutral-t1-3-default); }
:deep(.node-pool-list__table > .v11-1-0-ArTable__tableWrapper > table > thead > tr > th:nth-child(4))::after,
:deep(.node-pool-list__nodes-table th:not(:last-child))::after { content: ''; position: absolute; right: 0; top: 50%; width: 1px; height: 16px; transform: translateY(-50%); background: var(--st-neutral-t1-5-default); }
.node-pool-list__pool-row { cursor: default; background: var(--bg-neutral-t1-1-default); }
.node-pool-list__pool-row :deep(.v11-1-0-ArTableCell) { height: 56px; }
.node-pool-list__pool-row :deep(.v11-1-0-ArButton--ghost) { width: 32px; height: 32px; min-width: 32px; padding: 0; color: var(--fg-neutral-t1-2-default); }
.node-pool-list__index { display: inline-flex; min-width: 24px; height: 24px; padding: 0 6px; align-items: center; justify-content: center; border-radius: 6px; background: var(--bg-neutral-t1-3-default); color: var(--fg-neutral-t1-2-default); }
.node-pool-list__name { font-weight: 450; color: var(--fg-neutral-t1-2-default); }
.node-pool-list__name:hover,
.node-pool-list__name:focus-visible { color: var(--fg-neutral-t1-1-default); text-decoration: underline; text-underline-offset: 3px; }
:deep(.node-pool-list__table .node-pool-list__nodes-cell) { height: auto; padding: 0; border-bottom: 0; }
.node-pool-list__nodes-table { width: 100%; }
:deep(.node-pool-list__nodes-table .v11-1-0-ArTable__table) { width: 100%; table-layout: fixed; }
:deep(.node-pool-list__nodes-table .v11-1-0-ArTableRow),
:deep(.node-pool-list__nodes-table .v11-1-0-ArTableCell) { background: var(--bg-neutral-t1-2-default); }
:deep(.node-pool-list__nodes-table .v11-1-0-ArTableCell) { height: 48px; padding: 8px 16px; }
:deep(.node-pool-list__nodes-table th:first-child) { width: 28%; }
.node-pool-list__node-name { font-weight: 400; }
.node-pool-list__footnote { margin: 16px 0 0; color: var(--fg-neutral-t1-3-default); font-size: 12px; line-height: 16px; }
.node-pool-list--overview :deep(.v11-1-0-ArSection__section--header) { border-bottom: 1px solid var(--st-neutral-t1-5-default); }
.node-pool-list--overview :deep(.node-pool-list__content) { padding: 48px; }
.node-pool-list--overview .node-pool-list__panel { padding: 0; border: 0; border-radius: 0; }
.node-pool-list--overview .node-pool-list__pool-row :deep(.v11-1-0-ArTableCell) { height: 40px; }
.node-pool-list--overview :deep(.node-pool-list__nodes-table .v11-1-0-ArTableCell) { height: 40px; }
@media (max-width: 640px) {
  .node-pool-list--overview :deep(.node-pool-list__content) { padding: 24px 12px; }
  .node-pool-list--overview .node-pool-list__panel { padding: 0; }
  .node-pool-list__panel { padding: 12px; }
  :deep(.node-pool-list__content) { padding-inline: 12px; }
  .node-pool-list__heading { align-items: flex-start; flex-direction: column; }
  .node-pool-list__heading > :last-child { width: 100%; }
  .node-pool-list__heading > :last-child :deep(button) { width: 100%; }
}
</style>
