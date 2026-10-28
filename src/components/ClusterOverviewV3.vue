<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArAlert, ArBadge, ArButton, ArButtonCopy, ArField, ArInput, ArLinkButton,
  ArModal, ArProductIcon, ArSection, ArSelect, ArTable, ArTableCell, ArTableRow, ArTag,
} from '../uikit'
import { CP_PLANS, REGION, VPCS } from '../data'
import { downloadKubeconfig, store } from '../store'
import NodePoolList from './NodePoolList.vue'
import ClusterOverviewMonitoring from './ClusterOverviewMonitoring.vue'

const props = defineProps({ cluster: { type: Object, required: true } })
const router = useRouter()
const emit = defineEmits(['create-pool', 'network'])
const plan = computed(() => CP_PLANS.find(p => p.id === props.cluster.cp.plan))
const vpc = computed(() => VPCS.find(v => v.id === props.cluster.vpcId))
const subnets = computed(() => (vpc.value?.subnets || []).filter(s => props.cluster.subnetIds.includes(s.id)))
const singleAz = computed(() => props.cluster.cp.distribution ? props.cluster.cp.distribution === 'single-az' : !props.cluster.cp.ha)
const zoneName = id => REGION.zones.find(z => z.id === id)?.name || id
const distribution = computed(() => singleAz.value ? `Single AZ (${zoneName(props.cluster.cp.zone || subnets.value[0]?.zone || REGION.zones[0].id)})` : 'Multi AZ')
const status = computed(() => ({ running: ['success', 'Running'], upgrading: ['info', 'Upgrading'], provisioning: ['info', 'Creating'], error: ['danger', 'Error'] })[props.cluster.status] || ['neutral', props.cluster.status])
const createdAt = computed(() => new Date(props.cluster.createdAt).toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))
const renameOpen = ref(false)
const name = ref('')
const nameError = computed(() => !/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(name.value) ? 'Use 3–40 lowercase letters, numbers or hyphens, starting with a letter and ending with a letter or number.' : store.clusters.some(c => c.id !== props.cluster.id && c.name === name.value) ? 'A cluster with this name already exists.' : '')
function openRename() { name.value = props.cluster.name; renameOpen.value = true }
function rename() { if (!nameError.value && store.renameCluster(props.cluster, name.value)) renameOpen.value = false }
const labelsOpen = ref(false)
const labelInput = ref('')
const labels = ref([])
const labelError = ref('')
function openLabels() { labels.value = [...(props.cluster.labels || [])]; labelInput.value = ''; labelError.value = ''; labelsOpen.value = true }
function addLabel() {
  const value = labelInput.value.trim()
  labelError.value = ''
  if (!value) return
  if (labels.value.includes(value)) { labelError.value = 'This label already exists.'; return }
  if (labels.value.length >= 20) { labelError.value = 'Add up to 20 labels.'; return }
  labels.value.push(value); labelInput.value = ''; labelError.value = ''
}
function saveLabels() {
  addLabel()
  if (labelError.value) return
  store.setClusterLabels(props.cluster, [...labels.value]); labelsOpen.value = false
}
const deleteOpen = ref(false)
const confirmName = ref('')
function askDelete() { confirmName.value = ''; deleteOpen.value = true }
function deleteCluster() {
  if (confirmName.value !== props.cluster.name) return
  store.deleteCluster(props.cluster); deleteOpen.value = false; router.push('/clusters')
}

const eventColumns = [
  { name: 'name', label: 'Event Name' }, { name: 'remarks', label: 'Remark' },
  { name: 'error', label: 'Error Message' }, { name: 'level', label: 'Level' },
  { name: 'generated', label: 'Date Generated' },
]
const ranges = [{ value: 'all', label: 'All Time' }, { value: '1d', label: 'Last 1 day' }, { value: '7d', label: 'Last 7 days' }]
const levels = [{ value: 'all', label: 'All Levels' }, { value: 'Info', label: 'Info' }, { value: 'Warning', label: 'Warning' }]
const range = ref(ranges[0])
const level = ref(levels[0])
const eventName = ref({ value: 'all', label: 'All Events' })
const query = ref('')
const events = computed(() => (store.events[props.cluster.id] || []).map((e) => ({
  name: e.reason, remarks: e.msg, level: e.type === 'Warning' ? 'Warning' : 'Info',
  error: e.error || '—',
  generated: e.ts,
  timestamp: e.createdAt ? new Date(e.createdAt).getTime() : null,
})))
const eventOptions = computed(() => [{ value: 'all', label: 'All Events' }, ...[...new Set(events.value.map(e => e.name))].map(value => ({ value, label: value }))])
const visibleEvents = computed(() => {
  const q = query.value.trim().toLowerCase()
  const days = range.value.value === '1d' ? 1 : 7
  return events.value.filter(e =>
    (level.value.value === 'all' || level.value.value === e.level) &&
    (eventName.value.value === 'all' || eventName.value.value === e.name) &&
    (range.value.value === 'all' || (e.timestamp !== null && e.timestamp >= Date.now() - days * 86400000)) &&
    (!q || `${e.name} ${e.remarks} ${e.error}`.toLowerCase().includes(q)),
  )
})
watch(() => props.cluster.id, () => {
  query.value = ''; range.value = ranges[0]; level.value = levels[0]; eventName.value = { value: 'all', label: 'All Events' }
  renameOpen.value = false; labelsOpen.value = false; deleteOpen.value = false
})
</script>

<template>
  <div class="overview-v3">
    <ArSection class="overview-v3__identity" content-class="overview-v3__identity-content">
      <div class="overview-v3__hero">
        <div class="overview-v3__product"><ArProductIcon product="container" type="mono" /></div>
        <div class="overview-v3__intro">
          <div class="overview-v3__name"><h1>{{ cluster.name }}</h1><ArButton variant="ghost" size="sm" icon="edit" aria-label="Rename cluster" @click="openRename" /></div>
          <p class="overview-v3__created">Date Created: <span>{{ createdAt }}</span></p>
          <ArBadge :variant="status[0]" :text="status[1]" :prepend-icon="status[0] === 'success' ? 'check-circle' : ''" />
          <div class="overview-v3__labels"><ArBadge v-for="label in cluster.labels" :key="label" variant="neutral" :text="label" /><ArButton variant="ghost" size="sm" prepend-icon="label-plus" @click="openLabels">Add Label</ArButton></div>
        </div>
        <div class="overview-v3__actions"><ArButton variant="ghost" prepend-icon="download" @click="downloadKubeconfig(cluster)">Download Kuber Config</ArButton><ArButton variant="tertiary-danger" prepend-icon="trash" @click="askDelete">Delete Cluster</ArButton></div>
      </div>
      <div class="overview-v3__details">
        <div><span>Cluster Size</span><strong>{{ plan?.name || cluster.cp.plan }}</strong></div>
        <div><span>Control Plane Distribution</span><strong>{{ distribution }}</strong></div>
        <div><span>Cluster ID</span><div class="overview-v3__copy"><strong :title="cluster.id">{{ cluster.id }}</strong><ArButtonCopy :content="cluster.id" aria-label="Copy cluster ID" /></div></div>
        <div><span>Cluster Version</span><strong>v {{ cluster.version }}</strong></div>
        <div><span>VPC</span><ArLinkButton @click="emit('network')">{{ vpc?.name || cluster.vpcId }}</ArLinkButton></div>
        <div><span>Subnet</span><ArLinkButton v-for="subnet in subnets" :key="subnet.id" @click="emit('network')">{{ subnet.name }}</ArLinkButton><strong v-if="!subnets.length">—</strong></div>
        <div><span>Pod Subnet</span><div class="overview-v3__copy"><strong>{{ cluster.podCidr }}</strong><ArButtonCopy :content="cluster.podCidr" aria-label="Copy pod subnet" /></div></div>
        <div><span>Service Subnet</span><div class="overview-v3__copy"><strong>{{ cluster.svcCidr }}</strong><ArButtonCopy :content="cluster.svcCidr" aria-label="Copy service subnet" /></div></div>
      </div>
    </ArSection>

    <NodePoolList :cluster="cluster" overview @create="emit('create-pool')" />
    <ClusterOverviewMonitoring :cluster="cluster" />

    <ArSection class="overview-v3__events" content-class="overview-v3__event-content">
      <template #header><div><h2>O&amp;M Events</h2><p>Recent control-plane and node events.</p></div></template>
      <div class="overview-v3__filter-label">Filters</div>
      <div class="overview-v3__filters">
        <ArSelect v-model="range" :options="ranges" label="label" track-by="value" :allow-empty="false" aria-label="Event time range" />
        <ArSelect v-model="level" :options="levels" label="label" track-by="value" :allow-empty="false" aria-label="Event level" />
        <ArSelect v-model="eventName" :options="eventOptions" label="label" track-by="value" :allow-empty="false" aria-label="Event name" />
      </div>
      <ArInput v-model="query" class="overview-v3__event-search" placeholder="Search events" aria-label="Search events" prepend-icon="search" />
      <div class="overview-v3__table-scroll"><ArTable :columns="eventColumns" :items="visibleEvents" class="overview-v3__event-table">
        <template #row="event"><ArTableRow><ArTableCell>{{ event.name }}</ArTableCell><ArTableCell>{{ event.remarks }}</ArTableCell><ArTableCell>{{ event.error }}</ArTableCell><ArTableCell>{{ event.level }}</ArTableCell><ArTableCell>{{ event.generated }}</ArTableCell></ArTableRow></template>
        <template #noContent>No events match your filters.</template>
      </ArTable></div>
      <p class="overview-v3__mock-note">Prototype data. Events without a recorded date are shown by time only and excluded from date filters.</p>
    </ArSection>
  </div>

  <ArModal v-model="renameOpen" title="Rename cluster">
    <ArField label="Cluster name" :error="!!nameError" :message="nameError"><ArInput v-model="name" aria-label="Cluster name" @keyup.enter="rename" /></ArField>
    <template #footer><ArButton variant="tertiary" @click="renameOpen = false">Cancel</ArButton><ArButton variant="primary" :disabled="!!nameError" @click="rename">Save name</ArButton></template>
  </ArModal>
  <ArModal v-model="labelsOpen" title="Cluster labels">
    <ArField label="Labels" :error="!!labelError" :message="labelError"><ArInput v-model="labelInput" placeholder="Confirm labels with Enter" aria-label="New cluster label" @keyup.enter="addLabel" /></ArField>
    <div class="overview-v3__edit-labels"><ArTag v-for="label in labels" :key="label" :text="label" :aria-label="`Remove ${label}`" @click="labels = labels.filter(l => l !== label)" /></div>
    <template #footer><ArButton variant="tertiary" @click="labelsOpen = false">Cancel</ArButton><ArButton variant="primary" @click="saveLabels">Save labels</ArButton></template>
  </ArModal>
  <ArModal v-model="deleteOpen" title="Delete cluster" caption="This action cannot be undone.">
    <ArAlert variant="warning">Deleting removes the control plane, all node pools and their volumes.</ArAlert>
    <ArField :label="`Type ${cluster.name} to confirm`" class="overview-v3__delete-field"><ArInput v-model="confirmName" aria-label="Confirm cluster name" /></ArField>
    <template #footer><ArButton variant="tertiary" @click="deleteOpen = false">Cancel</ArButton><ArButton variant="primary-danger" :disabled="confirmName !== cluster.name" @click="deleteCluster">Delete cluster</ArButton></template>
  </ArModal>
</template>

<style scoped>
.overview-v3 { display: flex; flex-direction: column; gap: 16px; min-width: 0; color: var(--fg-neutral-t1-2-default); }
.overview-v3 h1 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 500; overflow-wrap: anywhere; }
.overview-v3 h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.overview-v3 p { margin: 8px 0 0; font-size: 14px; line-height: 20px; color: var(--fg-neutral-t1-3-default); }
.overview-v3__hero { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
.overview-v3__product { width: 116px; height: 116px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--bg-neutral-t1-3-default); }
.overview-v3__product :deep(svg) { width: 48px; height: 48px; }
.overview-v3__intro { flex: 1; min-width: 0; }
.overview-v3__name { display: flex; align-items: center; gap: 4px; }
.overview-v3__created { margin: 4px 0 8px !important; font-size: 12px !important; }
.overview-v3__created span { margin-left: 8px; color: var(--fg-neutral-t1-2-default); }
.overview-v3__labels { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.overview-v3__actions { display: flex; gap: 16px; flex-wrap: wrap; justify-content: flex-end; }
.overview-v3__details { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px 0; padding: 12px; border: 1px solid var(--st-neutral-t1-5-default); border-radius: 8px; }
.overview-v3__details > div { min-width: 0; border-left: 1px solid var(--st-neutral-t1-5-default); padding: 0 8px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.overview-v3__details > div > span { color: var(--fg-neutral-t1-3-default); font-size: 14px; line-height: 20px; }
.overview-v3__details strong { font-size: 14px; line-height: 20px; font-weight: 500; overflow-wrap: anywhere; }
.overview-v3__copy { display: flex; align-items: center; gap: 8px; max-width: 100%; min-width: 0; }
.overview-v3__copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.overview-v3__copy > :last-child { flex: none; }
.overview-v3__details :deep(.v11-1-0-ArLinkButton) { text-align: left; text-decoration: underline; }
.overview-v3__events :deep(.v11-1-0-ArSection__section--header) { border-bottom: 1px solid var(--st-neutral-t1-5-default); }
:deep(.overview-v3__event-content) { padding: 48px; }
.overview-v3__filter-label { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
.overview-v3__filters { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.overview-v3__filters > * { width: 160px; }
.overview-v3__event-search { margin-bottom: 16px; }
.overview-v3__table-scroll { overflow-x: auto; }
.overview-v3__event-table :deep(table) { min-width: 780px; table-layout: fixed; }
.overview-v3__event-table :deep(th), .overview-v3__event-table :deep(td) { padding: 12px 8px; font-size: 14px; line-height: 20px; border-bottom: 1px solid var(--st-neutral-t1-5-default); white-space: normal; overflow-wrap: anywhere; }
.overview-v3__event-table :deep(th) { color: var(--fg-neutral-t1-3-default); font-weight: 400; position: relative; }
.overview-v3__event-table :deep(th:not(:last-child))::after { content: ''; position: absolute; right: 0; top: 50%; transform: translateY(-50%); height: 16px; border-right: 1px solid var(--st-neutral-t1-5-default); }
.overview-v3__event-table :deep(th:nth-child(1)) { width: 21%; }
.overview-v3__event-table :deep(th:nth-child(2)) { width: 29%; }
.overview-v3__event-table :deep(th:nth-child(3)) { width: 24%; }
.overview-v3__event-table :deep(th:nth-child(4)) { width: 10%; }
.overview-v3__mock-note { font-size: 12px !important; margin-top: 16px !important; }
.overview-v3__edit-labels { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.overview-v3__delete-field { margin-top: 16px; }
@media (max-width: 1200px) { .overview-v3__hero { flex-wrap: wrap; } .overview-v3__actions { width: 100%; } }
@media (max-width: 900px) { .overview-v3__details { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .overview-v3__details { grid-template-columns: minmax(0, 1fr); }
  .overview-v3__product { width: 64px; height: 64px; }
  .overview-v3__actions { justify-content: flex-start; gap: 8px; }
  :deep(.overview-v3__event-content) { padding: 24px 12px; }
  .overview-v3__filters > * { width: 100%; }
}
</style>
