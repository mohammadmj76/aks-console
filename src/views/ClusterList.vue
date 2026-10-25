<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { store, downloadKubeconfig } from '../store'
import { REGION, fmtDate } from '../data'
import ArBadge from '../components/ui/ArBadge.vue'
import ArButton from '../components/ui/ArButton.vue'
import ArDataTableServer from '../components/ui/ArDataTableServer.vue'
import ArEmpty from '../components/ui/ArEmpty.vue'
import ArIcon from '../components/ui/ArIcon.vue'
import ArRadio from '../components/ui/ArRadio.vue'
import ArRadioGroup from '../components/ui/ArRadioGroup.vue'
import ArSidePanel from '../components/ui/ArSidePanel.vue'
import ArTag from '../components/ui/ArTag.vue'
import ArSection from '../components/ui/ArSection.vue'
import ArSubHeader from '../components/ui/ArSubHeader.vue'
import RegionSelect from '../components/ui/RegionSelect.vue'
import ActionMenu from '../components/ui/ActionMenu.vue'
import ClusterStatus from '../components/ClusterStatus.vue'

const router = useRouter()

/* region switcher (vpc RegionSelect pattern; the mock store is single-region) */
const regionId = ref(REGION.id)

/* table columns — headers and content stay as before, only the shell changed */
const COLUMNS = [
  { label: 'Name', name: 'name', sortable: true },
  { label: 'Status', name: 'status' },
  { label: 'Version', name: 'version' },
  { label: 'Control plane', name: 'cp' },
  { label: 'Nodes', name: 'nodes' },
  { label: 'Created', name: 'createdAt', sortable: true },
  { label: 'Tags', name: 'tags' },
  { label: '', name: 'actions', width: '48px' },
]

/* search + advanced filter side panel */
const q = ref('')
const status = ref('all')
const filterOpen = ref(false)
const tempStatus = ref('all')
const filterCount = computed(() => (status.value !== 'all' ? 1 : 0))
function openFilters() {
  tempStatus.value = status.value
  filterOpen.value = true
}
function applyFilters() {
  status.value = tempStatus.value
  filterOpen.value = false
}

/* sorting (ArDataTableServer sortable columns) */
const sort = ref(null) // { name, desc } | null

/* refresh affordance (mock store refetches instantly) */
const refreshing = ref(false)
function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  setTimeout(() => (refreshing.value = false), 700)
}

const filtered = computed(() => {
  let rows = store.clusters.filter((c) => {
    if (q.value && !(c.name.includes(q.value.toLowerCase()) || c.id.includes(q.value.toLowerCase()))) return false
    if (status.value !== 'all' && c.status !== status.value) return false
    return true
  })
  if (sort.value) {
    const dir = sort.value.desc ? -1 : 1
    const key = sort.value.name
    rows = [...rows].sort((a, b) => {
      const va = key === 'createdAt' ? new Date(a.createdAt).getTime() : String(a[key])
      const vb = key === 'createdAt' ? new Date(b.createdAt).getTime() : String(b[key])
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir
    })
  }
  return rows
})

/* pagination (10 rows per page, client-side) */
const PER_PAGE = 10
const page = ref(1)
watch([q, status, sort, () => store.clusters.length], () => (page.value = 1))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER_PAGE)))
const paged = computed(() => filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))

/* selection */
const selected = ref(new Set())
const headChecked = computed({
  get: () => paged.value.length > 0 && paged.value.every((c) => selected.value.has(c.id)),
  set: (v) => {
    selected.value = v ? new Set(paged.value.map((c) => c.id)) : new Set()
  },
})
function toggleRow(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}

/* delete flow */
const deleteTarget = ref(null)
const confirmName = ref('')
const deleteReady = computed(() => deleteTarget.value && confirmName.value === deleteTarget.value.name)
function askDelete(c) {
  deleteTarget.value = c
  confirmName.value = ''
}
function doDelete() {
  store.deleteCluster(deleteTarget.value)
  deleteTarget.value = null
}

function menuAction(c, item) {
  if (item.action === 'view') router.push(`/clusters/${c.id}`)
  /* A/B test entry: variant B of the cluster detail page */
  if (item.action === 'view2') router.push(`/clusters/${c.id}/v2`)
  if (item.action === 'kube') downloadKubeconfig(c)
  if (item.action === 'pool') router.push({ name: 'cluster-details', params: { id: c.id }, query: { tab: 'pools', add: 'pool' } })
  if (item.action === 'label') askLabel(c)
  if (item.action === 'delete') askDelete(c)
}

/* add-label side panel (cluster-level labels) */
const labelTarget = ref(null)
const labelInput = ref('')
const labelError = ref('')
const labelList = ref([])
const LABEL_KEY = /^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/
const LABEL_VAL = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/
function askLabel(c) {
  labelTarget.value = c
  labelList.value = [...(c.labels || [])]
  labelInput.value = ''
  labelError.value = ''
}
function onLabelKeydown(e) {
  if (e.key !== 'Enter') return
  e.preventDefault?.()
  const v = labelInput.value.trim()
  if (!v) return
  const [k, val] = v.split('=')
  if (!LABEL_KEY.test(k) || val === undefined || !LABEL_VAL.test(val)) {
    labelError.value = 'Use the key=value format: lowercase keys, values up to 63 characters.'
    return
  }
  if (labelList.value.includes(v)) {
    labelError.value = 'This label is already added.'
    return
  }
  if (labelList.value.length >= 20) {
    labelError.value = 'You can add up to 20 labels.'
    return
  }
  labelList.value.push(v)
  labelInput.value = ''
  labelError.value = ''
}
function saveLabels() {
  if (labelTarget.value) store.setClusterLabels(labelTarget.value, [...labelList.value])
  labelTarget.value = null
}
</script>

<template>
  <main class="page list-page">
    <!-- page bar (ArSubHeader: product title + region selector) -->
    <ArSubHeader title="Kubernetes">
      <template #selector>
        <RegionSelect v-model="regionId" />
      </template>
    </ArSubHeader>

    <div class="list-body">
      <ArSection v-if="store.clusters.length">
        <!-- section header: title + description + create action (ArSection pattern) -->
        <template #header>
          <div class="list-head-txt">
            <div class="list-title-row">
              <h6 class="text-body-1" style="margin: 0">Cluster List</h6>
              <ArBadge variant="info" text="Beta" />
              <ArIcon
                name="info"
                size="sm"
                class="list-info"
                v-tippy="{ placement: 'top', arrow: true, content: 'All Kubernetes clusters in this region. Open a cluster to view its details, or use the row menu for quick actions.' }"
              />
            </div>
            <p class="list-desc text-body-2 muted" style="margin: 0">
              A Kubernetes cluster is a managed control plane plus worker node pools. Create, scale and upgrade your containerized workloads from here.
            </p>
          </div>
          <div class="list-head-actions">
            <router-link to="/clusters/create" class="ar-btn primary" style="text-decoration: none">
              <ArIcon name="plus" size="sm" />
              Create Kubernetes Cluster
            </router-link>
          </div>
        </template>

      <ArDataTableServer
        v-model:search="q"
        v-model:sort="sort"
        :columns="COLUMNS"
        :items="paged"
        searchable
        selectable
        search-placeholder="Search in clusters"
        :selected-ids="selected"
        :head-checked="headChecked"
        rowlink
        :pagination="{ current: page, total: totalPages }"
        @toggle-select="toggleRow"
        @toggle-select-all="headChecked = $event"
        @row-click="router.push(`/clusters/${$event.id}`)"
        @page-change="page = $event"
      >
        <template #actions>
          <ArButton variant="tertiary" icon="refresh" :loading="refreshing" aria-label="Refresh" @click="refresh" />
          <ArButton variant="tertiary" prepend-icon="filter" @click="openFilters">
            Filter
            <ArBadge v-if="filterCount" variant="neutral" size="sm" :text="filterCount" style="margin-inline-start: 8px" />
          </ArButton>
        </template>

        <template #item-name="{ item }">
          <span class="text-body-2">{{ item.name }}</span>
        </template>

        <template #item-status="{ item }">
          <div @click.stop>
            <ClusterStatus :status="item.status" />
          </div>
        </template>

        <template #item-version="{ item }">
          <span class="text-body-2">{{ item.version }}</span>
        </template>

        <template #item-cp="{ item }">
          <span class="text-body-2">
            {{ { xsmall: 'xSmall', small: 'Small', medium: 'Medium', large: 'Large', xlarge: 'XLarge' }[item.cp.plan] }}
            <span class="muted">·</span>
            {{ item.cp.ha ? 'HA' : 'Single' }}
          </span>
        </template>

        <template #item-nodes="{ item }">
          <span class="text-body-2">{{ item.pools.reduce((n, p) => n + p.count, 0) }}</span>
        </template>

        <template #item-createdAt="{ item }">
          <span class="text-body-2 muted">{{ fmtDate(item.createdAt) }}</span>
        </template>

        <template #item-tags="{ item }">
          <div v-if="item.labels?.length" class="tags-cell" @click.stop>
            <!-- panel pattern: first label inline, "+N" badge tooltips the full list -->
            <ArBadge variant="neutral" :text="item.labels[0]" />
            <ArBadge
              v-if="item.labels.length > 1"
              variant="neutral"
              :text="`+${item.labels.length - 1}`"
              v-tippy="{ placement: 'top', arrow: true, content: item.labels.join(',') }"
            />
          </div>
          <span v-else class="text-body-2 muted">—</span>
        </template>

        <template #item-actions="{ item }">
          <ActionMenu
            :items="[
              { label: 'View details', action: 'view' },
              { label: 'View details (new)', action: 'view2' },
              { label: 'Download kubeconfig', action: 'kube' },
              { label: 'Create node pool', action: 'pool' },
              { label: 'Add label', action: 'label' },
              { sep: true },
              { label: 'Delete cluster', danger: true, action: 'delete' },
            ]"
            @select="(i) => menuAction(item, i)"
          />
        </template>

        <template #noContent>
          <span class="text-body-2 muted">No clusters match the current filters.</span>
        </template>
      </ArDataTableServer>
      </ArSection>

      <ArSection v-else>
        <template #header>
          <div class="list-head-txt">
            <div class="list-title-row">
              <h6 class="text-body-1" style="margin: 0">Cluster List</h6>
              <ArBadge variant="info" text="Beta" />
            </div>
          </div>
          <div class="list-head-actions">
            <router-link to="/clusters/create" class="ar-btn primary" style="text-decoration: none">
              <ArIcon name="plus" size="sm" />
              Create Kubernetes Cluster
            </router-link>
          </div>
        </template>
        <ArEmpty title="No clusters yet" desc="Create your first cluster to get started." />
      </ArSection>
    </div>

    <!-- advanced filters (Filter button side panel) -->
    <ArSidePanel :open="filterOpen" title="Advanced filters" subtitle="Filter the cluster list" @close="filterOpen = false">
      <div class="ar-field">
        <label>Status</label>
        <ArRadioGroup v-model="tempStatus" class="filter-radios">
          <ArRadio value="all" label="All statuses" />
          <ArRadio value="running" label="Running" />
          <ArRadio value="provisioning" label="Creating" />
          <ArRadio value="upgrading" label="Upgrading" />
          <ArRadio value="error" label="Error" />
        </ArRadioGroup>
      </div>
      <template #footer>
        <ArButton variant="tertiary" @click="tempStatus = 'all'">Reset</ArButton>
        <ArButton variant="primary" @click="applyFilters">Apply</ArButton>
      </template>
    </ArSidePanel>

    <!-- add label (cluster-level; same input pattern as the create flow) -->
    <ArSidePanel :open="!!labelTarget" title="Add label" :subtitle="labelTarget?.name" @close="labelTarget = null">
      <div class="ar-field">
        <label>Labels</label>
        <div class="label-input-row">
          <div class="ArInput" :class="{ 'error-mode': labelError }">
            <input
              v-model="labelInput"
              placeholder="Confirm labels with enter"
              spellcheck="false"
              @input="labelError = ''"
              @keydown="onLabelKeydown"
            />
          </div>
          <ArButton variant="secondary" icon="plus" aria-label="Add label" @click="onLabelKeydown({ key: 'Enter' })" />
        </div>
        <span v-if="labelError" class="label-err text-caption-1-strong">{{ labelError }}</span>
        <span v-else class="label-hint text-caption-1">After typing each label, press the Enter key.</span>
        <div v-if="labelList.length" class="label-tags">
          <ArTag v-for="l in labelList" :key="l" class="mono" @click="labelList = labelList.filter((x) => x !== l)">{{ l }}</ArTag>
        </div>
      </div>
      <template #footer>
        <ArButton variant="tertiary" @click="labelTarget = null">Cancel</ArButton>
        <ArButton variant="primary" @click="saveLabels">Save</ArButton>
      </template>
    </ArSidePanel>

    <!-- delete confirmation -->
    <ArSidePanel :open="!!deleteTarget" title="Delete cluster" :subtitle="deleteTarget?.name" @close="deleteTarget = null">      <div class="banner error" style="margin-bottom: var(--space-4)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5.2v3.4M8 11.4v.2"/><circle cx="8" cy="8" r="6.2"/></svg>
        Deleting removes the control plane, all node pools and their volumes. This cannot be undone.
      </div>
      <div class="ar-field">
        <label>Type <strong>{{ deleteTarget?.name }}</strong> to confirm</label>
        <div class="ar-input" :class="{ 'error-mode': confirmName && confirmName !== deleteTarget?.name }">
          <input v-model="confirmName" :placeholder="deleteTarget?.name" spellcheck="false" />
        </div>
      </div>
      <template #footer>
        <ArButton variant="tertiary" @click="deleteTarget = null">Cancel</ArButton>
        <ArButton variant="danger" :disabled="!deleteReady" @click="doDelete">Delete cluster</ArButton>
      </template>
    </ArSidePanel>
  </main>
</template>

<style scoped>
/* the view drops .page padding: ArSubHeader spans full width (its own
   container keeps the 24px rhythm) and the body below re-adds it */
.list-page {
  max-width: none;
  padding: 0;
}
.list-body {
  max-width: 1240px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-6) var(--space-12);
  width: 100%;
}

/* ArSection #header slot: text block left, create action right */
.list-head-txt {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.list-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.list-info {
  color: var(--fg-neutral-t1-3-default);
  cursor: help;
}
.list-desc {
  max-width: 640px;
}
.list-head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}

/* advanced filter radios */
.filter-radios {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* add-label panel */
.label-err {
  display: block;
  margin-top: var(--space-2);
  color: var(--fg-error-t1-1-default);
}
.label-hint {
  display: block;
  margin-top: var(--space-2);
  color: var(--fg-neutral-t1-3-default);
}

.tags-cell {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
