<script setup>
import { computed, ref, watch } from 'vue'
import { ArBadge, ArButton, ArIcon, ArLineAreaChart, ArLinkButton, ArProgressBar, ArSection, ArSelect, ArSidePanel, ArTable, ArTableCell, ArTableRow, ArTooltip } from '../uikit'
import { CP_PLANS, REGION, VPCS } from '../data'
import { genPoints, genTimes, seedHash } from '../metrics'

const props = defineProps({ cluster: { type: Object, required: true } })
const selectedNode = ref(null)
const monitorOpen = ref(false)
const formatTime = value => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const formatPercent = value => `${Number(value.toFixed(1))}%`
const formatRate = value => `${Math.round(value)} KB/s`

/* ---------------- toolbar: object + period, like the Monitoring tab ---------------- */
const PERIOD_HOURS = { 'Last 1 hour': 1, 'Last 6 hours': 6, 'Last 24 hours': 24 }
const monPeriod = ref('Last 6 hours')
const times = computed(() => genTimes(PERIOD_HOURS[monPeriod.value] || 6, 40))

/* control plane nodes, same naming as the table below */
const masterNodes = computed(() => {
  const cp = props.cluster.cp
  const single = cp.distribution ? cp.distribution === 'single-az' : !cp.ha
  const plan = CP_PLANS.find(p => p.id === cp.plan)
  const count = single ? 1 : (cp.replicas || plan?.replicas || 3)
  return Array.from({ length: count }, (_, i) => `${props.cluster.name}-master-${i + 1}`)
})

/* worker nodes mirror the Node pools tab naming (stable suffix per pool) */
function poolFlavorIds(pool) {
  return pool.specs?.length ? pool.specs.map((s) => s.flavorId) : [pool.flavor].filter(Boolean)
}
function nodesOf(pool) {
  const flavors = poolFlavorIds(pool)
  const seed = [...pool.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return Array.from({ length: pool.count }, (_, i) => ({
    name: `${pool.name}-${(seed + i * 7919).toString(36).slice(0, 5)}`,
    zone: pool.zones.length ? pool.zones[i % pool.zones.length] : REGION.zones[i % REGION.zones.length].id,
  }))
}

const monObjects = computed(() => {
  const cp = masterNodes.value.map(name => ({ value: name, label: name }))
  const pools = props.cluster.pools || []
  const suffix = pools.length > 1
  const workers = pools.flatMap((p) =>
    nodesOf(p).map((n) => ({ value: n.name, label: suffix ? `${n.name} · ${p.name}` : n.name }))
  )
  return [...cp, ...workers]
})

/* real ArSelect emits the full option object; keep the node name here */
const selectedObject = ref(null)
const monObject = computed(() => selectedObject.value?.value || '')
watch(monObjects, (opts) => {
  if (!opts.some(o => o.value === monObject.value)) selectedObject.value = opts[0] || null
}, { immediate: true })

function series(name, values) { return { name, data: values.map((y, i) => ({ x: times.value[i], y })) } }
function usageSeries(key, base, variance) {
  const avg = genPoints(`${props.cluster.id}|${monObject.value}|${monPeriod.value}|${key}`, { base, variance, min: 0.1 })
  const band = genPoints(`${props.cluster.id}|${monObject.value}|${monPeriod.value}|${key}B`, { base: variance * 0.6, variance: variance * 0.24, min: 0.1 })
  return [series('Avg', avg), series('Max', avg.map((v, i) => Math.min(100, v + band[i]))), series('Min', avg.map((v, i) => Math.max(0.1, v - band[i] * 0.8)))]
}
const charts = computed(() => {
  /* per-object load: worker nodes sit near the cluster average, control plane runs lighter */
  const isMaster = masterNodes.value.includes(monObject.value)
  const usage = props.cluster.usage || { cpu: 0, mem: 0 }
  const load = isMaster ? 0.55 : 1
  const h = (seedHash(monObject.value || props.cluster.id) % 1000) / 1000
  const up = (120 + h * 260) * load
  const down = (240 + h * 520) * load
  return [
    { key: 'cpu', title: 'CPU Usage', data: usageSeries('cpu', Math.max(3, usage.cpu * (0.5 + h * 0.3) * load), 2.4), formatter: formatPercent },
    { key: 'mem', title: 'Memory Usage', data: usageSeries('mem', Math.max(8, usage.mem * (0.55 + h * 0.25) * load), 1), formatter: formatPercent },
    { key: 'up', title: 'Uplink Rate', data: [series('Uplink Rate', genPoints(`${props.cluster.id}|${monObject.value}|${monPeriod.value}|up`, { base: up, variance: up * 0.35, min: 2 }))], formatter: formatRate },
    { key: 'down', title: 'Downlink Rate', data: [series('Downlink Rate', genPoints(`${props.cluster.id}|${monObject.value}|${monPeriod.value}|down`, { base: down, variance: down * 0.3, min: 4 }))], formatter: formatRate },
  ].map(chart => ({ ...chart, current: chart.formatter(chart.data[0].data.at(-1).y) }))
})
const metricHints = {
  cpu: 'Simulated node CPU usage. Avg, Max and Min are percentage series; the headline shows the latest Avg.',
  mem: 'Simulated node memory usage. Avg, Max and Min are percentage series; the headline shows the latest Avg.',
  up: 'Simulated outbound network traffic from the selected node, measured in KB/s. The headline shows the latest sample.',
  down: 'Simulated inbound network traffic to the selected node, measured in KB/s. The headline shows the latest sample.',
}
const columns = [
  { name: 'index', label: '' }, { name: 'name', label: 'Name' }, { name: 'status', label: 'Status' },
  { name: 'az', label: 'AZ' }, { name: 'cpu', label: 'CPU Usage' }, { name: 'ram', label: 'RAM Usage' }, { name: 'monitor', label: '' },
]
const nodes = computed(() => {
  const cp = props.cluster.cp
  const single = cp.distribution ? cp.distribution === 'single-az' : !cp.ha
  const plan = CP_PLANS.find(p => p.id === cp.plan)
  const subnet = VPCS.find(v => v.id === props.cluster.vpcId)?.subnets.find(s => props.cluster.subnetIds.includes(s.id))
  const count = single ? 1 : (cp.replicas || plan?.replicas || 3)
  return Array.from({ length: count }, (_, i) => {
    const key = `${props.cluster.id}|cp|${i}`
    const zone = single ? (cp.zone || subnet?.zone || REGION.zones[0].id) : REGION.zones[i % REGION.zones.length].id
    return {
      id: key, index: i + 1, name: `${props.cluster.name}-master-${i + 1}`,
      zone: REGION.zones.find(z => z.id === zone)?.name || zone,
      ready: props.cluster.status === 'running' || props.cluster.status === 'upgrading',
      status: props.cluster.status === 'error' ? 'Error' : props.cluster.status === 'provisioning' ? 'Creating' : 'Running',
      cpu: Number((2 + (seedHash(`${key}|cpu`) % 800) / 100).toFixed(2)),
      ram: Number((24 + (seedHash(`${key}|mem`) % 2400) / 100).toFixed(2)),
    }
  })
})
const nodeCharts = computed(() => selectedNode.value ? [
  { title: 'CPU Usage', data: [series('CPU Usage', genPoints(`${selectedNode.value.id}|cpu`, { base: selectedNode.value.cpu, variance: 1, min: 0 }))] },
  { title: 'RAM Usage', data: [series('RAM Usage', genPoints(`${selectedNode.value.id}|mem`, { base: selectedNode.value.ram, variance: 1.5, min: 0 }))] },
] : [])
function openMonitor(node) { selectedNode.value = node; monitorOpen.value = true }
watch(() => props.cluster.id, () => { monitorOpen.value = false; selectedNode.value = null })
</script>

<template>
  <ArSection class="overview-monitoring" content-class="overview-monitoring__content">
    <template #header><div><h2>Monitoring</h2><p>CPU, memory and network usage per node.</p><p class="overview-monitoring__note">Prototype metrics · {{ monPeriod }} · Local time</p></div></template>
    <div class="overview-monitoring__toolbar">
      <div class="overview-monitoring__toolbar-field">
        <span class="overview-monitoring__toolbar-label">Select Object</span>
        <ArSelect
          v-model="selectedObject"
          :options="monObjects"
          searchable
          search-placeholder="Search nodes…"
          aria-label="Select Object"
        />
      </div>
      <div class="overview-monitoring__toolbar-field overview-monitoring__toolbar-field--period">
        <span class="overview-monitoring__toolbar-label">Select Period</span>
        <ArSelect v-model="monPeriod" :options="Object.keys(PERIOD_HOURS)" aria-label="Select Period" />
      </div>
    </div>
    <div class="overview-monitoring__grid">
      <div v-for="chart in charts" :key="chart.key" class="overview-monitoring__tile">
        <div class="overview-monitoring__tile-header"><h3>{{ chart.title }} <ArTooltip :content="metricHints[chart.key]"><ArIcon name="info" size="sm" class="overview-monitoring__help" tabindex="0" :aria-label="`${chart.title}: ${metricHints[chart.key]}`" /></ArTooltip></h3><strong :aria-label="`Latest ${chart.title}: ${chart.current}`">{{ chart.current }}</strong></div>
        <div class="overview-monitoring__chart" role="group" :aria-label="`${chart.title} chart, ${monPeriod.toLowerCase()}, simulated data`"><ArLineAreaChart :data="chart.data" type="line" smooth x-axis-type="time" :height="320" :format-x-axis="formatTime" :format-y-axis="chart.formatter" /></div>
      </div>
    </div>
  </ArSection>

  <ArSection class="overview-control-plane" content-class="overview-control-plane__content">
    <template #header><div><h2>Control Plane Nodes</h2><p>Dedicated nodes that manage the cluster.</p></div></template>
    <div class="overview-control-plane__scroll" tabindex="0" role="region" aria-label="Control plane nodes table">
      <ArTable :columns="columns" :items="nodes" class="overview-control-plane__table">
        <template #row="node"><ArTableRow>
          <ArTableCell><span class="overview-control-plane__index">{{ node.index }}</span></ArTableCell>
          <ArTableCell>{{ node.name }}</ArTableCell>
          <ArTableCell><ArBadge :variant="node.ready ? 'success' : node.status === 'Error' ? 'danger' : 'info'" :text="node.status" :prepend-icon="node.ready ? 'check-circle' : ''" /></ArTableCell>
          <ArTableCell>{{ node.zone }}</ArTableCell>
          <ArTableCell><div class="overview-control-plane__usage"><ArProgressBar :value="node.cpu" /><span>{{ node.cpu }}%</span></div></ArTableCell>
          <ArTableCell><div class="overview-control-plane__usage"><ArProgressBar :value="node.ram" /><span>{{ node.ram }}%</span></div></ArTableCell>
          <ArTableCell><ArLinkButton class="overview-control-plane__monitor" prepend-icon="chart" :aria-label="`Monitor ${node.name}`" @click="openMonitor(node)">Monitor</ArLinkButton></ArTableCell>
        </ArTableRow></template>
      </ArTable>
    </div>
  </ArSection>

  <ArSidePanel v-model="monitorOpen" :title="selectedNode?.name || 'Node monitoring'" caption="Control plane · Prototype metrics · Last 6 hours" size="md">
    <template v-if="selectedNode">
      <div class="overview-control-plane__node-meta"><ArBadge :variant="selectedNode.ready ? 'success' : selectedNode.status === 'Error' ? 'danger' : 'info'" :text="selectedNode.status" /><span>AZ: {{ selectedNode.zone }}</span></div>
      <div v-for="chart in nodeCharts" :key="chart.title" class="overview-control-plane__node-chart"><h3>{{ chart.title }}</h3><ArLineAreaChart :data="chart.data" x-axis-type="time" :height="220" :format-x-axis="formatTime" :format-y-axis="formatPercent" /></div>
    </template>
    <template #footer><ArButton variant="tertiary" @click="monitorOpen = false">Close</ArButton></template>
  </ArSidePanel>
</template>

<style scoped>
.overview-monitoring, .overview-control-plane { min-width: 0; color: var(--fg-neutral-t1-2-default); }
h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
h3 { margin: 0 0 16px; font-size: 14px; line-height: 20px; font-weight: 400; }
p { margin: 8px 0 0; color: var(--fg-neutral-t1-3-default); font-size: 14px; line-height: 20px; }
.overview-monitoring :deep(.v11-1-0-ArSection__section--header), .overview-control-plane :deep(.v11-1-0-ArSection__section--header) { border-bottom: 1px solid var(--st-neutral-t1-5-default); }
:deep(.overview-monitoring__content), :deep(.overview-control-plane__content) { padding: 48px; }
.overview-monitoring__toolbar { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
.overview-monitoring__toolbar-field { display: flex; flex-direction: column; gap: 8px; width: 300px; min-width: 0; }
.overview-monitoring__toolbar-field--period { width: 170px; }
.overview-monitoring__toolbar-label { font-size: 12px; line-height: 16px; color: var(--fg-neutral-t1-3-default); }
.overview-monitoring__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 16px; }
.overview-monitoring__chart { min-width: 0; width: 100%; }
.overview-monitoring__tile { min-width: 0; border: 1px solid var(--st-neutral-t1-5-default); border-radius: 8px; padding: 24px; background: var(--bg-neutral-t1-1-default); }
.overview-monitoring__tile-header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.overview-monitoring__tile-header h3 { display: flex; align-items: center; gap: 4px; margin: 0; }
.overview-monitoring__tile-header strong { font-size: 16px; line-height: 24px; font-weight: 500; font-variant-numeric: tabular-nums; }
.overview-monitoring__note { margin-top: 8px; font-size: 12px; }
.overview-monitoring__help { color: var(--fg-neutral-t1-3-default); cursor: help; }
.overview-monitoring__help:hover { color: var(--fg-neutral-t1-2-default); }
.overview-monitoring__help:focus-visible, .overview-control-plane__scroll:focus-visible { outline: 2px solid var(--st-primary-t1-1-default); outline-offset: 4px; }
.overview-control-plane__scroll { overflow-x: auto; }
.overview-control-plane__table :deep(.v11-1-0-ArTable__tableWrapper) { overflow: visible; padding-bottom: 0; }
.overview-control-plane__table :deep(table) { min-width: 920px; table-layout: fixed; }
.overview-control-plane__table :deep(th), .overview-control-plane__table :deep(td) { height: 48px; padding: 8px; font-size: 14px; line-height: 20px; border-bottom: 1px solid var(--st-neutral-t1-5-default); }
.overview-control-plane__table :deep(th) { color: var(--fg-neutral-t1-3-default); font-weight: 400; position: relative; }
.overview-control-plane__table :deep(th:not(:first-child):not(:last-child))::after { content: ''; position: absolute; right: 0; top: 50%; transform: translateY(-50%); height: 16px; border-right: 1px solid var(--st-neutral-t1-5-default); }
.overview-control-plane__table :deep(th:nth-child(1)) { width: 48px; }
.overview-control-plane__table :deep(th:nth-child(2)) { width: 26%; }
.overview-control-plane__table :deep(th:nth-child(3)) { width: 120px; }
.overview-control-plane__table :deep(th:nth-child(4)) { width: 100px; }
.overview-control-plane__table :deep(th:nth-child(7)) { width: 112px; }
.overview-control-plane__table :deep(td:nth-child(2)) { white-space: normal; overflow-wrap: anywhere; }
.overview-control-plane__index { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; border-radius: 6px; background: var(--bg-neutral-t1-3-default); }
.overview-control-plane__usage { display: flex; align-items: center; gap: 8px; }
.overview-control-plane__usage :deep(.v11-1-0-ArProgressBar) { min-width: 48px; flex: 1; padding: 0; }
.overview-control-plane__usage > span { min-width: 55px; font-size: 12px; }
.overview-control-plane__monitor { color: var(--fg-neutral-t1-2-default); }
.overview-control-plane__node-meta { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.overview-control-plane__node-chart { margin-bottom: 24px; }
@media (max-width: 1100px) { .overview-monitoring__tile { padding: 16px; } }
@media (max-width: 767px) { .overview-monitoring__grid { grid-template-columns: minmax(0, 1fr); } .overview-monitoring__chart :deep(.v11-1-0-ArLineAreaChart) { min-width: 0; } .overview-monitoring__toolbar-field { width: 100%; } }
@media (max-width: 640px) { :deep(.overview-monitoring__content), :deep(.overview-control-plane__content) { padding: 24px 12px; } }
</style>
