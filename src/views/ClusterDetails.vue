<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store, downloadKubeconfig, newerVersionAvailable } from '../store'
import { REGION, VERSIONS, CP_PLANS, FLAVOR_CATALOG, VPCS, apiEndpoint, fmtDate, flavorName, flavorSpec } from '../data'
import { genPoints, genTimes, seedHash } from '../metrics'
import MetricsChart from '../components/ui/MetricsChart.vue'
import ArButton from '../components/ui/ArButton.vue'
import ArBadge from '../components/ui/ArBadge.vue'
import ArToggle from '../components/ui/ArToggle.vue'
import ArSidePanel from '../components/ui/ArSidePanel.vue'
import DonutGauge from '../components/ui/DonutGauge.vue'
import ArProgress from '../components/ui/ArProgress.vue'
import ArSelect from '../components/ui/ArSelect.vue'
import ArEmpty from '../components/ui/ArEmpty.vue'
import ActionMenu from '../components/ui/ActionMenu.vue'
import PoolActions from '../components/PoolActions.vue'
import StatCard from '../components/ui/StatCard.vue'
import ClusterStatus from '../components/ClusterStatus.vue'

const route = useRoute()
const router = useRouter()

const cluster = computed(() => store.getCluster(route.params.id))
const vpc = computed(() => VPCS.find((v) => v.id === cluster.value?.vpcId))
const cpPlan = computed(() => CP_PLANS.find((p) => p.id === cluster.value?.cp.plan))
const nodeCount = computed(() => cluster.value?.pools.reduce((n, p) => n + p.count, 0) || 0)
/* active warnings: Warning-level O&M events + Alarm-level Kubernetes events */
const warningCount = computed(() => {
  const om = (store.events[cluster.value?.id] || []).filter((e) => e.type === 'Warning').length
  const k8s = K8S_EVENT_POOL.filter((e) => e.type === 'Alarm').length
  return om + k8s
})

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'pools', label: 'Node pools' },
  { id: 'networking', label: 'Networking' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'operations', label: 'Operations' },
  { id: 'events', label: 'Events' },
]
/* tab lives in the URL (?tab=pools) so pool pages can deep-link back to the list */
const tab = ref(tabs.some((t) => t.id === route.query.tab) ? route.query.tab : 'overview')
watch(tab, (t) => {
  if (route.query.tab !== t) router.replace({ query: { ...route.query, tab: t } })
})
watch(
  () => route.query.tab,
  (t) => {
    if (t && t !== tab.value && tabs.some((x) => x.id === t)) tab.value = t
  }
)

/* ---------------- overview: control plane nodes table ---------------- */
const monitorPanel = ref(false)
const monitorNode = ref(null)

function openMonitor(m) {
  monitorNode.value = m
  monitorPanel.value = true
}

/* deterministic mock metrics per node */
function monitorMetrics(m) {
  const seed = (m.name.length * 31 + m.az.length * 17) % 97
  const pct = (v) => Math.round(v * 100) / 100
  return {
    cpuUsed: pct(2 + (seed % 18) / 10),
    cpuLimit: m.cpu < 25 ? 4 : 8,
    memUsed: pct(4 + (seed % 25) / 8),
    memLimit: m.cpu < 25 ? 7.61 : 15.2,
    uplink: pct(30 + (seed % 500) / 10),
    downlink: pct(20 + (seed % 380) / 10),
  }
}

const masterNodes = computed(() => {
  const ha = cluster.value?.cp.ha
  const zones = REGION.zones
  const count = ha ? 3 : 1
  const seed = cluster.value?.id.length || 7
  return Array.from({ length: count }, (_, i) => ({
    name: `${cluster.value?.name || 'cluster'}-cp-${count - i}`,
    status: cluster.value?.status === 'error' && i === 0 ? 'Unreachable' : 'Running',
    az: ha ? zones[i % zones.length].name : zones[0].name,
    cpu: Math.round(((cluster.value?.usage.cpu || 18) * (0.55 + ((seed * 7 + i * 13) % 30) / 100)) * 100) / 100,
    mem: Math.round(((cluster.value?.usage.mem || 22) * (0.38 + ((seed * 5 + i * 17) % 26) / 100)) * 100) / 100,
  }))
})

/* ---------------- monitoring tab ---------------- */
const monObject = ref('')
const monPeriod = ref('Last 1 hour')
const PERIOD_HOURS = { 'Last 1 hour': 1, 'Last 6 hours': 6, 'Last 24 hours': 24 }
/* monitoring targets: every control plane and worker node, one by one */
const monObjects = computed(() => {
  const cp = masterNodes.value.map((m) => ({ value: m.name, label: m.name, group: 'Control Plane' }))
  const pools = cluster.value?.pools || []
  const suffix = pools.length > 1
  const workers = pools.flatMap((p) =>
    nodesOf(p).map((n) => ({ value: n.name, label: suffix ? `${n.name} · ${p.name}` : n.name, group: 'Worker Nodes' }))
  )
  return [...cp, ...workers]
})
/* keep the selection valid when the node list changes (or on first load) */
watch(monObjects, (opts) => {
  if (!opts.some((o) => o.value === monObject.value)) monObject.value = opts[0]?.value || ''
}, { immediate: true })

/* per-object base load derived deterministically from its name */
const monLevel = computed(() => {
  const h = (seedHash(monObject.value) % 1000) / 1000
  return { cpu: 6 + h * 8, mem: 24 + h * 10, load: 0.12 + h * 0.15, disk: 6.5 + h * 3, io: 3 + h * 6 }
})

const monTimes = computed(() => genTimes(PERIOD_HOURS[monPeriod.value] || 1, 40))

const CHART_COLORS = {
  primary: 'var(--bg-primary-t3-1-default)',
  green: 'var(--bg-success-t3-1-default)',
  amber: 'var(--bg-warning-t1-1-default)',
  blue: 'var(--bg-info-t3-1-default)',
  violet: 'var(--fg-violet-t1-1-default)',
}

/* band helper: max/min hug the avg line */
function band(s, key, avg, spreadBase, spreadVar) {
  const sp = genPoints(s + key, { base: spreadBase, variance: spreadVar, min: 0.2 })
  return {
    max: avg.map((v, i) => Math.round((v + sp[i]) * 100) / 100),
    min: avg.map((v, i) => Math.max(0, Math.round((v - sp[i] * 0.8) * 100) / 100)),
  }
}

const monCharts = computed(() => {
  const s = `${cluster.value.id}|${monObject.value}|${monPeriod.value}`
  const L = monLevel.value
  const T = monTimes.value
  const C = CHART_COLORS

  const cpu = genPoints(s + '|cpu', { base: L.cpu, variance: 2.6 })
  const cpuBand = band(s, '|cpu', cpu, 1.6, 1)
  const mem = genPoints(s + '|mem', { base: L.mem, variance: 1.1 })
  const memBand = band(s, '|mem', mem, 1, 0.5)
  const disk = genPoints(s + '|disk', { base: L.disk, variance: 0.25 })
  const diskBand = band(s, '|disk', disk, 0.25, 0.12)
  const rAvg = genPoints(s + '|ravg', { base: 1.5, variance: 0.8, min: 0 })
  const wAvg = genPoints(s + '|wavg', { base: L.io, variance: 1.6, min: 0 })
  const rMax = genPoints(s + '|rmax', { base: 4, variance: 2.5, spikes: 2, spikeAmp: 14, min: 0 }).map(
    (v, i) => Math.max(v, rAvg[i])
  )
  const wMax = genPoints(s + '|wmax', { base: L.io + 2, variance: 3, spikes: 2, spikeAmp: 18, min: 0 }).map(
    (v, i) => Math.max(v, wAvg[i])
  )
  const l1 = genPoints(s + '|l1', { base: L.load, variance: 0.05, min: 0.01 })
  const l5 = genPoints(s + '|l5', { base: L.load * 0.82, variance: 0.035, min: 0.01 })
  const l15 = genPoints(s + '|l15', { base: L.load * 0.68, variance: 0.02, min: 0.01 })

  return [
    { title: 'CPU Usage', unit: '%', series: [
      { label: 'Avg', color: C.primary, points: cpu },
      { label: 'Max', color: C.green, points: cpuBand.max },
      { label: 'Min', color: C.amber, points: cpuBand.min },
    ] },
    { title: 'Load Average', unit: '', series: [
      { label: '1 min', color: C.primary, points: l1 },
      { label: '5 min', color: C.green, points: l5 },
      { label: '15 min', color: C.amber, points: l15 },
    ] },
    { title: 'Memory Usage', unit: '%', series: [
      { label: 'Avg', color: C.primary, points: mem },
      { label: 'Max', color: C.green, points: memBand.max },
      { label: 'Min', color: C.amber, points: memBand.min },
    ] },
    { title: 'Disk Usage', unit: '%', series: [
      { label: 'Avg', color: C.primary, points: disk },
      { label: 'Max', color: C.green, points: diskBand.max },
      { label: 'Min', color: C.amber, points: diskBand.min },
    ] },
    { title: 'Disk I/O', unit: 'kB/s', series: [
      { label: 'Read Avg', color: C.blue, points: rAvg },
      { label: 'Write Avg', color: C.green, points: wAvg },
      { label: 'Read Max', color: C.amber, points: rMax },
      { label: 'Write Max', color: C.violet, points: wMax },
    ] },
  ]
})

/* ---------------- events tab ---------------- */
const evTab = ref('om')
const evQuery = ref('')
const evRange = ref('all')
/* filters: O&M has level + event name; Kubernetes events have type + object + event name */
const evLevel = ref('all')
const evOmName = ref('all')
const evType = ref('all')
const evObject = ref('all')
const evK8sName = ref('all')

function switchEvTab(t) {
  evTab.value = t
  evQuery.value = ''
  evLevel.value = 'all'
  evOmName.value = 'all'
  evType.value = 'all'
  evObject.value = 'all'
  evK8sName.value = 'all'
}
const evFiltered = computed(
  () =>
    evQuery.value.trim() !== '' ||
    evLevel.value !== 'all' ||
    evOmName.value !== 'all' ||
    evType.value !== 'all' ||
    evObject.value !== 'all' ||
    evK8sName.value !== 'all'
)
function resetEvFilters() {
  evQuery.value = ''
  evLevel.value = 'all'
  evOmName.value = 'all'
  evType.value = 'all'
  evObject.value = 'all'
  evK8sName.value = 'all'
}

/* O&M events: control-plane / platform events (mock, 30-day retention) */
const omEvents = computed(() => {
  const base = (store.events[cluster.value?.id] || []).map((e) => ({
    generated: `${e.ts}`,
    name: e.reason,
    remarks: e.msg,
    error: e.type === 'Warning' ? 'Check cluster health and node status.' : '—',
    level: e.type === 'Warning' ? 'Warning' : 'Info',
  }))
  const q = evQuery.value.trim().toLowerCase()
  return base.filter(
    (e) =>
      (evLevel.value === 'all' || e.level === evLevel.value) &&
      (evOmName.value === 'all' || e.name === evOmName.value) &&
      (!q || e.name.toLowerCase().includes(q) || e.remarks.toLowerCase().includes(q))
  )
})
const omNameOptions = computed(() => [
  { value: 'all', label: 'All Events' },
  ...[...new Set((store.events[cluster.value?.id] || []).map((e) => e.reason))].map((n) => ({ value: n, label: n })),
])

/* Kubernetes events: workload-level events (mock, 1-hour retention) */
const K8S_EVENT_POOL = [
  { object: 'Pod', obj: 'coredns-64d5...', name: 'FailedScheduling', msg: 'no nodes available to schedule pods', type: 'Alarm' },
  { object: 'Pod', obj: 'node-local-dn...', name: 'FailedScheduling', msg: 'no nodes available to schedule pods', type: 'Alarm' },
  { object: 'Pod', obj: 'everest-csi-co...', name: 'Started', msg: 'Started container driver-registrar', type: 'Normal' },
  { object: 'Pod', obj: 'node-problem...', name: 'Killing', msg: 'Stopping container node-problem-detector', type: 'Normal' },
  { object: 'Service', obj: 'metrics-serv...', name: 'SuccessfulCreate', msg: 'Created pod: metrics-server-0', type: 'Normal' },
  { object: 'Deployment', obj: 'checkout-5d8f...', name: 'ScalingReplicaSet', msg: 'Scaled up replica set to 2', type: 'Normal' },
  { object: 'Pod', obj: 'checkout-5d8f...', name: 'BackOff', msg: 'Back-off restarting failed container', type: 'Alarm' },
  { object: 'StatefulSet', obj: 'trainer-0', name: 'SuccessfulDelete', msg: 'Deleted pod: trainer-0', type: 'Normal' },
]
const k8sEvents = computed(() => {
  const q = evQuery.value.trim().toLowerCase()
  return K8S_EVENT_POOL.filter(
    (e) =>
      (evType.value === 'all' || e.type === evType.value) &&
      (evObject.value === 'all' || e.object === evObject.value) &&
      (evK8sName.value === 'all' || e.name === evK8sName.value) &&
      (!q || e.name.toLowerCase().includes(q) || e.msg.toLowerCase().includes(q) || e.obj.toLowerCase().includes(q))
  )
})
const k8sObjectOptions = [
  { value: 'all', label: 'All Objects' },
  ...[...new Set(K8S_EVENT_POOL.map((e) => e.object))].map((n) => ({ value: n, label: n })),
]
const k8sNameOptions = [
  { value: 'all', label: 'All Events' },
  ...[...new Set(K8S_EVENT_POOL.map((e) => e.name))].map((n) => ({ value: n, label: n })),
]
const evTotal = computed(() =>
  evTab.value === 'om' ? (store.events[cluster.value?.id] || []).length : K8S_EVENT_POOL.length
)

function exportExcel() {
  const rows = evTab.value === 'om' ? omEvents.value : k8sEvents.value
  const headers =
    evTab.value === 'om'
      ? ['Generated', 'Event Name', 'Event Remarks', 'Level', 'Error Message']
      : ['Object', 'Object Name', 'Type', 'Event Name', 'Kubernetes Event', 'Last Occurred']
  const body = rows.map((e) =>
    evTab.value === 'om'
      ? [e.generated, e.name, e.remarks, e.level, e.error]
      : [e.object, e.obj, e.type, e.name, e.msg, 'Oct 01, 2026 17:58:49 GMT+03:30']
  )
  const csv = [headers, ...body]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${cluster.value?.name || 'cluster'}-${evTab.value === 'om' ? 'om-events' : 'k8s-events'}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  store.toast('success', 'Export ready', `${a.download} downloaded (Excel-compatible CSV).`)
}

/* per-node mock rows */
function poolFlavorIds(pool) {
  return pool.specs?.length ? pool.specs.map((s) => s.flavorId) : [pool.flavor].filter(Boolean)
}
function nodesOf(pool) {
  const flavors = poolFlavorIds(pool)
  /* pool.id is a string — hash it so each node gets a unique, stable suffix */
  const seed = [...pool.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return Array.from({ length: pool.count }, (_, i) => ({
    name: `${pool.name}-${(seed + i * 7919).toString(36).slice(0, 5)}`,
    flavor: flavors[i % flavors.length],
    zone: pool.zones.length ? pool.zones[i % pool.zones.length] : REGION.zones[i % REGION.zones.length].id,
    ip: `172.31.${(parseInt(pool.id.slice(-1), 36) % 9) + 1}.${10 + i}`,
    cpu: Math.round((cluster.value?.usage.cpu || 10) * (0.7 + ((i * 37) % 60) / 100)),
    ready: cluster.value?.status !== 'error',
  }))
}
const expandedPools = reactive({})

/* add pool panel */
const showAddPool = ref(false)
const poolForm = reactive({ name: '', flavor: 'g6.xlarge.2', count: 2, labels: [], taints: [] })
const poolFormOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(poolForm.name) && poolForm.count >= 1)
/* deep link from the cluster list row menu: ?add=pool opens the Add node pool panel */
watch(
  () => route.query.add,
  (v) => {
    if (v === 'pool') {
      showAddPool.value = true
      router.replace({ query: { ...route.query, add: undefined } })
    }
  },
  { immediate: true }
)
const K8S_KEY = /^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/
const K8S_VAL = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/
const poolMetaOk = computed(() =>
  poolForm.labels.every((l) => {
    const [k, v] = l.split('=')
    return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v)
  }) && poolForm.taints.every((t) => K8S_KEY.test(t.key) && (t.value === '' || K8S_VAL.test(t.value)))
)
const poolLabelInput = ref('')
const poolLabelError = ref('')
function addPoolLabel(e) {
  /* read the DOM value at Enter time: the ref can lag behind while an IME
     composition is still open (Persian keyboards, mobile keyboards) */
  const raw = e && e.target ? e.target.value : poolLabelInput.value
  const v = raw.trim().replace(/\s+/g, '')
  poolLabelError.value = ''
  if (!v) {
    /* nothing typed */
  } else if (!v.includes('=')) {
    poolLabelError.value = 'Use the key=value format. Example: team=backend.'
  } else if (poolForm.labels.includes(v)) {
    poolLabelError.value = 'This label is already added.'
  } else if (poolForm.labels.length >= 20) {
    poolLabelError.value = 'You can add up to 20 labels per pool.'
  } else {
    poolForm.labels.push(v)
  }
  poolLabelInput.value = ''
  if (e && e.target) e.target.value = ''
}
/* ignore the Enter that commits an IME composition, so the text stays in
   the box and the next Enter adds the label */
function onPoolLabelKeydown(e) {
  if (e.key !== 'Enter') return
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  addPoolLabel(e)
}
function removePoolLabel(l) {
  poolForm.labels = poolForm.labels.filter((x) => x !== l)
}
function addPoolTaint() {
  poolForm.taints.push({ key: '', value: '', effect: 'NoSchedule' })
}
function removePoolTaint(t) {
  poolForm.taints = poolForm.taints.filter((x) => x !== t)
}
function submitPool() {
  if (!poolFormOk.value || !poolMetaOk.value || !cluster.value) return
  const zones = cluster.value.subnetIds.map((id) => vpc.value?.subnets.find((s) => s.id === id)?.zone).filter(Boolean)
  store.addPool(cluster.value, {
    name: poolForm.name,
    count: poolForm.count,
    specs: [{ flavorId: poolForm.flavor, zones: zones.length ? zones : REGION.zones.map((z) => z.id) }],
    zones: zones.length ? zones : REGION.zones.map((z) => z.id),
    subnets: [...cluster.value.subnetIds],
    volumeGb: poolForm.volumeGb,
    labels: [...poolForm.labels],
    taints: poolForm.taints.filter((t) => t.key).map((t) => ({ ...t })),
  })
  showAddPool.value = false
  poolForm.name = ''
  poolForm.labels = []
  poolForm.taints = []
}

/* delete cluster */
const deleteOpen = ref(false)
const confirmName = ref('')
const deleteReady = computed(() => confirmName.value === cluster.value?.name)
function doDelete() {
  const name = cluster.value.name
  store.deleteCluster(cluster.value)
  deleteOpen.value = false
  router.push('/clusters')
  store.toast('info', 'Cluster deleted', `${name} was removed.`)
}

/* upgrade */
const upgradeOpen = ref(false)
const upgradeTarget = computed(() => VERSIONS[0])
const upgradeReady = computed(() => !!cluster.value && upgradeTarget.value.patch !== cluster.value.version)
const latestPatch = VERSIONS[0].patch
/* position of the cluster's version within the supported list — index >= 2 means it is
   the oldest supported minor (2+ minors behind latest): recommend upgrading more firmly */
const verAging = computed(() => {
  const cur = VERSIONS.find((v) => v.patch === cluster.value?.version)
  return !cur || VERSIONS.indexOf(cur) >= VERSIONS.length - 1
})
const verBadge = computed(() => {
  if (!cluster.value) return ''
  if (cluster.value.status === 'upgrading') return 'Upgrading'
  if (newerVersionAvailable(cluster.value)) return 'Update available'
  return 'Up to date'
})
const verBadgeTone = computed(() => {
  if (!cluster.value) return 'neutral'
  if (cluster.value.status === 'upgrading') return 'info'
  if (newerVersionAvailable(cluster.value)) return 'warning'
  return 'success'
})
function doUpgrade() {
  store.upgradeCluster(cluster.value, upgradeTarget.value.id)
  upgradeOpen.value = false
}

/* copy endpoint — clipboard API with execCommand fallback */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    store.toast('success', 'Copied', 'Endpoint copied to clipboard.')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) store.toast('success', 'Copied', 'Endpoint copied to clipboard.')
    else store.toast('info', 'Copy failed', 'Copy the endpoint manually.')
  }
}

function menuAction(item) {
  if (item.action === 'kube') downloadKubeconfig(cluster.value)
  if (item.action === 'delete') deleteOpen.value = true
}

</script>

<template>
  <main v-if="cluster" class="page">
    <div class="crumbs">
      <router-link to="/clusters">Kubernetes</router-link>
      <span class="sep">/</span>
      <router-link to="/clusters">Clusters</router-link>
      <span class="sep">/</span>
      <span class="here">{{ cluster.name }}</span>
    </div>

    <div class="page-header">
      <div>
        <div class="title-row">
          <h1 class="text-title-2" style="margin: 0">{{ cluster.name }}</h1>
          <ClusterStatus :status="cluster.status" />
          <ArBadge variant="neutral" :text="`v${cluster.version}`" />
        </div>
        <div class="meta">
          <span class="text-body-2 muted">created {{ fmtDate(cluster.createdAt) }}</span>
        </div>
      </div>
      <div style="display: flex; gap: var(--space-3)">
        <ArButton variant="secondary" @click="router.push(`/clusters/${cluster.id}/v2`)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 3 5 5-5 5"/></svg>
          New view
        </ArButton>
        <ArButton variant="secondary" @click="downloadKubeconfig(cluster)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8m0 0 3-3M8 10 5 7M3 13h10"/></svg>
          Kubeconfig
        </ArButton>
        <ActionMenu
          :items="[
            { label: 'Download kubeconfig', action: 'kube' },
            { sep: true },
            { label: 'Delete cluster', danger: true, action: 'delete' },
          ]"
          @select="menuAction"
        />
      </div>
    </div>

    <!-- upgrading / provisioning banners -->
    <div v-if="cluster.status === 'provisioning'" class="ar-card" style="padding: var(--space-4); margin-bottom: var(--space-4)">
      <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-2)">
        <span class="text-body-2-strong">Creating cluster…</span>
        <span class="text-caption-1 muted">{{ cluster.progressLabel }} · {{ cluster.progress }}%</span>
      </div>
      <ArProgress :value="cluster.progress" />
    </div>
    <div v-else-if="cluster.status === 'upgrading'" class="banner info" style="margin-bottom: var(--space-4)">
      <svg class="spin" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 8a6 6 0 1 1-1.76-4.24"/><path d="M14 2.8V6h-3.2"/></svg>
      Upgrading control plane {{ cluster.upgrade.from }} → {{ cluster.upgrade.to }}. Worker pools drain and roll after the control plane is ready.
    </div>
    <div v-else-if="cluster.status === 'error'" class="banner warning" style="margin-bottom: var(--space-4)">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5.2v3.4M8 11.4v.2"/><circle cx="8" cy="8" r="6.2"/></svg>
      A control-plane VM is unreachable. Our SRE team has been paged — you will be notified. No action is required from you right now.
    </div>

    <nav class="ar-tabs" style="margin-bottom: var(--space-6)">
      <button v-for="t in tabs" :key="t.id" class="ar-tab" :class="{ active: tab === t.id }" @click="tab = t.id">
        {{ t.label }}
        <span v-if="t.id === 'pools'" class="count">{{ cluster.pools.length }}</span>
      </button>
    </nav>

    <!-- ================= OVERVIEW ================= -->
    <template v-if="tab === 'overview'">
      <div class="stats-grid">
        <StatCard label="WORKER NODES" :value="String(nodeCount)" :unit="`of ${cpPlan?.maxNodes} plan max`">
          <span class="text-caption-1 muted">{{ cluster.pools.length }} node pool{{ cluster.pools.length === 1 ? '' : 's' }}</span>
        </StatCard>
        <StatCard label="CONTROL PLANE API ENDPOINT">
          <div class="stat-endpoint-row">
            <span class="stat-endpoint mono" :title="apiEndpoint(cluster)">{{ apiEndpoint(cluster) }}</span>
            <button class="ar-btn ghost icon sm" title="Copy endpoint" aria-label="Copy endpoint" @click="copy(apiEndpoint(cluster))">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>
            </button>
          </div>
        </StatCard>
        <StatCard
          label="ACTIVE WARNINGS"
          :value="String(warningCount)"
          :badge="warningCount ? `${warningCount} need${warningCount === 1 ? 's' : ''} attention` : 'All clear'"
          :badge-tone="warningCount ? 'warning' : 'success'"
        >
          <button class="link-btn" @click="tab = 'events'">View events</button>
        </StatCard>
        <StatCard
          label="KUBERNETES VERSION"
          :value="'v' + cluster.version"
          :badge="verBadge"
          :badge-tone="verBadgeTone"
        >
          <template v-if="cluster.status === 'upgrading'">
            <span class="text-caption-1 muted">Upgrading to v{{ cluster.upgrade.to }} — node pools drain and roll automatically.</span>
          </template>
          <template v-else-if="newerVersionAvailable(cluster)">
            <span class="text-caption-1 muted">
              v{{ upgradeTarget.patch }} is available{{ verAging ? '. Upgrading is recommended before standard support ends.' : '.' }}
            </span>
            <button class="ver-cta" @click="upgradeOpen = true">
              Upgrade to v{{ upgradeTarget.patch }}
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
            </button>
          </template>
          <template v-else>
            <span class="text-caption-1 muted">v{{ latestPatch }} is the latest supported version.</span>
          </template>
        </StatCard>
      </div>

      <div class="charts-grid" style="grid-template-columns: 1fr">
        <div class="ar-card chart-card" style="padding: var(--space-6)">
          <div class="head">
            <div>
              <h3 class="text-title-3" style="margin: 0">Control Plane Nodes</h3>
            </div>
          </div>
          <div class="banner info" style="margin-bottom: var(--space-4); align-items: flex-start">
            <svg style="flex:none; margin-top: 2px" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
            <span>Overload control enabled. An overloaded control plane node rejects external traffic proportionally based on the overload level.</span>
          </div>
          <div class="table-scroll">
            <table class="ar-table">
              <thead>
                <tr>
                  <th>Name <span class="sort-ico">⇅</span></th>
                  <th style="width: 130px">Status</th>
                  <th style="width: 90px">AZ</th>
                  <th style="width: 200px">CPU Usage</th>
                  <th style="width: 200px">Memory Usage</th>
                  <th style="width: 90px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in masterNodes" :key="m.name">
                  <td class="cell-main">{{ m.name }}</td>
                  <td>
                    <ArBadge :variant="m.status === 'Running' ? 'success' : 'danger'" :prepend-icon="m.status === 'Running' ? 'check-circle' : 'error'" :text="m.status" />
                  </td>
                  <td class="text-body-2 muted">{{ m.az }}</td>
                  <td><ArProgress :value="m.cpu" :label="m.cpu.toFixed(2) + ' %'" /></td>
                  <td><ArProgress :value="m.mem" :label="m.mem.toFixed(2) + ' %'" /></td>
                  <td><a href="#" @click.prevent="openMonitor(m)">Monitor</a></td>
                </tr>
                <tr v-if="!masterNodes.length">
                  <td colspan="6" class="text-body-2-strong" style="text-align: center; padding: var(--space-8)">No data available.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- ================= NODE POOLS ================= -->
    <template v-if="tab === 'pools'">
      <div class="ar-section-head">
        <div>
          <h2 class="text-title-3" style="margin: 0">Node pools</h2>
          <p class="text-body-2 muted" style="margin: 0">Groups of worker nodes with the same flavor. Nodes join from the selected subnets.</p>
        </div>
        <ArButton variant="primary" @click="showAddPool = true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
          Add node pool
        </ArButton>
      </div>

      <div v-if="!cluster.pools.length" class="ar-card">
        <ArEmpty title="No node pools" desc="Every cluster needs at least one node pool to run workloads.">
          <ArButton variant="primary" sm @click="showAddPool = true">Add node pool</ArButton>
        </ArEmpty>
      </div>

      <div v-for="pool in cluster.pools" :key="pool.id" class="ar-card" style="margin-bottom: var(--space-4)">
        <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--st-neutral-t1-5-default)">
          <div style="flex: 1; min-width: 0">
            <router-link
              :to="{ name: 'pool-details', params: { id: cluster.id, poolId: pool.id } }"
              class="pool-name-link text-body-1"
            >{{ pool.name }}</router-link>
            <div class="cell-sub" style="margin-top: 2px">
              {{ poolFlavorIds(pool).map((id) => flavorName(id)).join(', ') }} ·
              {{ pool.count }} node{{ pool.count === 1 ? '' : 's' }} · ssd-g1 {{ pool.volumeGb }} GB
              · {{ pool.zones.length ? pool.zones.map((z) => REGION.zones.find((zz) => zz.id === z)?.name).join(', ') : 'all zones' }}
            </div>
            <div v-if="(pool.labels?.length || pool.taints?.length)" class="pool-meta" style="margin-top: var(--space-2)">
              <ArBadge v-for="l in pool.labels || []" :key="l" variant="neutral" :text="l" />
              <ArBadge v-for="(t, i) in pool.taints || []" :key="'t' + i" variant="warning" prepend-icon="warning" :text="`${t.key}${t.value ? '=' + t.value : ''}:${t.effect}`" />
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2)">
            <PoolActions :cluster="cluster" :pool="pool" />
          </div>
        </div>

        <div style="padding: 0 var(--space-2)">
          <table class="ar-table">
            <thead>
              <tr><th>Node</th><th>Status</th><th>Flavor</th><th>Zone</th><th>Internal IP</th><th style="width: 180px">CPU</th></tr>
            </thead>
            <tbody>
              <tr v-for="n in nodesOf(pool)" :key="n.name">
                <td class="mono">{{ n.name }}</td>
                <td>
                  <ArBadge :variant="n.ready ? 'success' : 'danger'" :prepend-icon="n.ready ? 'check-circle' : 'error'" :text="n.ready ? 'Ready' : 'NotReady'" />
                </td>
                <td class="text-body-2 muted">{{ flavorName(n.flavor) }}</td>
                <td class="text-body-2 muted">{{ REGION.zones.find((z) => z.id === n.zone)?.name }}</td>
                <td class="mono muted">{{ n.ip }}</td>
                <td><ArProgress :value="n.cpu" :label="n.cpu + '%'" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="text-caption-1 muted">
        Managed control-plane VMs are not listed here — they are operated by Arvan SRE and counted separately in the control-plane card.
      </p>
    </template>

    <!-- ================= NETWORKING ================= -->
    <template v-if="tab === 'networking'">
      <div class="charts-grid" style="grid-template-columns: 1fr 1fr">
        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">VPC & subnets</h3>
          <div class="kv">
            <div class="row"><span class="k" style="width: 120px">VPC</span><span class="v">{{ vpc?.name }} <span class="mono muted">({{ vpc?.cidr }})</span></span></div>
            <div class="row">
              <span class="k" style="width: 120px">Subnets</span>
              <span class="v" style="display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start">
                <ArBadge v-for="sid in cluster.subnetIds" :key="sid" variant="neutral" :text="`${vpc?.subnets.find((s) => s.id === sid)?.name} · ${vpc?.subnets.find((s) => s.id === sid)?.cidr} · ${REGION.zones.find((z) => z.id === vpc?.subnets.find((s) => s.id === sid)?.zone)?.name}`" />
              </span>
            </div>
          </div>
        </div>

        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">Cluster networking</h3>
          <div class="kv">
            <div class="row"><span class="k" style="width: 120px">CNI</span><span class="v">Cilium 1.15 <span class="muted">· LB-IPAM enabled</span></span></div>
            <div class="row"><span class="k" style="width: 120px">Pod CIDR</span><span class="v mono">{{ cluster.podCidr }}</span></div>
            <div class="row"><span class="k" style="width: 120px">Service CIDR</span><span class="v mono">{{ cluster.svcCidr }}</span></div>
          </div>
        </div>

        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">API server access</h3>
          <div class="kv">
            <div class="row"><span class="k" style="width: 120px">Access</span><span class="v"><ArBadge variant="success" prepend-icon="check-circle" text="Public" /></span></div>
            <div class="row"><span class="k" style="width: 120px">Endpoint</span><span class="v mono" style="font-size: 12px; display: flex; align-items: center; gap: var(--space-2)">
              {{ apiEndpoint(cluster) }}
              <button class="ar-btn ghost icon sm" title="Copy" @click="copy(apiEndpoint(cluster))">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>
              </button>
            </span></div>
          </div>
        </div>

        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">Exposing services</h3>
          <div class="kv">
            <div class="row"><span class="k" style="width: 120px">LoadBalancer</span><span class="v">Cilium LB-IPAM assigns addresses from the node subnet (zonal L2). Multi-zone L4 LB is on the roadmap.</span></div>
            <div class="row"><span class="k" style="width: 120px">Ingress / CDN</span><span class="v">Use Arvan CDN in front of an L7 Ingress, or a LoadBalancer Service for TCP/UDP.</span></div>
          </div>
        </div>
      </div>
    </template>

    <!-- ================= MONITORING ================= -->
    <template v-if="tab === 'monitoring'">
      <div class="ar-card" style="padding: var(--space-4) var(--space-6); margin-bottom: var(--space-4)">
        <div style="display: flex; gap: var(--space-4); flex-wrap: wrap">
          <div class="ar-field" style="margin: 0; width: 300px">
            <span class="ar-field-label">Select Object</span>
            <ArSelect
              v-model="monObject"
              :options="monObjects"
              searchable
              search-placeholder="Search nodes…"
              aria-label="Select Object"
            />
          </div>
          <div class="ar-field" style="margin: 0; width: 170px">
            <span class="ar-field-label">Select Period</span>
            <ArSelect v-model="monPeriod" :options="Object.keys(PERIOD_HOURS)" aria-label="Select Period" />
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-4)">
        <div v-for="ch in monCharts" :key="ch.title" class="ar-card" style="padding: var(--space-5) var(--space-6)">
          <MetricsChart :title="ch.title" :unit="ch.unit" :series="ch.series" :times="monTimes" />
        </div>
      </div>

      <p class="text-caption-1 muted" style="margin-top: var(--space-3)">
        Node metrics · sampled every 60 seconds · 30-day retention. Pick a control plane or worker node above to see its individual curves.
      </p>
    </template>

    <!-- ================= OPERATIONS (observability, Phase 2) ================= -->
    <template v-if="tab === 'operations'">
      <div class="charts-grid" style="grid-template-columns: 1fr 1fr">
        <div class="ar-card" style="padding: var(--space-6)">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-4)">
            <div>
              <h3 class="text-title-3" style="margin: 0">Metrics endpoint</h3>
              <p class="text-body-2 muted" style="margin: 2px 0 0">Prometheus-compatible scrape endpoint for this cluster.</p>
            </div>
            <ArToggle v-model="cluster.monitoring.enabled" @update:model-value="store.toast('info', 'Metrics ' + (cluster.monitoring.enabled ? 'enabled' : 'disabled'), cluster.name)" />
          </div>
          <div v-if="cluster.monitoring.enabled" class="ar-field">
            <label>Scrape URL</label>
            <div class="ar-input">
              <input readonly :value="cluster.monitoring.endpoint" class="mono" style="font-size: 12px" />
              <button class="ar-btn ghost icon sm" title="Copy" @click="copy(cluster.monitoring.endpoint)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>
              </button>
            </div>
            <span class="hint">Authenticate with an IAM token scoped to this cluster.</span>
          </div>
        </div>

        <div class="ar-card" style="padding: var(--space-6)">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-4)">
            <div>
              <h3 class="text-title-3" style="margin: 0">Control-plane backups</h3>
              <p class="text-body-2 muted" style="margin: 2px 0 0">Daily etcd snapshots with cross-AZ replication. Always on.</p>
            </div>
            <ArBadge variant="success" prepend-icon="check-circle" :text="`${cluster.etcdBackup.restorePoints} restore points`" />
          </div>
          <div class="kv">
            <div class="row"><span class="k" style="width: 120px">Schedule</span><span class="v">Daily at 02:00 (ir-tz)</span></div>
            <div class="row"><span class="k" style="width: 120px">Last run</span><span class="v">{{ cluster.etcdBackup.lastRun }}</span></div>
            <div class="row"><span class="k" style="width: 120px">Restore</span><span class="v muted">Contact support to restore a snapshot to a new cluster.</span></div>
          </div>
        </div>

        <div class="ar-card" style="padding: var(--space-6); grid-column: 1 / -1">
          <div style="display: flex; justify-content: space-between; align-items: flex-start">
            <div>
              <h3 class="text-title-3" style="margin: 0">Audit logs</h3>
              <p class="text-body-2 muted" style="margin: 2px 0 0">API-server and platform actions streamed to Cloud Logs.</p>
            </div>
            <ArBadge :variant="cluster.auditLogs ? 'success' : 'neutral'" :prepend-icon="cluster.auditLogs ? 'check-circle' : ''" :text="cluster.auditLogs ? 'Streaming' : 'Off'" />
          </div>
          <p class="text-caption-1 muted" style="margin: var(--space-3) 0 0">Audit log delivery is managed with your Cloud Logs project — see the Cloud Logs console.</p>
        </div>
      </div>
    </template>

    <!-- ================= EVENTS ================= -->
    <template v-if="tab === 'events'">
      <div class="ar-card" style="padding: var(--space-6)">
        <nav class="ar-tabs" style="margin-bottom: var(--space-5)">
          <button class="ar-tab" :class="{ active: evTab === 'om' }" @click="switchEvTab('om')">O&amp;M Events</button>
          <button class="ar-tab" :class="{ active: evTab === 'k8s' }" @click="switchEvTab('k8s')">Kubernetes Event</button>
        </nav>

        <div v-if="evTab === 'om'" class="banner info" style="margin-bottom: var(--space-4); align-items: flex-start">
          <svg style="flex:none; margin-top: 2px" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
          <span>O&amp;M events refer to control-plane events (including cluster events and node events). Events are retained for 30 days. After 30 days, data is automatically cleared. A maximum of 15 days of events can be queried.</span>
        </div>
        <div v-else class="banner info" style="margin-bottom: var(--space-4); align-items: flex-start">
          <svg style="flex:none; margin-top: 2px" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
          <span>Kubernetes events refer to cluster events involving internal resources, such as workloads, Services, and storage resources. Events will be retained for 1 hour and then automatically deleted.</span>
        </div>

        <div class="ev-toolbar">
          <template v-if="evTab === 'om'">
            <div class="ar-input" style="width: 150px; height: 34px">
              <select v-model="evRange" aria-label="Time range">
                <option value="all">All time</option>
                <option value="1d">Last 1 day</option>
                <option value="7d">Last 7 days</option>
                <option value="15d">Last 15 days</option>
              </select>
              <svg class="chev" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
            </div>
            <ArSelect
              v-model="evLevel"
              style="width: 140px"
              :options="[{ value: 'all', label: 'All Levels' }, { value: 'Warning', label: 'Warning' }, { value: 'Info', label: 'Info' }]"
              aria-label="Filter by level"
            />
            <ArSelect
              v-model="evOmName"
              style="width: 200px"
              :options="omNameOptions"
              searchable
              search-placeholder="Search events…"
              aria-label="Filter by event name"
            />
          </template>
          <template v-else>
            <ArSelect
              v-model="evType"
              style="width: 130px"
              :options="[{ value: 'all', label: 'All Types' }, { value: 'Alarm', label: 'Alarm' }, { value: 'Normal', label: 'Normal' }]"
              aria-label="Filter by type"
            />
            <ArSelect v-model="evObject" style="width: 150px" :options="k8sObjectOptions" aria-label="Filter by object" />
            <ArSelect
              v-model="evK8sName"
              style="width: 200px"
              :options="k8sNameOptions"
              searchable
              search-placeholder="Search events…"
              aria-label="Filter by event name"
            />
          </template>
          <label class="ar-input ev-search">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
            <input v-model="evQuery" type="search" placeholder="Select a property or enter a keyword." />
          </label>
          <button v-if="evFiltered" class="link-btn" @click="resetEvFilters">Reset filters</button>
          <ArButton variant="secondary" sm @click="exportExcel">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8m0 0 3-3M8 10 5 7M3 13h10"/></svg>
            Export
          </ArButton>
        </div>

        <!-- O&M events table -->
        <div v-if="evTab === 'om'" class="table-scroll">
          <table class="ar-table">
            <thead>
              <tr>
                <th>Generated <span class="sort-ico">⇅</span></th>
                <th style="width: 110px">Level</th>
                <th style="width: 200px">Event Name <span class="sort-ico">⇅</span></th>
                <th>Event Remarks <span class="sort-ico">⇅</span></th>
                <th style="width: 260px">Error Message <span class="sort-ico">⇅</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(e, i) in omEvents" :key="i">
                <td class="mono muted">{{ e.generated }}</td>
                <td><ArBadge :variant="e.level === 'Warning' ? 'warning' : 'neutral'" :prepend-icon="e.level === 'Warning' ? 'warning' : ''" :text="e.level" /></td>
                <td class="text-body-2-strong">{{ e.name }}</td>
                <td class="text-body-2 muted">{{ e.remarks }}</td>
                <td class="text-body-2" :class="e.error === '—' ? 'muted' : ''">{{ e.error }}</td>
              </tr>
              <tr v-if="!omEvents.length">
                <td colspan="5" class="text-body-2-strong" style="text-align: center; padding: var(--space-8)">No data available.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Kubernetes events table -->
        <div v-else class="table-scroll">
          <table class="ar-table">
            <thead>
              <tr>
                <th style="width: 130px">Object <span class="sort-ico">⇅</span></th>
                <th style="width: 90px">Type</th>
                <th style="width: 200px">Event Name <span class="sort-ico">⇅</span></th>
                <th>Kubernetes Event <span class="sort-ico">⇅</span></th>
                <th style="width: 220px">Last Occurred <span class="sort-ico">⇅</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(e, i) in k8sEvents" :key="i">
                <td>
                  <div class="cell-main">{{ e.object }}</div>
                  <div class="cell-sub mono">{{ e.obj }}</div>
                </td>
                <td>
                  <ArBadge :variant="e.type === 'Alarm' ? 'warning' : 'success'" :prepend-icon="e.type === 'Alarm' ? 'warning' : 'check-circle'" :text="e.type" />
                </td>
                <td class="text-body-2-strong">{{ e.name }}</td>
                <td class="text-body-2 muted">{{ e.msg }}</td>
                <td class="text-body-2 muted">Oct 01, 2026 17:58:49 GMT+03:30</td>
              </tr>
              <tr v-if="!k8sEvents.length">
                <td colspan="5" class="text-body-2-strong" style="text-align: center; padding: var(--space-8)">No data available.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="text-caption-1 muted" style="margin: var(--space-3) 0 0">
          Total Records: {{ evTab === 'om' ? omEvents.length : k8sEvents.length }}<template v-if="evFiltered"> of {{ evTotal }} (filtered)</template>
        </p>
      </div>
    </template>

    <!-- ================= NODE MONITORING PANEL ================= -->
    <ArSidePanel :open="monitorPanel" size="md" :title="`Node Monitoring ${monitorNode?.name || ''}`" :subtitle="`${cluster?.name} · ${monitorNode?.az || ''}`" @close="monitorPanel = false">
      <div v-if="monitorNode">
        <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">Monitoring Overview</h3>
        <div class="charts-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 0">
          <!-- CPU gauge -->
          <div class="ar-card" style="padding: var(--space-5)">
            <h4 class="text-body-1" style="margin: 0 0 var(--space-3)">CPU Usage</h4>
            <div class="gauge-pair">
              <div><div class="gauge-num">{{ monitorMetrics(monitorNode).cpuUsed }}</div><div class="text-caption-1 muted">cores · Available</div></div>
              <div><div class="gauge-num">{{ monitorMetrics(monitorNode).cpuLimit }}</div><div class="text-caption-1 muted">cores · Limit</div></div>
            </div>
            <DonutGauge :pct="monitorNode.cpu" label="CPU Usage" />
          </div>
          <!-- Memory gauge -->
          <div class="ar-card" style="padding: var(--space-5)">
            <h4 class="text-body-1" style="margin: 0 0 var(--space-3)">Memory Usage</h4>
            <div class="gauge-pair">
              <div><div class="gauge-num">{{ monitorMetrics(monitorNode).memUsed }}</div><div class="text-caption-1 muted">GiB · Available</div></div>
              <div><div class="gauge-num">{{ monitorMetrics(monitorNode).memLimit }}</div><div class="text-caption-1 muted">GiB · Limit</div></div>
            </div>
            <DonutGauge :pct="monitorNode.mem" label="Memory Usage" />
          </div>
          <!-- Uplink / Downlink -->
          <div class="ar-card" style="padding: var(--space-5)">
            <h4 class="text-body-1" style="margin: 0 0 var(--space-3)">Uplink Rate (BPS)</h4>
            <div class="gauge-num big">{{ monitorMetrics(monitorNode).uplink }} <span class="text-caption-1 muted">KB/s</span></div>
          </div>
          <div class="ar-card" style="padding: var(--space-5)">
            <h4 class="text-body-1" style="margin: 0 0 var(--space-3)">Downlink Rate (BPS)</h4>
            <div class="gauge-num big">{{ monitorMetrics(monitorNode).downlink }} <span class="text-caption-1 muted">KB/s</span></div>
          </div>
        </div>

        <h3 class="text-title-3" style="margin: var(--space-6) 0 var(--space-4)">Monitoring Details</h3>
        <div class="details-accordions">
          <details>
            <summary>CPU Metrics</summary>
            <div class="acc-body">
              <div class="kv">
                <div class="row"><span class="k" style="width: 180px">CPU usage (cores)</span><span class="v">{{ monitorMetrics(monitorNode).cpuUsed }} / {{ monitorMetrics(monitorNode).cpuLimit }}</span></div>
                <div class="row"><span class="k" style="width: 180px">CPU utilization</span><span class="v">{{ monitorNode.cpu }} %</span></div>
              </div>
            </div>
          </details>
          <details>
            <summary>Memory Metrics</summary>
            <div class="acc-body">
              <div class="kv">
                <div class="row"><span class="k" style="width: 180px">Memory usage (GiB)</span><span class="v">{{ monitorMetrics(monitorNode).memUsed }} / {{ monitorMetrics(monitorNode).memLimit }}</span></div>
                <div class="row"><span class="k" style="width: 180px">Memory utilization</span><span class="v">{{ monitorNode.mem }} %</span></div>
              </div>
            </div>
          </details>
          <details>
            <summary>Networking Metrics</summary>
            <div class="acc-body">
              <div class="kv">
                <div class="row"><span class="k" style="width: 180px">Uplink rate</span><span class="v">{{ monitorMetrics(monitorNode).uplink }} KB/s</span></div>
                <div class="row"><span class="k" style="width: 180px">Downlink rate</span><span class="v">{{ monitorMetrics(monitorNode).downlink }} KB/s</span></div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </ArSidePanel>

    <!-- ================= ADD NODE POOL ================= -->
    <ArSidePanel :open="showAddPool" title="Add node pool" :subtitle="cluster.name" @close="showAddPool = false">
      <div class="ar-field">
        <label>Pool name<span class="req">*</span></label>
        <div class="ar-input" :class="{ 'error-mode': poolForm.name && !/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(poolForm.name) }">
          <input v-model="poolForm.name" placeholder="e.g. worker-pool" spellcheck="false" style="text-transform: lowercase" />
        </div>
        <span class="hint">Lowercase letters, digits and dashes. 3–40 characters.</span>
      </div>

      <div class="ar-field">
        <span class="ar-field-label">Flavor<span class="req">*</span></span>
        <div class="ar-input">
          <select v-model="poolForm.flavor">
            <option v-for="f in FLAVOR_CATALOG" :key="f.id" :value="f.id">
              {{ f.id }} · {{ f.vcpu }} vCPU / {{ f.ram }} GB · {{ f.category }}
            </option>
          </select>
          <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
        </div>
      </div>

      <div style="display: flex; gap: var(--space-4)">
        <div class="ar-field">
          <label>Node count</label>
          <div class="count-input">
            <button :disabled="poolForm.count <= 1" @click="poolForm.count--">−</button>
            <input v-model.number="poolForm.count" type="number" min="1" max="20" />
            <button :disabled="poolForm.count >= 20" @click="poolForm.count++">+</button>
          </div>
        </div>
        <div class="ar-field" style="flex: 1">
          <label>Root volume (ssd-g1)</label>
          <div class="ar-input">
            <select v-model.number="poolForm.volumeGb">
              <option :value="50">50 GB</option>
              <option :value="100">100 GB</option>
              <option :value="200">200 GB</option>
            </select>
            <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
          </div>
        </div>
      </div>

      <div class="ar-field">
        <label>Node labels</label>
        <div class="tagbox">
          <ArBadge v-for="l in poolForm.labels" :key="l" variant="neutral">
            {{ l }}
            <button class="tag-x" aria-label="Remove label" @click="removePoolLabel(l)">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 4 8 8M12 4l-8 8"/></svg>
            </button>
          </ArBadge>
          <input v-model="poolLabelInput" placeholder="key=value" spellcheck="false" @input="poolLabelError = ''" @keydown="onPoolLabelKeydown" />
        </div>
        <span v-if="poolLabelError" class="error-text">{{ poolLabelError }}</span>
        <span v-else-if="poolForm.labels.length && !poolMetaOk" class="error-text">Use the key=value format: lowercase keys, values up to 63 characters.</span>
        <span v-else class="hint">Applied as Kubernetes labels to every node of this pool. Press Enter after each label.</span>
      </div>

      <div class="ar-field">
        <span class="ar-field-label">Taints</span>
        <div style="display: flex; flex-direction: column; gap: var(--space-2)">
          <div v-for="(t, i) in poolForm.taints" :key="i" style="display: flex; gap: var(--space-2)">
            <div class="ar-input" style="flex: 2" :class="{ 'error-mode': t.key && !K8S_KEY.test(t.key) }">
              <input v-model="t.key" placeholder="Key" spellcheck="false" style="text-transform: lowercase" />
            </div>
            <div class="ar-input" style="flex: 2" :class="{ 'error-mode': t.value && !K8S_VAL.test(t.value) }">
              <input v-model="t.value" placeholder="Value" spellcheck="false" />
            </div>
            <ArSelect
              class="taint-effect"
              style="width: 150px"
              v-model="t.effect"
              :options="['NoSchedule', 'PreferNoSchedule', 'NoExecute']"
              aria-label="Taint effect"
            />
            <button class="taint-x" aria-label="Remove taint" @click="removePoolTaint(t)">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 4 8 8M12 4l-8 8"/></svg>
            </button>
          </div>
          <button class="link-btn" @click="addPoolTaint">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
            Add taint
          </button>
        </div>
        <span v-if="poolForm.taints.length && !poolMetaOk" class="error-text">Taint keys must be lowercase (letters, digits, -, .). Value is optional.</span>
      </div>

      <template #footer>
        <ArButton variant="tertiary" @click="showAddPool = false">Cancel</ArButton>
        <ArButton variant="primary" :disabled="!poolFormOk || !poolMetaOk" @click="submitPool">Add pool</ArButton>
      </template>
    </ArSidePanel>

    <!-- ================= UPGRADE / DELETE CONFIRM ================= -->
    <ArSidePanel :open="upgradeOpen" title="Upgrade cluster" :subtitle="`${cluster.name} · v${cluster.version} → v${upgradeTarget.patch}`" @close="upgradeOpen = false">
      <div class="banner info">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
        The control plane rolls first (etcd stays safe), then each node pool drains and replaces its nodes one by one.
      </div>
      <div class="kv">
        <div class="row"><span class="k">Pre-checks</span><span class="v">Automatic — etcd snapshot is taken before the upgrade starts.</span></div>
        <div class="row"><span class="k">Duration</span><span class="v">Typically 15–40 minutes depending on pool sizes.</span></div>
        <div class="row"><span class="k">Workloads</span><span class="v">Rolling replacement; ensure PodDisruptionBudgets allow the drain.</span></div>
      </div>
      <template #footer>
        <ArButton variant="tertiary" @click="upgradeOpen = false">Cancel</ArButton>
        <ArButton variant="primary" :disabled="!upgradeReady" @click="doUpgrade">Start upgrade</ArButton>
      </template>
    </ArSidePanel>

    <ArSidePanel :open="deleteOpen" title="Delete cluster" :subtitle="cluster.name" @close="deleteOpen = false">
      <div class="banner error" style="margin-bottom: var(--space-4)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5.2v3.4M8 11.4v.2"/><circle cx="8" cy="8" r="6.2"/></svg>
        Deleting removes the control plane, all node pools and their volumes. This cannot be undone.
      </div>
      <div class="ar-field">
        <label>Type <strong>{{ cluster.name }}</strong> to confirm</label>
        <div class="ar-input" :class="{ 'error-mode': confirmName && !deleteReady }">
          <input v-model="confirmName" :placeholder="cluster.name" spellcheck="false" />
        </div>
      </div>
      <template #footer>
        <ArButton variant="tertiary" @click="deleteOpen = false">Cancel</ArButton>
        <ArButton variant="danger" :disabled="!deleteReady" @click="doDelete">Delete cluster</ArButton>
      </template>
    </ArSidePanel>
  </main>

  <main v-else class="page">
    <div class="ar-card">
      <ArEmpty title="Cluster not found" desc="This cluster may have been deleted.">
        <router-link to="/clusters" class="ar-btn secondary sm" style="text-decoration: none">Back to clusters</router-link>
      </ArEmpty>
    </div>
  </main>
</template>

<style scoped>
/* call-to-action under the Kubernetes version stat card — a bordered button
   reads as clickable, unlike the plain text link it replaces */
.ver-cta {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 10px;
  border: 1px solid var(--st-primary-t1-1-default);
  border-radius: var(--radius-md);
  background: var(--bg-neutral-t1-1-default);
  color: var(--fg-primary-t1-1-default);
  font: inherit; font-size: 12.5px; font-weight: 500;
  cursor: pointer; margin-top: var(--space-3);
  transition: background .15s;
}
.ver-cta:hover { background: var(--bg-primary-t2-1-default); }
.ver-cta svg { flex: none; }
</style>
