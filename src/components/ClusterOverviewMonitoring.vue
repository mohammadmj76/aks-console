<script setup>
import { computed, ref, watch } from 'vue'
import { ArBadge, ArButton, ArLineAreaChart, ArLinkButton, ArProgressBar, ArSection, ArSidePanel, ArTable, ArTableCell, ArTableRow } from '../uikit'
import { CP_PLANS, REGION, VPCS } from '../data'
import { genPoints, genTimes, seedHash } from '../metrics'

const props = defineProps({ cluster: { type: Object, required: true } })
const selectedNode = ref(null)
const monitorOpen = ref(false)
const times = ref(genTimes(6, 40))
const formatTime = value => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const formatPercent = value => `${Number(value.toFixed(1))}%`
const formatRate = value => `${Math.round(value)} KB/s`
function series(name, values) { return { name, data: values.map((y, i) => ({ x: times.value[i], y })) } }
function usageSeries(key, base, variance) {
  const avg = genPoints(`${props.cluster.id}|ov|Last 6 hours|${key}`, { base, variance, min: 0.1 })
  const band = genPoints(`${props.cluster.id}|ov|Last 6 hours|${key}B`, { base: variance * 0.6, variance: variance * 0.24, min: 0.1 })
  return [series('Avg', avg), series('Max', avg.map((v, i) => Math.min(100, v + band[i]))), series('Min', avg.map((v, i) => Math.max(0.1, v - band[i] * 0.8)))]
}
const charts = computed(() => {
  const usage = props.cluster.usage || { cpu: 0, mem: 0 }
  const h = (seedHash(props.cluster.id) % 1000) / 1000
  const up = 120 + h * 260
  const down = 240 + h * 520
  return [
    { key: 'cpu', title: 'CPU Usage', data: usageSeries('cpu', Math.max(3, usage.cpu * (0.5 + h * 0.3)), 2.4), formatter: formatPercent },
    { key: 'mem', title: 'Memory Usage', data: usageSeries('mem', Math.max(8, usage.mem * (0.55 + h * 0.25)), 1), formatter: formatPercent },
    { key: 'up', title: 'Uplink Rate', data: [series('Uplink Rate', genPoints(`${props.cluster.id}|ov|Last 6 hours|up`, { base: up, variance: up * 0.35, min: 2 }))], formatter: formatRate },
    { key: 'down', title: 'Downlink Rate', data: [series('Downlink Rate', genPoints(`${props.cluster.id}|ov|Last 6 hours|down`, { base: down, variance: down * 0.3, min: 4 }))], formatter: formatRate },
  ]
})
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
watch(() => props.cluster.id, () => { times.value = genTimes(6, 40); monitorOpen.value = false; selectedNode.value = null })
</script>

<template>
  <ArSection class="overview-monitoring" content-class="overview-monitoring__content">
    <template #header><div><h2>Monitoring</h2><p>CPU, memory and network usage across worker nodes.</p></div></template>
    <div class="overview-monitoring__grid">
      <div v-for="chart in charts" :key="chart.key" class="overview-monitoring__tile">
        <h3>{{ chart.title }}</h3>
        <ArLineAreaChart :data="chart.data" type="line" smooth x-axis-type="time" :height="220" :format-x-axis="formatTime" :format-y-axis="chart.formatter" />
      </div>
    </div>
    <p class="overview-monitoring__note">Prototype metrics · Last 6 hours</p>
  </ArSection>

  <ArSection class="overview-control-plane" content-class="overview-control-plane__content">
    <template #header><div><h2>Control Plane Nodes</h2><p>Dedicated nodes that manage the cluster.</p></div></template>
    <div class="overview-control-plane__scroll">
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
.overview-monitoring__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.overview-monitoring__tile { min-width: 0; border: 1px solid var(--st-neutral-t1-5-default); border-radius: 8px; padding: 24px; background: var(--bg-neutral-t1-1-default); }
.overview-monitoring__note { margin-top: 16px; font-size: 12px; }
.overview-control-plane__scroll { overflow-x: auto; }
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
@media (max-width: 767px) { .overview-monitoring__grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 640px) { :deep(.overview-monitoring__content), :deep(.overview-control-plane__content) { padding: 24px 12px; } }
</style>
