<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store, downloadKubeconfig, newerVersionAvailable } from '../store'
import { REGION, VERSIONS, CP_PLANS, FLAVOR_CATALOG, VPCS, apiEndpoint, fmtDate, flavorName, flavorSpec } from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArToggle from '../components/ui/ArToggle.vue'
import ArSidePanel from '../components/ui/ArSidePanel.vue'
import DonutGauge from '../components/ui/DonutGauge.vue'
import ArProgress from '../components/ui/ArProgress.vue'
import ArSelectMenu from '../components/ui/ArSelectMenu.vue'
import ArEmpty from '../components/ui/ArEmpty.vue'
import ActionMenu from '../components/ui/ActionMenu.vue'
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

const tab = ref('overview')
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'pools', label: 'Node pools' },
  { id: 'networking', label: 'Networking' },
  { id: 'operations', label: 'Operations' },
  { id: 'events', label: 'Events' },
]

/* ---------------- overview: master nodes table ---------------- */
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
    name: `${cluster.value?.name || 'cluster'}-master-${count - i}`,
    status: cluster.value?.status === 'error' && i === 0 ? 'Unreachable' : 'Running',
    az: ha ? zones[i % zones.length].name : zones[0].name,
    cpu: Math.round(((cluster.value?.usage.cpu || 18) * (0.55 + ((seed * 7 + i * 13) % 30) / 100)) * 100) / 100,
    mem: Math.round(((cluster.value?.usage.mem || 22) * (0.38 + ((seed * 5 + i * 17) % 26) / 100)) * 100) / 100,
  }))
})

/* ---------------- events tab ---------------- */
const evTab = ref('om')
const evQuery = ref('')
const evRange = ref('all')

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
    (e) => !q || e.name.toLowerCase().includes(q) || e.remarks.toLowerCase().includes(q)
  )
})

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
    (e) => !q || e.name.toLowerCase().includes(q) || e.msg.toLowerCase().includes(q) || e.obj.toLowerCase().includes(q)
  )
})

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
  return Array.from({ length: pool.count }, (_, i) => ({
    name: `${pool.name}-${(pool.id + i * 7919).toString(36).slice(0, 5)}`,
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
const poolForm = reactive({ name: '', flavor: 'g6.xlarge.2', count: 2, labels: [], taints: [], userData: '' })
const poolFormOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(poolForm.name) && poolForm.count >= 1)
const K8S_KEY = /^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/
const K8S_VAL = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/
const poolMetaOk = computed(() =>
  poolForm.labels.every((l) => {
    const [k, v] = l.split('=')
    return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v)
  }) && poolForm.taints.every((t) => K8S_KEY.test(t.key) && (t.value === '' || K8S_VAL.test(t.value)))
)
const poolLabelInput = ref('')
function addPoolLabel() {
  const v = poolLabelInput.value.trim().replace(/\s+/g, '')
  if (v && v.includes('=') && !poolForm.labels.includes(v) && poolForm.labels.length < 20) poolForm.labels.push(v)
  poolLabelInput.value = ''
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
    volumeGb: 50,
    labels: [...poolForm.labels],
    taints: poolForm.taints.filter((t) => t.key).map((t) => ({ ...t })),
    userData: poolForm.userData,
  })
  showAddPool.value = false
  poolForm.name = ''
  poolForm.labels = []
  poolForm.taints = []
  poolForm.userData = ''
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
          <span class="ar-badge neutral pill">v{{ cluster.version }}</span>
        </div>
        <div class="meta">
          <span class="text-body-2 muted">created {{ fmtDate(cluster.createdAt) }}</span>
        </div>
      </div>
      <div style="display: flex; gap: var(--space-3)">
        <ArButton variant="secondary" @click="downloadKubeconfig(cluster)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8m0 0 3-3M8 10 5 7M3 13h10"/></svg>
          Kubeconfig
        </ArButton>
        <ArButton v-if="newerVersionAvailable(cluster)" variant="primary" @click="upgradeOpen = true">
          Upgrade to v{{ upgradeTarget.patch }}
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
        <StatCard label="PODS" :value="String(cluster.usage.pods)">
          <span class="text-caption-1 muted">across all namespaces</span>
        </StatCard>
      </div>

      <div class="charts-grid" style="grid-template-columns: 1fr">
        <div class="ar-card chart-card" style="padding: var(--space-6)">
          <div class="head">
            <div>
              <h3 class="text-title-3" style="margin: 0">Master Nodes</h3>
            </div>
          </div>
          <div class="banner info" style="margin-bottom: var(--space-4); align-items: flex-start">
            <svg style="flex:none; margin-top: 2px" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
            <span>Overload control enabled. An overloaded master node rejects external traffic proportionally based on the overload level.</span>
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
                    <span class="ar-tag" :class="m.status === 'Running' ? 'success' : 'error'"><span class="dot"></span>{{ m.status }}</span>
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
        <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--st-neutral-t1-1-default)">
          <div style="flex: 1; min-width: 0">
            <div class="text-body-1">{{ pool.name }}</div>
            <div class="cell-sub" style="margin-top: 2px">
              {{ poolFlavorIds(pool).map((id) => flavorName(id)).join(', ') }} ·
              {{ pool.count }} node{{ pool.count === 1 ? '' : 's' }} · ssd-g1 {{ pool.volumeGb }} GB
              · {{ pool.zones.length ? pool.zones.map((z) => REGION.zones.find((zz) => zz.id === z)?.name).join(', ') : 'all zones' }}
            </div>
            <div v-if="(pool.labels?.length || pool.taints?.length)" class="pool-meta" style="margin-top: var(--space-2)">
              <span v-for="l in pool.labels || []" :key="l" class="ar-tag mono" style="font-size: 11px">{{ l }}</span>
              <span v-for="(t, i) in pool.taints || []" :key="'t' + i" class="ar-tag warning mono" style="font-size: 11px">
                <span class="dot"></span>{{ t.key }}{{ t.value ? '=' + t.value : '' }}:{{ t.effect }}
              </span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2)">
            <div class="count-input sm-scale">
              <button :disabled="cluster.status !== 'running' || pool.count <= 1" @click="store.scalePool(cluster, pool, -1)">−</button>
              <input :value="pool.count" readonly />
              <button :disabled="cluster.status !== 'running' || pool.count >= 20" @click="store.scalePool(cluster, pool, 1)">+</button>
            </div>
            <ActionMenu
              :items="[
                { label: 'Delete pool', danger: true, disabled: cluster.pools.length <= 1, action: 'delete' },
              ]"
              @select="(i) => {
                if (i.action === 'delete') store.removePool(cluster, pool)
              }"
            />
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
                  <span class="ar-tag" :class="n.ready ? 'success' : 'error'"><span class="dot"></span>{{ n.ready ? 'Ready' : 'NotReady' }}</span>
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
              <span class="v" style="display: flex; flex-direction: column; gap: var(--space-2)">
                <span v-for="sid in cluster.subnetIds" :key="sid" class="ar-tag">
                  {{ vpc?.subnets.find((s) => s.id === sid)?.name }} · {{ vpc?.subnets.find((s) => s.id === sid)?.cidr }} · {{ REGION.zones.find((z) => z.id === vpc?.subnets.find((s) => s.id === sid)?.zone)?.name }}
                </span>
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
            <div class="row"><span class="k" style="width: 120px">Access</span><span class="v"><span class="ar-badge success pill">Public</span></span></div>
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
            <span class="ar-badge success pill">{{ cluster.etcdBackup.restorePoints }} restore points</span>
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
            <span class="ar-badge" :class="cluster.auditLogs ? 'success' : 'neutral'">{{ cluster.auditLogs ? 'Streaming' : 'Off' }}</span>
          </div>
          <p class="text-caption-1 muted" style="margin: var(--space-3) 0 0">Audit log delivery is managed with your Cloud Logs project — see the Cloud Logs console.</p>
        </div>
      </div>
    </template>

    <!-- ================= EVENTS ================= -->
    <template v-if="tab === 'events'">
      <div class="ar-card" style="padding: var(--space-6)">
        <nav class="ar-tabs" style="margin-bottom: var(--space-5)">
          <button class="ar-tab" :class="{ active: evTab === 'om' }" @click="evQuery = ''; evTab = 'om'">O&amp;M Events</button>
          <button class="ar-tab" :class="{ active: evTab === 'k8s' }" @click="evQuery = ''; evTab = 'k8s'">Kubernetes Event</button>
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
          <div v-if="evTab === 'om'" class="ar-input" style="width: 160px; height: 34px">
            <select v-model="evRange" aria-label="Time range">
              <option value="all">All time</option>
              <option value="1d">Last 1 day</option>
              <option value="7d">Last 7 days</option>
              <option value="15d">Last 15 days</option>
            </select>
            <svg class="chev" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
          </div>
          <label class="ar-input ev-search">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
            <input v-model="evQuery" type="search" placeholder="Select a property or enter a keyword." />
          </label>
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
                <td><span class="ar-badge" :class="e.level === 'Warning' ? 'warning' : 'neutral'">{{ e.level }}</span></td>
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
                  <span class="ar-tag" :class="e.type === 'Alarm' ? 'warning' : 'success'">
                    <span class="dot"></span>{{ e.type }}
                  </span>
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
          Total Records: {{ evTab === 'om' ? omEvents.length : k8sEvents.length }}
        </p>
      </div>
    </template>

    <!-- ================= NODE MONITORING PANEL ================= -->
    <ArSidePanel :open="monitorPanel" :title="`Node Monitoring ${monitorNode?.name || ''}`" :subtitle="`${cluster?.name} · ${monitorNode?.az || ''}`" @close="monitorPanel = false">
      <div class="banner info" style="align-items: flex-start">
        <svg style="flex:none; margin-top: 2px" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
        <span>Monitoring data is collected by the platform metrics agent. Data missing at any time point indicates that no data was reported.</span>
      </div>

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
            <h4 class="text-body-1" style="margin: 0 0 var(--space-3)">Physical Memory Usage</h4>
            <div class="gauge-pair">
              <div><div class="gauge-num">{{ monitorMetrics(monitorNode).memUsed }}</div><div class="text-caption-1 muted">GiB · Available</div></div>
              <div><div class="gauge-num">{{ monitorMetrics(monitorNode).memLimit }}</div><div class="text-caption-1 muted">GiB · Limit</div></div>
            </div>
            <DonutGauge :pct="monitorNode.mem" label="Physical Memory Usage" />
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
          <span v-for="l in poolForm.labels" :key="l" class="ar-tag mono" style="font-size: 11px">
            {{ l }}
            <button class="tag-x" aria-label="Remove label" @click="removePoolLabel(l)">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 4 8 8M12 4l-8 8"/></svg>
            </button>
          </span>
          <input v-model="poolLabelInput" placeholder="key=value" spellcheck="false" @keydown.enter.prevent="addPoolLabel" />
        </div>
        <span v-if="poolForm.labels.length && !poolMetaOk" class="error-text">Use key=value — lowercase keys, values up to 63 characters.</span>
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
            <ArSelectMenu
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

      <div class="ar-field">
        <label>Startup script</label>
        <div class="ar-input textarea">
          <textarea v-model="poolForm.userData" rows="4" placeholder="#!/bin/bash" spellcheck="false" style="font-family: var(--font-mono, monospace); font-size: 12px"></textarea>
        </div>
        <span class="hint">A cloud-init user-data script that runs on every node of this pool at first boot.</span>
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
