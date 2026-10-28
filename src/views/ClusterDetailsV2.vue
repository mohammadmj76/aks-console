<script setup>
/* Variant B of the cluster detail page (A/B test against ClusterDetails.vue,
   which stays untouched). IA designed from a cross-provider study (AWS EKS,
   GCP GKE, DigitalOcean DOKS, Scaleway Kapsule) plus the customer interviews:
   - grouped LEFT section nav instead of top tabs
   - an Overview answering the operator's first questions in order:
       1. is it healthy?      → control plane / warnings / version + upgrade
       2. what does it hold?  → capacity per pool with utilization
       3. what does it cost?  → monthly cost per pool (no big-3 console shows this)
       4. how do I connect?   → endpoint + kubeconfig
       5. what just happened? → O&M event list with the Events section's filters
   - trends and full tables live in their own sections, not on the overview
   Route: /clusters/:id/v2 (deep link; the cluster list row menu links here) */
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store, downloadKubeconfig, newerVersionAvailable } from '../store'
import { REGION, VERSIONS, CP_PLANS, FLAVOR_CATALOG, VPCS, VOLUME_PRICE_PER_GB, apiEndpoint, fmtDate, fmtIRR, flavorName, monthlyPrice } from '../data'
import { genPoints, genTimes, seedHash } from '../metrics'
import MetricsChart from '../components/ui/MetricsChart.vue'
import ArDataTableServer from '../components/ui/ArDataTableServer.vue'
import ArBadge from '../components/ui/ArBadge.vue'
import ArButton from '../components/ui/ArButton.vue'
import { ArButton as UIKitButton, ArSubHeader as UIKitSubHeader } from '../uikit'
import ArToggle from '../components/ui/ArToggle.vue'
import ArSidePanel from '../components/ui/ArSidePanel.vue'
import DonutGauge from '../components/ui/DonutGauge.vue'
import ArProgress from '../components/ui/ArProgress.vue'
import ArSelect from '../components/ui/ArSelect.vue'
import ArSection from '../components/ui/ArSection.vue'
import ArEmpty from '../components/ui/ArEmpty.vue'
import ActionMenu from '../components/ui/ActionMenu.vue'
import PoolActions from '../components/PoolActions.vue'
import NodePoolList from '../components/NodePoolList.vue'
import ClusterOverviewV3 from '../components/ClusterOverviewV3.vue'
import ClusterStatus from '../components/ClusterStatus.vue'

const props = defineProps({ overviewDesign: { type: String, default: 'v2' } })
const newOverview = computed(() => props.overviewDesign === 'v3')
const route = useRoute()
const router = useRouter()

const cluster = computed(() => store.getCluster(route.params.id))
const vpc = computed(() => VPCS.find((v) => v.id === cluster.value?.vpcId))
const cpPlan = computed(() => CP_PLANS.find((p) => p.id === cluster.value?.cp.plan))
/* resource-ID style display: hash-like 24-hex string, stable per cluster */
const clusterUid = computed(() => {
  let h = seedHash(cluster.value?.id || '') >>> 0
  let out = ''
  for (let i = 0; i < 6; i++) {
    h = (Math.imul(h, 16777619) ^ (h >>> 7)) >>> 0
    out += h.toString(16).padStart(8, '0').slice(0, 4)
  }
  return out
})

/* Kubernetes events mock is defined here so the warning counter can use it */
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
/* active warnings: Warning-level O&M events + Alarm-level Kubernetes events */
const warningCount = computed(() => {
  const om = (store.events[cluster.value?.id] || []).filter((e) => e.type === 'Warning').length
  const k8s = K8S_EVENT_POOL.filter((e) => e.type === 'Alarm').length
  return om + k8s
})

/* ---------------- left section nav (groups mirror the CCE sidebar) ---------------- */
/* section nav as collapsible groups — mirrors the real console aside menu
   (chevron + label rows like "Server" / "Network"), same texts as before */
const NAV_GROUPS = [
  {
    label: 'Resources',
    items: [
      { id: 'pools', label: 'Node Pools', count: computed(() => cluster.value?.pools.length || 0) },
      { id: 'storage', label: 'Storage' },
    ],
  },
  {
    label: 'Cluster',
    items: [
      { id: 'networking', label: 'Networking' },
      { id: 'monitoring', label: 'Monitoring' },
      { id: 'operations', label: 'Operations' },
      { id: 'events', label: 'Events', warn: true },
    ],
  },
]
const sections = [
  { id: 'overview', label: 'Overview' },
  ...NAV_GROUPS.flatMap((g) => g.items),
]
const openGroups = reactive({ Resources: true, Cluster: true })
const toggleGroup = (label) => { openGroups[label] = !openGroups[label] }
/* section lives in the URL (?tab=pools) — same key as variant A so the
   cluster-list deep links (?tab=pools&add=pool) work for both variants */
const tab = ref(sections.some((s) => s.id && s.id === route.query.tab) ? route.query.tab : 'overview')
watch(tab, (t) => {
  if (route.query.tab !== t) router.replace({ query: { ...route.query, tab: t } })
})
watch(
  () => route.query.tab,
  (t) => {
    if (t && t !== tab.value && sections.some((x) => x.id === t)) tab.value = t
  }
)

/* ---------------- overview: monitoring overview (cluster-wide charts) ----------------
   Mirrors the real panel's Monitoring Overview block: CPU %, Memory %,
   uplink and downlink rates over the selected window. Averages across all
   worker nodes derive from cluster.usage; the trend is what tells you
   whether you are heading for a scaling decision. */
const CHART_COLORS = {
  primary: 'var(--bg-primary-t3-1-default)',
  green: 'var(--bg-success-t3-1-default)',
  amber: 'var(--bg-warning-t1-1-default)',
  blue: 'var(--bg-info-t3-1-default)',
  violet: 'var(--fg-violet-t1-1-default)',
}
const ovPeriod = ref('Last 6 hours')
const ovTimes = computed(() => genTimes(PERIOD_HOURS[ovPeriod.value] || 6, 40))
const ovCharts = computed(() => {
  const u = cluster.value?.usage || { cpu: 0, mem: 0 }
  const s = `${cluster.value?.id}|ov|${ovPeriod.value}`
  const h = (seedHash(cluster.value?.id || '') % 1000) / 1000
  /* per-node averages sit well below the pool-aggregate percentage */
  const cpuAvg = Math.max(3, u.cpu * (0.5 + h * 0.3))
  const memAvg = Math.max(8, u.mem * (0.55 + h * 0.25))
  const up = 120 + h * 260
  const down = 240 + h * 520
  const C = CHART_COLORS
  const band = (key, pts, sp, min) => {
    const b = genPoints(s + key, { base: sp, variance: sp * 0.4, min: min || 0.1 })
    return {
      max: pts.map((v, i) => Math.round((v + b[i]) * 100) / 100),
      min: pts.map((v, i) => Math.max(min || 0.1, Math.round((v - b[i] * 0.8) * 100) / 100)),
    }
  }
  const cpu = genPoints(s + '|cpu', { base: cpuAvg, variance: 2.4 })
  const cpuB = band('|cpuB', cpu, 1.5)
  const mem = genPoints(s + '|mem', { base: memAvg, variance: 1 })
  const memB = band('|memB', mem, 0.8)
  const upAvg = genPoints(s + '|up', { base: up, variance: up * 0.35, min: 2 })
  const downAvg = genPoints(s + '|down', { base: down, variance: down * 0.3, min: 4 })
  /* current values = last point of the avg series */
  const cur = (pts) => pts[pts.length - 1]
  return [
    {
      key: 'cpu', label: 'CPU Usage', unit: '%', value: cur(cpu),
      series: [
        { label: 'Avg', color: C.primary, points: cpu },
        { label: 'Max', color: C.green, points: cpuB.max },
        { label: 'Min', color: C.amber, points: cpuB.min },
      ],
    },
    {
      key: 'mem', label: 'Memory Usage', unit: '%', value: cur(mem),
      series: [
        { label: 'Avg', color: C.primary, points: mem },
        { label: 'Max', color: C.green, points: memB.max },
        { label: 'Min', color: C.amber, points: memB.min },
      ],
    },
    {
      key: 'up', label: 'Uplink Rate', unit: 'kB/s', value: cur(upAvg),
      series: [{ label: 'Uplink', color: C.blue, points: upAvg }],
    },
    {
      key: 'down', label: 'Downlink Rate', unit: 'kB/s', value: cur(downAvg),
      series: [{ label: 'Downlink', color: C.violet, points: downAvg }],
    },
  ]
})

/* ---------------- control plane health (overview) ---------------- */
/* Health strip shows the at-a-glance signal; the full replica table with the
   Monitor drilldown sits at the end of the overview for per-node inspection. */
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
const cpHealthy = computed(() => masterNodes.value.every((m) => m.status === 'Running'))

/* per-node monitor side panel (opened from the Control plane nodes table) */
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

/* ---------------- capacity & cost per pool (overview) ----------------
   GKE frames this as allocation vs utilization, DOKS as a capacity block;
   we add what none of them show: what each pool costs this month. */
const POOL_COLUMNS = [
  { label: 'Node pool', name: 'name', width: '28%' },
  { label: 'Nodes', name: 'nodes', width: '11%' },
  { label: 'Zones', name: 'zones', width: '20%' },
  { label: 'CPU', name: 'cpu', width: '17%' },
  { label: 'Memory', name: 'mem', width: '17%' },
  { label: '', name: 'actions', width: '7%' },
]
const poolRows = computed(() =>
  (cluster.value?.pools || []).map((p) => {
    const h = (seedHash(p.id) % 1000) / 1000
    const u = cluster.value?.usage || { cpu: 10, mem: 10 }
    return {
      id: p.id,
      name: p.name,
      pool: p,
      nodes: p.count,
      zones: p.zones.length ? p.zones.map((z) => REGION.zones.find((zz) => zz.id === z)?.name).join(', ') : 'All zones',
      cpu: Math.min(96, Math.max(2, Math.round(u.cpu * (0.55 + h * 0.9)))),
      mem: Math.min(96, Math.max(2, Math.round(u.mem * (0.55 + ((h * 7) % 1) * 0.9)))),
    }
  })
)
/* one pool's monthly cost (node hours + root volume) for the pools tab */
function poolCost(p) {
  const c = monthlyPrice({ cp: { plan: cluster.value?.cp.plan }, pool: p })
  return c.nodesCost + c.volumeCost
}

/* ---------------- overview: O&M events card ---------------- */
/* The overview shows the real O&M event list (ArDataTableServer) with the
   Events section's filters, instead of a summarized feed. Kubernetes events
   stay in the Events section where the O&M / K8s split is filterable. */
const OM_COLUMNS = [
  { label: 'Generated', name: 'generated', width: '150px' },
  { label: 'Level', name: 'level', width: '110px' },
  { label: 'Event Name', name: 'name', width: '200px' },
  { label: 'Event Remarks', name: 'remarks' },
  { label: 'Error Message', name: 'error', width: '260px' },
]
/* shared base rows for the overview card and the events section table */
const omBase = computed(() =>
  (store.events[cluster.value?.id] || []).map((e) => ({
    generated: `${e.ts}`,
    name: e.reason,
    remarks: e.msg,
    error: e.type === 'Warning' ? 'Check cluster health and node status.' : '—',
    level: e.type === 'Warning' ? 'Warning' : 'Info',
  }))
)
/* overview card has its own filter state so it never inherits the
   Events section's active filters */
const ovEvQuery = ref('')
const ovEvRange = ref('all')
const ovEvLevel = ref('all')
const ovEvName = ref('all')
const ovEvFiltered = computed(
  () => ovEvQuery.value.trim() !== '' || ovEvRange.value !== 'all' || ovEvLevel.value !== 'all' || ovEvName.value !== 'all'
)
function resetOvEvFilters() {
  ovEvQuery.value = ''
  ovEvRange.value = 'all'
  ovEvLevel.value = 'all'
  ovEvName.value = 'all'
}
const ovOmEvents = computed(() => {
  const q = ovEvQuery.value.trim().toLowerCase()
  return omBase.value.filter(
    (e) =>
      (ovEvLevel.value === 'all' || e.level === ovEvLevel.value) &&
      (ovEvName.value === 'all' || e.name === ovEvName.value) &&
      (!q || e.name.toLowerCase().includes(q) || e.remarks.toLowerCase().includes(q))
  )
})

/* ---------------- storage section ---------------- */
const poolVolumes = computed(() =>
  (cluster.value?.pools || []).map((p) => {
    const gb = p.volumeGb || 50
    return {
      id: p.id,
      name: p.name,
      nodes: p.count,
      gb,
      totalGb: gb * p.count,
      cost: VOLUME_PRICE_PER_GB * gb * p.count,
    }
  })
)
const volumesTotal = computed(() => poolVolumes.value.reduce((n, v) => n + v.totalGb, 0))

/* ---------------- monitoring section (per-node curves) ---------------- */
const monObject = ref('')
const monPeriod = ref('Last 1 hour')
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

const PERIOD_HOURS = { 'Last 1 hour': 1, 'Last 6 hours': 6, 'Last 24 hours': 24 }
const monTimes = computed(() => genTimes(PERIOD_HOURS[monPeriod.value] || 1, 40))

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

/* ---------------- events section ---------------- */
/* full event browser: the overview feed links here; the O&M / Kubernetes
   source split stays here, where it is filterable and exportable */
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

/* O&M events: control-plane / platform events (mock, 30-day retention);
   rows come from the shared omBase built for the overview card */
const omEvents = computed(() => {
  const q = evQuery.value.trim().toLowerCase()
  return omBase.value.filter(
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

/* Dedicated node pool creation page; keep old list deep links working. */
function openCreatePool() {
  router.push({ name: 'pool-create', params: { id: route.params.id }, query: newOverview.value ? { view: 'v3' } : {} })
}
watch(
  () => route.query.add,
  value => {
    if (value === 'pool') router.replace({ name: 'pool-create', params: { id: route.params.id }, query: newOverview.value ? { view: 'v3' } : {} })
  },
  { immediate: true }
)

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
    store.toast('success', 'Copied', 'Copied to clipboard.')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) store.toast('success', 'Copied', 'Copied to clipboard.')
    else store.toast('info', 'Copy failed', 'Copy the value manually.')
  }
}

function menuAction(item) {
  if (item.action === 'kube') downloadKubeconfig(cluster.value)
  if (item.action === 'classic') router.push(`/clusters/${cluster.value.id}`)
  if (item.action === 'delete') deleteOpen.value = true
}

</script>

<template>
  <div v-if="cluster" class="v2-shell" :class="{ 'v2-shell--design-c': newOverview }">
    <!-- ============ LEFT SECTION NAV (real-panel aside-menu pattern:
         icon+title header with divider, collapsible chevron groups) ============ -->
    <aside class="v2-nav" aria-label="Cluster sections">
      <div class="nav-header">
        <span class="nav-header-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2.6 20.2 7v10L12 21.4 3.8 17V7L12 2.6Z"/><circle cx="12" cy="12" r="3.1"/><path d="M12 5.4v3.5M12 15.1v3.5M8.2 7.3l2.9 1.8M12.9 14.9l2.9 1.8M15.8 7.3l-2.9 1.8M11.1 14.9l-2.9 1.8"/></svg>
        </span>
        <h2 class="nav-header-title">Kubernetes</h2>
      </div>

      <div class="nav-body">
        <button class="nav-item nav-flat" :class="{ active: tab === 'overview' }" @click="tab = 'overview'">
          Overview
        </button>

        <div v-for="g in NAV_GROUPS" :key="g.label" class="nav-coll">
          <button class="nav-item nav-coll-head" :class="{ open: openGroups[g.label] }" @click="toggleGroup(g.label)">
            <span class="chev" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 6 4 4 4-4"/></svg>
            </span>
            {{ g.label }}
          </button>
          <template v-if="openGroups[g.label]">
            <button
              v-for="it in g.items"
              :key="it.id"
              class="nav-item nav-sub"
              :class="{ active: tab === it.id }"
              @click="tab = it.id"
            >
              {{ it.label }}
              <span v-if="it.count && it.count.value" class="count">{{ it.count.value }}</span>
              <span v-if="it.warn && warningCount" class="warn-dot" :title="`${warningCount} active warnings`"></span>
            </button>
          </template>
        </div>
      </div>

      <UIKitButton v-if="newOverview" variant="ghost" class="design-c-compare" @click="router.push(`/clusters/${cluster.id}/v2`)">Compare with design B</UIKitButton>
      <button class="nav-classic text-caption-1" @click="router.push(`/clusters/${cluster.id}`)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3 5 8l5 5"/></svg>
        Switch to classic view
      </button>
    </aside>

    <main class="v2-content">
    <UIKitSubHeader v-if="newOverview && tab === 'overview'" class="design-c-title" title="Overview" :tabs-props="{ items: [] }" :back="{ name: 'clusters' }" />
    <div v-else class="crumbs">
      <router-link to="/clusters">Kubernetes</router-link>
      <span class="sep">/</span>
      <router-link to="/clusters">Clusters</router-link>
      <span class="sep">/</span>
      <span class="here">{{ cluster.name }}</span>
    </div>

    <div v-if="tab !== 'pools' && !(newOverview && tab === 'overview')" class="page-header">
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
        <ArButton
          v-if="verBadge === 'Update available' && cluster.status !== 'upgrading'"
          variant="primary"
          @click="upgradeOpen = true"
        >
          Upgrade to v{{ upgradeTarget.patch }}
        </ArButton>
        <ArButton variant="secondary" @click="downloadKubeconfig(cluster)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8m0 0 3-3M8 10 5 7M3 13h10"/></svg>
          Kubeconfig
        </ArButton>
        <ActionMenu
          :items="[
            { label: 'Download kubeconfig', action: 'kube' },
            { label: 'Switch to classic view', action: 'classic' },
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

    <div class="v2-main">
        <!-- ================= OVERVIEW ================= -->
        <ClusterOverviewV3 v-if="newOverview && tab === 'overview'" :cluster="cluster" @create-pool="openCreatePool" @network="tab = 'networking'" />
        <template v-if="tab === 'overview' && !newOverview">
          <div class="ov-main">

              <!-- 1 · health: is the cluster OK, right now? -->
              <div class="ar-card health-card">
                <div class="health-seg">
                  <span class="health-label text-caption-1">Control plane</span>
                  <div class="health-line">
                    <ArBadge
                      :variant="cpHealthy ? 'success' : 'danger'"
                      :prepend-icon="cpHealthy ? 'check-circle' : 'error'"
                      :text="cpHealthy ? 'Healthy' : 'Degraded'"
                    />
                    <span class="cp-chips">
                      <span
                        v-for="m in masterNodes"
                        :key="m.name"
                        class="cp-chip"
                        :class="{ down: m.status !== 'Running' }"
                        :title="`${m.name} · ${m.status}`"
                      >{{ m.az }}</span>
                    </span>
                  </div>
                  <span class="text-caption-1 muted">
                    AKS {{ cpPlan?.name }} · {{ cluster.cp.ha ? `${masterNodes.length} replicas across zones` : 'single zone' }}
                    · etcd backup {{ cluster.etcdBackup.lastRun }}
                  </span>
                </div>
                <div class="health-seg">
                  <span class="health-label text-caption-1">Active warnings</span>
                  <div class="health-line">
                    <span class="health-big" :class="{ alert: warningCount }">{{ warningCount }}</span>
                    <button class="link-btn" @click="tab = 'events'">View events</button>
                  </div>
                  <span class="text-caption-1 muted">Warning-level platform events and workload alarms.</span>
                </div>
                <div class="health-seg">
                  <span class="health-label text-caption-1">Version</span>
                  <div class="health-line">
                    <span class="health-big">v{{ cluster.version }}</span>
                    <ArBadge :variant="verBadgeTone" :prepend-icon="verBadgeTone === 'success' ? 'check-circle' : verBadgeTone === 'info' ? 'refresh' : 'warning'" :text="verBadge" />
                  </div>
                  <span v-if="verBadge === 'Update available'" class="text-caption-1 muted">
                    v{{ upgradeTarget.patch }} is ready. Upgrades are manual and take 15–40 minutes —
                    <button class="link-btn" @click="upgradeOpen = true">upgrade now</button>
                  </span>
                  <span v-else class="text-caption-1 muted">Latest supported minor. Upgrades stay manual — you pick the moment.</span>
                </div>
              </div>

              <!-- 2 · basic info: cluster identity (uikit ArSection) -->
              <ArSection title="Basic info">
                <div class="kv about-grid">
                  <div class="row">
                    <span class="k">Cluster ID</span>
                    <span class="v mono about-id" :title="clusterUid">{{ clusterUid }}</span>
                    <button class="ar-btn ghost icon sm" title="Copy cluster ID" aria-label="Copy cluster ID" @click="copy(clusterUid)">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>
                    </button>
                  </div>
                  <div class="row">
                    <span class="k">Plan</span>
                    <span class="v">
                      <ArBadge variant="primary" :text="`AKS ${cpPlan?.name}`" />
                      <span class="text-body-2 muted" style="margin-inline-start: var(--space-2)">{{ cluster.cp.ha ? 'HA' : 'Single zone' }}</span>
                    </span>
                  </div>
                  <div class="row">
                    <span class="k">Region</span>
                    <span class="v text-body-2">{{ REGION.name }} <span class="mono muted">{{ REGION.id }}</span></span>
                  </div>
                  <div class="row">
                    <span class="k">VPC</span>
                    <span class="v text-body-2">{{ vpc?.name }} <span class="mono muted">{{ vpc?.cidr }}</span></span>
                  </div>
                  <div class="row">
                    <span class="k">Created</span>
                    <span class="v text-body-2">{{ fmtDate(cluster.createdAt) }}</span>
                  </div>
                  <div class="row">
                    <span class="k">Tags</span>
                    <span class="v" style="display: flex; flex-wrap: wrap; gap: var(--space-1)">
                      <ArBadge v-for="l in cluster.labels" :key="l" variant="neutral" :text="l" />
                      <span v-if="!cluster.labels.length" class="text-body-2 muted">—</span>
                    </span>
                  </div>
                </div>
                <button class="link-btn" style="margin-top: var(--space-3)" @click="tab = 'networking'">Network settings</button>
              </ArSection>

              <!-- 3 · node pools: per-pool utilization (uikit ArDataTableServer) -->
              <div class="ar-card dt-card">
                <div class="card-head-row" style="padding: var(--space-6) var(--space-6) 0">
                  <h3 class="text-title-3" style="margin: 0">Node Pools</h3>
                </div>
                <ArDataTableServer
                  :columns="POOL_COLUMNS"
                  :items="poolRows"
                  :pagination="{ current: 1, total: 1 }"
                >
                  <template #item-name="{ item }">
                    <router-link
                      :to="{ name: 'pool-details', params: { id: cluster.id, poolId: item.id } }"
                      class="pool-name-link text-body-2-strong"
                    >{{ item.name }}</router-link>
                  </template>
                  <template #item-zones="{ item }">
                    <span class="text-body-2 muted">{{ item.zones }}</span>
                  </template>
                  <template #item-cpu="{ item }">
                    <ArProgress :value="item.cpu" :label="item.cpu + '%'" />
                  </template>
                  <template #item-mem="{ item }">
                    <ArProgress :value="item.mem" :label="item.mem + '%'" />
                  </template>
                  <template #item-actions="{ item }">
                    <PoolActions :cluster="cluster" :pool="item.pool" />
                  </template>
                </ArDataTableServer>
              </div>

              <!-- 4 · monitoring overview: cluster-wide utilization charts -->
              <div class="ar-card" style="padding: var(--space-6)">
                <div class="card-head-row">
                  <div>
                    <h3 class="text-title-3" style="margin: 0">Monitoring</h3>
                    <p class="text-body-2 muted" style="margin: 2px 0 0">CPU, memory and network across worker nodes, averaged over the window.</p>
                  </div>
                  <div class="card-head-row" style="gap: var(--space-4)">
                    <ArSelect v-model="ovPeriod" style="width: 160px" :options="Object.keys(PERIOD_HOURS)" aria-label="Select Period" />
                    <button class="link-btn" @click="tab = 'monitoring'">Detailed metrics</button>
                  </div>
                </div>

                <div class="ov-grid">
                  <div v-for="ch in ovCharts" :key="ch.key" class="ov-tile">
                    <div class="ov-tile-head">
                      <span class="text-caption-1">{{ ch.label }}</span>
                      <span class="ov-val" :class="{ warn: ch.unit === '%' && ch.value >= 70, danger: ch.unit === '%' && ch.value > 85 }">
                        {{ ch.unit === '%' ? ch.value.toFixed(2) + '%' : ch.value.toFixed(2) + ' kB/s' }}
                      </span>
                    </div>
                    <MetricsChart :title="ch.label" :unit="ch.unit" :series="ch.series" :times="ovTimes" />
                  </div>
                </div>
              </div>

              <!-- 5 · O&M events: the real event list with the Events section filters -->
              <div class="ar-card dt-card">
                <div class="card-head-row" style="padding: var(--space-6) var(--space-6) 0">
                  <div>
                    <h3 class="text-title-3" style="margin: 0">O&amp;M Events</h3>
                    <p class="text-body-2 muted" style="margin: 2px 0 0">Control-plane and node events, retained for 30 days.</p>
                  </div>
                </div>
                <ArDataTableServer
                  v-model:search="ovEvQuery"
                  :columns="OM_COLUMNS"
                  :items="ovOmEvents"
                  searchable
                  search-placeholder="Search events…"
                  :pagination="{ current: 1, total: 1 }"
                >
                  <template #actions>
                    <div class="ar-input" style="width: 150px; height: 34px">
                      <select v-model="ovEvRange" aria-label="Time range">
                        <option value="all">All time</option>
                        <option value="1d">Last 1 day</option>
                        <option value="7d">Last 7 days</option>
                        <option value="15d">Last 15 days</option>
                      </select>
                      <svg class="chev" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
                    </div>
                    <ArSelect
                      v-model="ovEvLevel"
                      style="width: 140px"
                      :options="[{ value: 'all', label: 'All Levels' }, { value: 'Warning', label: 'Warning' }, { value: 'Info', label: 'Info' }]"
                      aria-label="Filter by level"
                    />
                    <ArSelect
                      v-model="ovEvName"
                      style="width: 200px"
                      :options="omNameOptions"
                      searchable
                      search-placeholder="Search events…"
                      aria-label="Filter by event name"
                    />
                    <button v-if="ovEvFiltered" class="link-btn" @click="resetOvEvFilters">Reset filters</button>
                  </template>
                  <template #item-generated="{ item }">
                    <span class="mono muted">{{ item.generated }}</span>
                  </template>
                  <template #item-level="{ item }">
                    <ArBadge :variant="item.level === 'Warning' ? 'warning' : 'neutral'" :prepend-icon="item.level === 'Warning' ? 'warning' : ''" :text="item.level" />
                  </template>
                  <template #item-name="{ item }">
                    <span class="text-body-2-strong">{{ item.name }}</span>
                  </template>
                  <template #item-remarks="{ item }">
                    <span class="text-body-2 muted">{{ item.remarks }}</span>
                  </template>
                  <template #item-error="{ item }">
                    <span class="text-body-2" :class="item.error === '—' ? 'muted' : ''">{{ item.error }}</span>
                  </template>
                </ArDataTableServer>
                <button class="link-btn" style="margin: var(--space-2) var(--space-6) var(--space-5)" @click="tab = 'events'">
                  View all {{ omBase.length }} events
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
                </button>
              </div>

              <!-- 6 · control plane nodes: per-replica detail + monitor drilldown -->
              <div class="ar-card" style="padding: var(--space-6)">
                <div class="card-head-row">
                  <h3 class="text-title-3" style="margin: 0">Control Plane Nodes</h3>
                </div>
                <div class="banner info" style="margin-bottom: var(--space-4); align-items: flex-start">
                  <svg style="flex:none; margin-top: 2px" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
                  <span>Overload control enabled. An overloaded control plane node rejects external traffic proportionally based on the overload level.</span>
                </div>
                <div class="table-scroll">
                  <table class="ar-table">
                    <thead>
                      <tr>
                        <th style="width: 26%">Name <span class="sort-ico">⇅</span></th>
                        <th style="width: 13%">Status</th>
                        <th style="width: 10%">AZ</th>
                        <th style="width: 19%">CPU Usage</th>
                        <th style="width: 19%">Memory Usage</th>
                        <th style="width: 13%"></th>
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
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        </template>

        <!-- ================= NODE POOLS ================= -->
        <template v-if="tab === 'pools'">
          <NodePoolList :cluster="cluster" @create="openCreatePool" />
        </template>

        <!-- ================= STORAGE ================= -->
        <template v-if="tab === 'storage'">
          <div class="ar-card" style="padding: var(--space-6); margin-bottom: var(--space-4)">
            <div class="card-head-row" style="margin-bottom: var(--space-4)">
              <div>
                <h3 class="text-title-3" style="margin: 0">Node root volumes</h3>
                <p class="text-body-2 muted" style="margin: 2px 0 0">Every node boots from an ssd-g1 root volume. Volumes live and die with their node.</p>
              </div>
            </div>
            <div class="table-scroll">
              <table class="ar-table">
                <thead>
                  <tr>
                    <th>Node Pool</th>
                    <th style="width: 90px">Nodes</th>
                    <th style="width: 160px">Root Volume</th>
                    <th style="width: 160px">Capacity</th>
                    <th style="width: 200px">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="v in poolVolumes" :key="v.id">
                    <td class="cell-main">{{ v.name }}</td>
                    <td class="text-body-2">{{ v.nodes }}</td>
                    <td class="text-body-2">ssd-g1 · {{ v.gb }} GB</td>
                    <td class="text-body-2">{{ v.totalGb }} GB</td>
                    <td class="text-body-2-strong">{{ fmtIRR(v.cost) }} IRR/month</td>
                  </tr>
                  <tr v-if="!poolVolumes.length">
                    <td colspan="5" class="text-body-2-strong" style="text-align: center; padding: var(--space-8)">No node pools yet.</td>
                  </tr>
                </tbody>
                <tfoot v-if="poolVolumes.length">
                  <tr>
                    <td class="text-body-2-strong">Total</td>
                    <td></td>
                    <td></td>
                    <td class="text-body-2-strong">{{ volumesTotal }} GB</td>
                    <td class="text-body-2-strong">{{ fmtIRR(poolVolumes.reduce((n, v) => n + v.cost, 0)) }} IRR/month</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p class="text-caption-1 muted" style="margin: var(--space-3) 0 0">
              ssd-g1 pricing: {{ fmtIRR(VOLUME_PRICE_PER_GB) }} IRR per GB per month. Kubernetes PVs created through the Block Storage CSI driver appear in your Block Storage console.
            </p>
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
        </template>

        <!-- ================= NETWORKING ================= -->
        <template v-if="tab === 'networking'">
          <div class="charts-grid" style="grid-template-columns: 1fr 1fr">
            <div class="ar-card" style="padding: var(--space-6)">
              <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">VPC &amp; subnets</h3>
              <div class="kv">
                <div class="row"><span class="k" style="width: 120px">VPC</span><span class="v">{{ vpc?.name }} <span class="mono muted">({{ vpc?.cidr }})</span></span></div>
                <div class="row">
                  <span class="k" style="width: 120px">Subnets</span>
                  <span class="v" style="display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start">
                    <ArBadge
                      v-for="sid in cluster.subnetIds"
                      :key="sid"
                      variant="neutral"
                      :text="`${vpc?.subnets.find((s) => s.id === sid)?.name} · ${vpc?.subnets.find((s) => s.id === sid)?.cidr} · ${REGION.zones.find((z) => z.id === vpc?.subnets.find((s) => s.id === sid)?.zone)?.name}`"
                    />
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

        <!-- ================= OPERATIONS ================= -->
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
    </div>

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
  </div>

  <main v-else class="page">
    <div class="ar-card">
      <ArEmpty title="Cluster not found" desc="This cluster may have been deleted.">
        <router-link to="/clusters" class="ar-btn secondary sm" style="text-decoration: none">Back to clusters</router-link>
      </ArEmpty>
    </div>
  </main>
</template>

<style scoped>
/* this route drops the console chrome — the section nav takes its place as a
   real sidebar following the panel's aside-menu pattern: icon+title header
   (menu-header, 0 16px padding, divider below), 32px chevron group rows
   (menu-item, 6px 8px padding), indented sub-items, teal active bar */
.v2-shell { display: flex; align-items: stretch; min-height: calc(100vh - 56px); }
.v2-shell--design-c { background: var(--bg-neutral-t1-3-default); }
.v2-shell--design-c .v2-content { padding: 24px; }
.design-c-compare { margin: 16px 12px 0; }
.design-c-title { margin: -24px -24px 24px; }
.design-c-title :deep(.v11-1-0-ArContainer) { max-width: none; padding-inline: 24px; }
.v2-content { flex: 1; min-width: 0; padding: var(--space-8) var(--space-6) var(--space-12); }

/* ---- left nav (aside-menu look) ---- */
.v2-nav {
  width: 216px; flex: none;
  background: var(--bg-neutral-t1-1-default);
  border-right: 1px solid var(--st-neutral-t1-5-default);
  position: sticky; top: 56px; height: calc(100vh - 56px); overflow-y: auto;
  display: flex; flex-direction: column;
}
/* header: icon tile + product title, divider below (menu-header pattern) */
.nav-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4);
  border-bottom: 1px solid var(--st-neutral-t1-5-default);
  flex: none;
}
.nav-header-icon {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-primary-t3-1-default);
}
.nav-header-title {
  margin: 0;
  font-size: 19px;
  font-weight: 550;
  letter-spacing: -0.2px;
  color: var(--fg-neutral-t1-1-default);
}
.nav-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) var(--space-2);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: 32px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: none;
  font: inherit;
  font-size: 13.5px;
  font-weight: 450;
  text-align: left;
  color: var(--fg-neutral-t1-2-default);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  position: relative;
}
.nav-item:hover { background: var(--bg-neutral-t1-4-default); color: var(--fg-neutral-t1-1-default); }
.nav-item.active { background: var(--bg-primary-t2-1-default); color: var(--fg-neutral-t1-1-default); }
.nav-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: var(--radius-circular);
  background: var(--bg-primary-t3-1-default);
}
/* standalone item: text aligns with the group labels (chevron width + gaps) */
.nav-flat { padding-left: 40px; }
/* collapsible group row: chevron box + label (menu-item--has-icon pattern) */
.nav-coll-head {
  font-size: 14px;
  font-weight: 550;
  color: var(--fg-neutral-t1-1-default);
}
.nav-coll-head .chev {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--bg-neutral-t1-3-default);
  color: var(--fg-neutral-t1-2-default);
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-coll-head .chev svg { transition: transform 0.15s; }
.nav-coll-head:not(.open) .chev svg { transform: rotate(-90deg); }
/* sub items sit under the group label */
.nav-sub { padding-left: 40px; }
.nav-item .count {
  margin-inline-start: auto;
  min-width: 20px;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--radius-circular);
  background: var(--bg-neutral-t1-4-default);
  color: var(--fg-neutral-t1-3-default);
}
.nav-item.active .count { background: var(--bg-neutral-t1-1-default); color: var(--fg-primary-t1-1-default); }
.nav-item .warn-dot {
  margin-inline-start: auto;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-circular);
  background: var(--bg-warning-t1-1-default);
}
.nav-classic {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding: var(--space-4);
  border: 0;
  border-top: 1px solid var(--st-neutral-t1-5-default);
  background: none;
  font: inherit;
  color: var(--fg-neutral-t1-3-default);
  cursor: pointer;
  text-align: left;
}
.nav-classic:hover { color: var(--fg-primary-t1-1-default); }

/* ---- overview: single card stack ---- */
.ov-main { display: flex; flex-direction: column; gap: var(--space-5); min-width: 0; }
.card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

/* health strip: one card, three answers to "is everything OK?" */
.health-card { display: grid; grid-template-columns: 1.3fr 0.9fr 1.2fr; padding: 0; overflow: hidden; }
/* cards hosting a uikit ArDataTableServer: title row + flush table */
.dt-card { padding: 0; overflow: hidden; }
.dt-card :deep(.ArDataTableServer) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding-top: var(--space-4);
}
.health-seg {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  min-width: 0;
}
.health-seg + .health-seg { border-left: 1px solid var(--st-neutral-t1-5-default); }
.health-label { color: var(--fg-neutral-t1-3-default); }
.health-line { display: flex; align-items: center; gap: var(--space-3); min-height: 28px; }
.health-big { font-size: 24px; font-weight: 450; letter-spacing: -0.4px; color: var(--fg-neutral-t1-1-default); line-height: 1; }
.health-big.alert { color: var(--fg-warning-t1-1-default); }
.cp-chips { display: inline-flex; gap: 4px; }
.cp-chip {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--radius-circular);
  background: var(--bg-success-t2-1-default);
  color: var(--fg-success-t2-1-default);
  white-space: nowrap;
}
.cp-chip.down { background: var(--bg-error-t2-1-default); color: var(--fg-error-t2-1-default); }

/* monitoring overview (overview): 2×2 chart tiles */
.ov-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
  margin-top: var(--space-4);
}
.ov-tile-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.ov-val {
  font-size: 15px;
  font-weight: 450;
  color: var(--fg-neutral-t1-1-default);
}
.ov-val.warn { color: var(--fg-warning-t1-1-default); }
.ov-val.danger { color: var(--fg-error-t1-1-default); }

/* usage trends: two charts side by side */
.mon-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
}

/* basic info (ArSection): two-column key/value grid */
.about-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: var(--space-6); }
.about-grid .row { padding: var(--space-2) 0; }
.about-grid .row .k { width: 104px; font-size: 12px; }
.about-wide { grid-column: 1 / -1; }
.about-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
  display: inline-block;
  vertical-align: bottom;
}

@media (max-width: 900px) {
  .v2-shell { flex-direction: column; }
  .v2-nav {
    position: static; height: auto; width: auto;
    border-right: 0;
    border-bottom: 1px solid var(--st-neutral-t1-5-default);
  }
  .nav-header { display: none; }
  .nav-body { flex-direction: row; flex-wrap: wrap; }
  .nav-coll { display: contents; }
  .nav-coll-head { display: none; }
  .nav-item { width: auto; padding-left: 12px; }
  .nav-classic { display: none; }
  .health-card { grid-template-columns: 1fr; }
  .health-seg + .health-seg { border-left: 0; border-top: 1px solid var(--st-neutral-t1-5-default); }
  .about-grid { grid-template-columns: 1fr; }
  .mon-grid { grid-template-columns: 1fr; }
  .ov-grid { grid-template-columns: 1fr; }
}
</style>
