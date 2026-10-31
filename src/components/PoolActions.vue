<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store } from '../store'
import { FLAVOR_CATALOG, VOLUME_PRICE_PER_GB, fmtIRR } from '../data'
import { ArAlert, ArButton, ArButtonMenu, ArField, ArIcon, ArInput, ArModal, ArTag, ArTooltip } from '../uikit'

/*
 * The node-pool "…" menu and its management panels (adjust node count /
 * rename / edit labels / delete). Shared by the cluster page pool cards and
 * the pool details page. Pools are fixed-size — nodes are added or removed
 * manually; there is no autoscaler in the current product scope.
 */
const props = defineProps({
  cluster: { type: Object, required: true },
  pool: { type: Object, required: true },
})
const route = useRoute()
const router = useRouter()

const items = computed(() => [
  { items: [
    { id: 'resize', title: 'Adjust node count', disabled: props.cluster.status !== 'running' },
    { id: 'rename', title: 'Rename' },
    { id: 'labels', title: 'Edit labels' },
  ] },
  { items: [{ id: 'delete', title: 'Delete node pool', variant: 'delete', disabled: props.cluster.pools.length <= 1 }] },
])

const panel = ref('') // '' | 'resize' | 'rename' | 'labels' | 'delete'
const panelOpen = (name) => computed({ get: () => panel.value === name, set: (open) => { if (!open && panel.value === name) panel.value = '' } })
const resizeOpen = panelOpen('resize')
const renameOpen = panelOpen('rename')
const labelsOpen = panelOpen('labels')
const deleteOpen = panelOpen('delete')

/* ---------------- adjust node count ---------------- */
const countForm = reactive({ count: 0 })
const countOk = computed(() => Number.isInteger(countForm.count) && countForm.count >= 1 && countForm.count <= 20)
function bumpCount(d) {
  const cur = +countForm.count || 0
  countForm.count = Math.min(20, Math.max(1, cur + d))
}
function countInput(value) {
  const v = String(value).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 2)
  countForm.count = v === '' ? '' : +v
}
const poolFlavors = computed(() =>
  (props.pool.specs || []).map((s) => FLAVOR_CATALOG.find((f) => f.id === s.flavorId)).filter(Boolean)
)
const planLine = computed(() => {
  const fs = poolFlavors.value
  if (!fs.length) return 'Flavor not set'
  return `${fs.map((f) => f.id).join(' + ')} · ${fs[0].vcpu} vCPU / ${fs[0].ram} GB`
})
/* live cost of the whole pool at the entered count (nodes + root volumes) */
const poolPrice = computed(() => {
  const c = +countForm.count || 0
  const fs = poolFlavors.value
  if (!fs.length || !c) return { hourly: 0, monthly: 0 }
  const avg = fs.reduce((s, f) => s + f.pricePerHour, 0) / fs.length
  const monthly = Math.round(avg * 730) * c + VOLUME_PRICE_PER_GB * (props.pool.volumeGb || 50) * c
  return { hourly: Math.max(1_000, Math.round(monthly / 730 / 1_000) * 1_000), monthly }
})
function saveResize() {
  if (props.cluster.status !== 'running' || !countOk.value || countForm.count === props.pool.count) return
  store.resizePool(props.cluster, props.pool, countForm.count)
  panel.value = ''
}

/* ---------------- rename ---------------- */
const POOL_NAME = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/
const renameForm = reactive({ name: '' })
const renameOk = computed(
  () =>
    POOL_NAME.test(renameForm.name) &&
    !props.cluster.pools.some((p) => p.id !== props.pool.id && p.name === renameForm.name)
)
function saveRename() {
  if (!renameOk.value || renameForm.name === props.pool.name) return
  store.renamePool(props.cluster, props.pool, renameForm.name)
  panel.value = ''
}

/* ---------------- edit labels ---------------- */
const K8S_KEY = /^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/
const K8S_VAL = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/
const labelsForm = reactive({ list: [], input: '' })
const labelError = ref('')
function validLabel(label) {
  const parts = label.split('=')
  return parts.length === 2 && K8S_KEY.test(parts[0]) && K8S_VAL.test(parts[1]) && parts[1].length <= 63
}
const labelsOk = computed(() => labelsForm.list.every(validLabel))
watch(() => labelsForm.input, () => { labelError.value = '' })
function addLabel() {
  const value = labelsForm.input.trim()
  labelError.value = ''
  if (!value) return
  if (!validLabel(value)) { labelError.value = 'Use key=value with a lowercase key, no spaces and a value of up to 63 characters.'; return }
  if (labelsForm.list.some(label => label.split('=')[0] === value.split('=')[0])) { labelError.value = 'A label with this key already exists. Remove it before adding a replacement.'; return }
  if (labelsForm.list.length >= 20) { labelError.value = 'Add up to 20 labels.'; return }
  labelsForm.list.push(value)
  labelsForm.input = ''
}
function removeLabel(l) {
  labelsForm.list = labelsForm.list.filter((x) => x !== l)
  labelError.value = ''
}
function saveLabels() {
  addLabel()
  if (labelError.value || !labelsOk.value) return
  store.setPoolLabels(props.cluster, props.pool, [...labelsForm.list])
  panel.value = ''
}

/* ---------------- delete (confirm, then navigate back if on the pool page) ---------------- */
function doDelete() {
  if (props.cluster.pools.length <= 1) return
  const cid = props.cluster.id
  store.removePool(props.cluster, props.pool)
  panel.value = ''
  if (route.name === 'pool-details') router.push({ path: `/clusters/${cid}`, query: { tab: 'pools' } })
}

function onSelect(item) {
  if (item.disabled || (item.id === 'resize' && props.cluster.status !== 'running') || (item.id === 'delete' && props.cluster.pools.length <= 1)) return
  if (item.id === 'resize') countForm.count = props.pool.count
  if (item.id === 'rename') renameForm.name = props.pool.name
  if (item.id === 'labels') {
    labelsForm.list = [...(props.pool.labels || [])]
    labelsForm.input = ''
    labelError.value = ''
  }
  panel.value = item.id
}
</script>

<template>
  <ArTooltip :content="`Manage ${pool.name}${cluster.status !== 'running' ? '. Node count can be adjusted when the cluster is running.' : ''}${cluster.pools.length <= 1 ? '. Keep at least one node pool.' : ''}`">
    <ArButtonMenu class="pool-actions" variant="ghost" :items="items" menu-position="bottom-end" @item-clicked="onSelect">
      <ArIcon name="ellipsis" /><span class="pool-actions__sr-only">Actions for {{ pool.name }}</span>
    </ArButtonMenu>
  </ArTooltip>

  <!-- ===== Adjust node count ===== -->
  <ArModal
    v-model="resizeOpen"
    title="Adjust node count"
    :caption="`${cluster.name} · ${pool.name}`"
  >
    <p class="text-body-2 muted" style="margin: 0">
      Nodes are added or removed manually — autoscaling is not available.
    </p>

    <ArField class="pool-actions__field" label="Nodes" :error="!countOk" message="1–20 nodes per pool. New nodes join from the pool's subnets; removed nodes drain their workloads first.">
      <div class="pool-actions__count">
        <ArButton variant="secondary" icon="minus" :disabled="countForm.count <= 1" aria-label="Decrease node count" @click="bumpCount(-1)" />
        <ArInput :model-value="countForm.count" inputmode="numeric" aria-label="Node count" @update:model-value="countInput" @focusout="bumpCount(0)" />
        <ArButton variant="secondary" icon="plus" :disabled="countForm.count >= 20" aria-label="Increase node count" @click="bumpCount(1)" />
      </div>
    </ArField>

    <div class="rs-cost">
      <span class="rs-k">Estimated pool cost at {{ countForm.count || '…' }} node{{ countForm.count === 1 ? '' : 's' }}</span>
      <div class="rs-nums">
        <span class="rs-v">{{ poolPrice.hourly ? fmtIRR(poolPrice.hourly) : '—' }}<span class="rs-unit"> IRR/hour</span></span>
        <span class="rs-sub">{{ poolPrice.monthly ? fmtIRR(poolPrice.monthly) + ' IRR/month' : '' }}</span>
      </div>
      <span class="rs-plan">{{ planLine }} · ssd-g1 {{ pool.volumeGb }} GB root volume</span>
    </div>

    <template #footer>
      <ArButton variant="tertiary" @click="panel = ''">Cancel</ArButton>
      <ArButton variant="primary" :disabled="cluster.status !== 'running' || !countOk || countForm.count === pool.count" @click="saveResize">Save changes</ArButton>
    </template>
  </ArModal>

  <!-- ===== Rename ===== -->
  <ArModal
    v-model="renameOpen"
    title="Rename node pool"
    :caption="`${cluster.name} · ${pool.name}`"
  >
    <ArField label="Pool name" required :error="Boolean(renameForm.name) && !renameOk" :message="POOL_NAME.test(renameForm.name) && !renameOk ? 'A pool with this name already exists in this cluster.' : 'Lowercase letters, digits and dashes. 3–40 characters.'">
      <ArInput v-model="renameForm.name" aria-label="Pool name" placeholder="e.g. worker-pool" spellcheck="false" @keyup.enter="saveRename" />
    </ArField>
    <template #footer>
      <ArButton variant="tertiary" @click="panel = ''">Cancel</ArButton>
      <ArButton variant="primary" :disabled="!renameOk || renameForm.name === pool.name" @click="saveRename">Save changes</ArButton>
    </template>
  </ArModal>

  <!-- ===== Edit labels ===== -->
  <ArModal
    v-model="labelsOpen"
    title="Edit labels"
    :caption="`${cluster.name} · ${pool.name}`"
  >
    <ArField label="Node labels" :error="!!labelError || !labelsOk" :message="labelError || (!labelsOk ? 'Use key=value with lowercase keys and values up to 63 characters.' : 'Applied to every node. Press Enter to add a key=value label, or save it directly. Up to 20 labels.')">
      <ArInput v-model="labelsForm.input" placeholder="key=value" aria-label="Node label" spellcheck="false" @keydown.enter.prevent="addLabel" />
      <div class="pool-actions__tags">
        <ArTag v-for="label in labelsForm.list" :key="label" :aria-label="`Remove ${label}`" @click="removeLabel(label)">{{ label }}</ArTag>
      </div>
    </ArField>
    <template #footer>
      <ArButton variant="tertiary" @click="panel = ''">Cancel</ArButton>
      <ArButton variant="primary" :disabled="!labelsOk" @click="saveLabels">Save changes</ArButton>
    </template>
  </ArModal>

  <!-- ===== Delete confirm ===== -->
  <ArModal
    v-model="deleteOpen"
    title="Delete node pool"
    :caption="`${cluster.name} · ${pool.name}`"
  >
    <ArAlert type="danger" icon="warning" :description="`Deleting this pool removes its ${pool.count} nodes and their root volumes. Workloads running on these nodes are evicted. This cannot be undone.`" />
    <template #footer>
      <ArButton variant="tertiary" @click="panel = ''">Cancel</ArButton>
      <ArButton variant="primary-danger" @click="doDelete">Delete node pool</ArButton>
    </template>
  </ArModal>
</template>

<style scoped>
.rs-cost {
  display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  background: var(--bg-neutral-t1-4-default);
  border-radius: var(--radius-sm);
}
.rs-k { font-size: 12px; color: var(--fg-neutral-t1-3-default); }
.rs-nums { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
.rs-v { font-size: 20px; font-weight: 450; color: var(--fg-neutral-t1-1-default); }
.rs-unit { font-size: 13px; font-weight: 325; color: var(--fg-neutral-t1-3-default); }
.rs-sub { font-size: 12.5px; color: var(--fg-neutral-t1-3-default); }
.rs-plan { font-size: 13px; color: var(--fg-neutral-t1-2-default); }
.pool-actions :deep(.v11-1-0-ArButton) { padding: 0; width: 32px; height: 32px; }
.pool-actions :deep(.v11-1-0-ArButton__icon) { display: none; }
.pool-actions :deep(.v11-1-0-ArButton__content) { margin: 0; }
.pool-actions__sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.pool-actions__field { margin: 16px 0; }
.pool-actions__count { display: flex; gap: 8px; width: 200px; }
.pool-actions__count > :nth-child(2) { flex: 1; min-width: 0; }
.pool-actions__tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
</style>
