<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { store, downloadKubeconfig } from '../store'
import { REGION, fmtDate } from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArCheckbox from '../components/ui/ArCheckbox.vue'
import ArSidePanel from '../components/ui/ArSidePanel.vue'
import ArEmpty from '../components/ui/ArEmpty.vue'
import ActionMenu from '../components/ui/ActionMenu.vue'
import ClusterStatus from '../components/ClusterStatus.vue'

const router = useRouter()

/* filters */
const q = ref('')
const status = ref('all')
const filtered = computed(() =>
  store.clusters.filter((c) => {
    if (q.value && !(c.name.includes(q.value.toLowerCase()) || c.id.includes(q.value.toLowerCase()))) return false
    if (status.value !== 'all' && c.status !== status.value) return false
    return true
  })
)

/* selection */
const selected = ref(new Set())
const headChecked = computed({
  get: () => filtered.value.length > 0 && filtered.value.every((c) => selected.value.has(c.id)),
  set: (v) => {
    selected.value = v ? new Set(filtered.value.map((c) => c.id)) : new Set()
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
  if (item.action === 'kube') downloadKubeconfig(c)
  if (item.action === 'delete') askDelete(c)
}

/* tags column: first tag inline, "+N" chip reveals the rest on hover (teleported popover) */
const hoverTags = ref(null)
const pop = ref({ x: 0, y: 0, flip: false })
let hideTimer = null
function showTags(e, c) {
  clearTimeout(hideTimer)
  const r = e.currentTarget.getBoundingClientRect()
  const vh = window.innerHeight || 800
  const vw = window.innerWidth || 1200
  const estH = c.labels.length * 34 + 20
  const flip = r.bottom + estH + 12 > vh && r.top > estH + 12
  pop.value = {
    x: Math.max(8, Math.min(r.left, vw - 236)),
    y: flip ? r.top - 6 : r.bottom + 6,
    flip,
  }
  hoverTags.value = c
}
function hideTags() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (hoverTags.value = null), 140)
}
function keepTags() {
  clearTimeout(hideTimer)
}
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="title-row">
          <h1 class="text-title-2" style="margin: 0">Kubernetes Cluster</h1>
          <span class="ar-badge beta pill">Beta</span>
          <span class="ar-badge neutral pill">{{ REGION.name }}</span>
        </div>
        <div class="meta"></div>
      </div>
      <router-link to="/clusters/create" class="ar-btn primary" style="text-decoration: none">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
        Create Kubernetes Cluster
      </router-link>
    </div>

    <div class="ar-section-head">
      <div>
        <h2 class="text-title-3" style="margin: 0">Clusters</h2>
        <p class="text-body-2 muted" style="margin: 0">{{ filtered.length }} of {{ store.clusters.length }} shown</p>
      </div>
      <div style="display: flex; gap: var(--space-3); align-items: center">
        <label class="ar-input" style="width: 220px; height: 34px">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
          <input v-model="q" type="search" placeholder="Filter by name or ID" />
        </label>
        <div class="ar-input" style="width: 160px; height: 34px">
          <select v-model="status" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="running">Running</option>
            <option value="provisioning">Creating</option>
            <option value="upgrading">Upgrading</option>
            <option value="error">Error</option>
          </select>
          <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
        </div>
      </div>
    </div>

    <div v-if="filtered.length" class="ar-card table-card">
      <table class="ar-table">
        <thead>
          <tr>
            <th style="width: 36px">
              <ArCheckbox v-model="headChecked" />
            </th>
            <th>Name</th>
            <th>Status</th>
            <th>Tags</th>
            <th>Version</th>
            <th>Control plane</th>
            <th>Nodes</th>
            <th>Created</th>
            <th style="width: 48px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in filtered" :key="c.id" class="rowlink" @click="router.push(`/clusters/${c.id}`)">
            <td @click.stop>
              <ArCheckbox :model-value="selected.has(c.id)" @update:model-value="toggleRow(c.id)" />
            </td>
            <td>
              <div class="cell-main">{{ c.name }}</div>
              <div class="cell-sub mono">{{ c.id }}</div>
            </td>
            <td @click.stop>
              <ClusterStatus :status="c.status" />
              <div v-if="c.upgrade" class="cell-sub">{{ c.upgrade.from }} → {{ c.upgrade.to }}</div>
            </td>
            <td @click.stop>
              <div v-if="c.labels?.length" class="tags-cell">
                <span
                  v-if="c.labels.length > 1"
                  class="tag-more"
                  @mouseenter="showTags($event, c)"
                  @mouseleave="hideTags"
                >+{{ c.labels.length - 1 }}</span>
                <span class="ar-tag mono">{{ c.labels[0] }}</span>
              </div>
              <span v-else class="text-body-2 muted">—</span>
            </td>
            <td class="text-body-2">{{ c.version }}</td>
            <td class="text-body-2">
              {{ { xsmall: 'xSmall', small: 'Small', medium: 'Medium', large: 'Large', xlarge: 'XLarge' }[c.cp.plan] }}
              <span class="muted">·</span>
              {{ c.cp.ha ? 'HA' : 'Single' }}
            </td>
            <td class="text-body-2">{{ c.pools.reduce((n, p) => n + p.count, 0) }}</td>
            <td class="text-body-2 muted">{{ fmtDate(c.createdAt) }}</td>
            <td @click.stop style="text-align: right">
              <ActionMenu
                :items="[
                  { label: 'View details', action: 'view' },
                  { label: 'Download kubeconfig', action: 'kube' },
                  { sep: true },
                  { label: 'Delete cluster', danger: true, action: 'delete' },
                ]"
                @select="(i) => menuAction(c, i)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="ar-card">
      <ArEmpty title="No clusters match" desc="Try clearing the filters, or create your first cluster to get started.">
        <router-link to="/clusters/create" class="ar-btn primary sm" style="text-decoration: none">Create Kubernetes Cluster</router-link>
      </ArEmpty>
    </div>

    <!-- delete confirmation -->
    <ArSidePanel :open="!!deleteTarget" title="Delete cluster" :subtitle="deleteTarget?.name" @close="deleteTarget = null">
      <div class="banner error" style="margin-bottom: var(--space-4)">
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

    <!-- hidden tags popover (hover on "+N") -->
    <Teleport to="body">
      <div
        v-if="hoverTags"
        class="tags-pop"
        :class="{ flip: pop.flip }"
        :style="{ top: pop.y + 'px', left: pop.x + 'px' }"
        @mouseenter="keepTags"
        @mouseleave="hideTags"
      >
        <span v-for="l in hoverTags.labels.slice(1)" :key="l" class="ar-tag mono">{{ l }}</span>
      </div>
    </Teleport>
  </main>
</template>
