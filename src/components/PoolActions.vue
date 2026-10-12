<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store } from '../store'
import { FLAVOR_CATALOG, VOLUME_PRICE_PER_GB, fmtIRR } from '../data'
import ActionMenu from './ui/ActionMenu.vue'
import ArModal from './ui/ArModal.vue'
import ArButton from './ui/ArButton.vue'

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
  { label: 'Adjust node count', action: 'resize', disabled: props.cluster.status !== 'running' },
  { label: 'Rename', action: 'rename' },
  { label: 'Edit labels', action: 'labels' },
  { sep: true },
  { label: 'Delete node pool', danger: true, disabled: props.cluster.pools.length <= 1, action: 'delete' },
])

const panel = ref('') // '' | 'resize' | 'rename' | 'labels' | 'delete'

/* ---------------- adjust node count ---------------- */
const countForm = reactive({ count: 0 })
const countOk = computed(() => Number.isInteger(countForm.count) && countForm.count >= 1 && countForm.count <= 20)
function bumpCount(d) {
  const cur = +countForm.count || 0
  countForm.count = Math.min(20, Math.max(1, cur + d))
}
function countInput(e) {
  const v = e.target.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 2)
  countForm.count = v === '' ? '' : +v
  e.target.value = countForm.count
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
  if (!countOk.value || countForm.count === props.pool.count) return
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
const labelsOk = computed(() =>
  labelsForm.list.every((l) => {
    const [k, v] = l.split('=')
    return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v)
  })
)
function addLabel() {
  const v = labelsForm.input.trim().replace(/\s+/g, '')
  if (v && v.includes('=') && !labelsForm.list.includes(v) && labelsForm.list.length < 20) labelsForm.list.push(v)
  labelsForm.input = ''
}
function removeLabel(l) {
  labelsForm.list = labelsForm.list.filter((x) => x !== l)
}
function saveLabels() {
  if (!labelsOk.value) return
  store.setPoolLabels(props.cluster, props.pool, [...labelsForm.list])
  panel.value = ''
}

/* ---------------- delete (confirm, then navigate back if on the pool page) ---------------- */
function doDelete() {
  const cid = props.cluster.id
  store.removePool(props.cluster, props.pool)
  panel.value = ''
  if (route.name === 'pool-details') router.push({ path: `/clusters/${cid}`, query: { tab: 'pools' } })
}

function onSelect(item) {
  if (item.action === 'resize') countForm.count = props.pool.count
  if (item.action === 'rename') renameForm.name = props.pool.name
  if (item.action === 'labels') {
    labelsForm.list = [...(props.pool.labels || [])]
    labelsForm.input = ''
  }
  panel.value = item.action
}
</script>

<template>
  <ActionMenu :items="items" @select="onSelect" />

  <!-- ===== Adjust node count ===== -->
  <ArModal
    :open="panel === 'resize'"
    title="Adjust node count"
    :subtitle="`${cluster.name} · ${pool.name}`"
    :width="440"
    @close="panel = ''"
  >
    <p class="text-body-2 muted" style="margin: 0">
      Nodes are added or removed manually — autoscaling is not available.
    </p>

    <div class="ar-field">
      <label>Nodes</label>
      <div class="count-input" :class="{ 'error-mode': !countOk }">
        <button :disabled="countForm.count <= 1" aria-label="Decrease node count" @click="bumpCount(-1)">−</button>
        <input :value="countForm.count" inputmode="numeric" aria-label="Node count" @input="countInput" @blur="bumpCount(0)" />
        <button :disabled="countForm.count >= 20" aria-label="Increase node count" @click="bumpCount(1)">+</button>
      </div>
      <span class="hint">1–20 nodes per pool. New nodes join from the pool's subnets; removed nodes drain their workloads first.</span>
    </div>

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
      <ArButton variant="primary" :disabled="!countOk || countForm.count === pool.count" @click="saveResize">Save changes</ArButton>
    </template>
  </ArModal>

  <!-- ===== Rename ===== -->
  <ArModal
    :open="panel === 'rename'"
    title="Rename node pool"
    :subtitle="`${cluster.name} · ${pool.name}`"
    :width="420"
    @close="panel = ''"
  >
    <div class="ar-field" style="margin: 0">
      <label>Pool name<span class="req">*</span></label>
      <div class="ar-input" :class="{ 'error-mode': renameForm.name && !renameOk }">
        <input v-model="renameForm.name" placeholder="e.g. worker-pool" spellcheck="false" style="text-transform: lowercase" @keyup.enter="saveRename" />
      </div>
      <span v-if="renameForm.name && !POOL_NAME.test(renameForm.name)" class="error-text">Lowercase letters, digits and dashes. 3–40 characters.</span>
      <span v-else-if="renameForm.name && !renameOk" class="error-text">A pool with this name already exists in this cluster.</span>
      <span v-else class="hint">Lowercase letters, digits and dashes. 3–40 characters.</span>
    </div>
    <template #footer>
      <ArButton variant="tertiary" @click="panel = ''">Cancel</ArButton>
      <ArButton variant="primary" :disabled="!renameOk || renameForm.name === pool.name" @click="saveRename">Save changes</ArButton>
    </template>
  </ArModal>

  <!-- ===== Edit labels ===== -->
  <ArModal
    :open="panel === 'labels'"
    title="Edit labels"
    :subtitle="`${cluster.name} · ${pool.name}`"
    :width="460"
    @close="panel = ''"
  >
    <div class="ar-field" style="margin: 0">
      <label>Node labels</label>
      <div class="tagbox">
        <span v-for="l in labelsForm.list" :key="l" class="ar-tag mono" style="font-size: 11px">
          {{ l }}
          <button class="tag-x" aria-label="Remove label" @click="removeLabel(l)">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 4 8 8M12 4l-8 8"/></svg>
          </button>
        </span>
        <input v-model="labelsForm.input" placeholder="key=value" spellcheck="false" @keydown.enter.prevent="addLabel" />
      </div>
      <span v-if="labelsForm.list.length && !labelsOk" class="error-text">Use key=value — lowercase keys (letters, digits, -, .), values up to 63 characters.</span>
      <span v-else class="hint">Applied as Kubernetes labels to every node of this pool. Press Enter after each label. Up to 20.</span>
    </div>
    <template #footer>
      <ArButton variant="tertiary" @click="panel = ''">Cancel</ArButton>
      <ArButton variant="primary" :disabled="!labelsOk" @click="saveLabels">Save changes</ArButton>
    </template>
  </ArModal>

  <!-- ===== Delete confirm ===== -->
  <ArModal
    :open="panel === 'delete'"
    title="Delete node pool"
    :subtitle="`${cluster.name} · ${pool.name}`"
    :width="420"
    @close="panel = ''"
  >
    <div class="banner error" style="margin: 0">
      <svg style="flex: none" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5.2v3.4M8 11.4v.2"/><circle cx="8" cy="8" r="6.2"/></svg>
      <span>Deleting this pool removes its {{ pool.count }} node{{ pool.count === 1 ? '' : 's' }} and their root volumes. Workloads running on these nodes are evicted. This cannot be undone.</span>
    </div>
    <template #footer>
      <ArButton variant="tertiary" @click="panel = ''">Cancel</ArButton>
      <ArButton variant="danger" @click="doDelete">Delete node pool</ArButton>
    </template>
  </ArModal>
</template>

<style scoped>
.rs-cost {
  display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  background: var(--bg-neutral-t1-4-default);
  border-radius: var(--radius-md);
}
.rs-k { font-size: 12px; color: var(--fg-neutral-t1-3-default); }
.rs-nums { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
.rs-v { font-size: 20px; font-weight: 450; color: var(--fg-neutral-t1-1-default); }
.rs-unit { font-size: 13px; font-weight: 325; color: var(--fg-neutral-t1-3-default); }
.rs-sub { font-size: 12.5px; color: var(--fg-neutral-t1-3-default); }
.rs-plan { font-size: 13px; color: var(--fg-neutral-t1-2-default); }
/* the modal body is a flex column, which blockifies and stretches the
   inline-flex .count-input — pin it to its natural width (matches the
   compact node-count control on the pool cards) */
.count-input { width: fit-content; }
.count-input.error-mode { border-color: var(--bg-error-t1-1-default); }
</style>
