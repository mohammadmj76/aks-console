<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store, downloadKubeconfig, newerVersionAvailable } from '../store'
import { REGION, VERSIONS, CP_PLANS, FLAVORS, VPCS, apiEndpoint, fmtDate, flavorName, flavorSpec } from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArToggle from '../components/ui/ArToggle.vue'
import ArSidePanel from '../components/ui/ArSidePanel.vue'
import ArProgress from '../components/ui/ArProgress.vue'
import ArEmpty from '../components/ui/ArEmpty.vue'
import ActionMenu from '../components/ui/ActionMenu.vue'
import StatCard from '../components/ui/StatCard.vue'
import AreaChart from '../components/ui/AreaChart.vue'
import ClusterStatus from '../components/ClusterStatus.vue'

const route = useRoute()
const router = useRouter()

const cluster = computed(() => store.getCluster(route.params.id))
const vpc = computed(() => VPCS.find((v) => v.id === cluster.value?.vpcId))
const events = computed(() => store.events[cluster.value?.id] || [])
const cpPlan = computed(() => CP_PLANS.find((p) => p.id === cluster.value?.cp.plan))
const nodeCount = computed(() => cluster.value?.pools.reduce((n, p) => n + p.count, 0) || 0)

const tab = ref('overview')
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'pools', label: 'Node pools' },
  { id: 'networking', label: 'Networking' },
  { id: 'operations', label: 'Operations' },
]

/* fake 24h usage series seeded per cluster */
function seedSeries(base, spread) {
  const out = []
  let v = base
  for (let i = 0; i < 24; i++) {
    v = Math.max(4, Math.min(96, v + (Math.sin(i * 1.7 + base) * spread + (Math.random() - 0.45) * spread)))
    out.push(Math.round(v))
  }
  return out
}
const chart = reactive({
  labels: ['00', '03', '06', '09', '12', '15', '18', '21'].map((h, i) => h + ':00'),
  cpu: [],
  mem: [],
})
function reseed() {
  if (!cluster.value) return
  const u = cluster.value.usage
  chart.cpu = seedSeries(u.cpu, 9)
  chart.mem = seedSeries(u.mem, 5)
}
reseed()
watch(cluster, reseed)
import { watch } from 'vue'

/* per-node mock rows */
function nodesOf(pool) {
  const f = FLAVORS.find((f) => f.id === pool.flavor)
  return Array.from({ length: pool.count }, (_, i) => ({
    name: `${pool.name}-${(pool.id + i * 7919).toString(36).slice(0, 5)}`,
    flavor: pool.flavor,
    zone: pool.zones.length ? pool.zones[i % pool.zones.length] : REGION.zones[i % REGION.zones.length].id,
    ip: `172.31.${(parseInt(pool.id.slice(-1), 36) % 9) + 1}.${10 + i}`,
    cpu: Math.round((cluster.value?.usage.cpu || 10) * (0.7 + ((i * 37) % 60) / 100)),
    ready: cluster.value?.status !== 'error',
  }))
}
const expandedPools = reactive({})

/* add pool panel */
const showAddPool = ref(false)
const poolForm = reactive({ name: '', flavor: 'g4-4-8', count: 2, zones: ['foroogh'], volumeGb: 50, autoscale: { enabled: false, min: 2, max: 4 } })
const poolFormOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(poolForm.name) && poolForm.count >= 1 && (!poolForm.autoscale.enabled || poolForm.autoscale.max >= poolForm.autoscale.min))
function submitPool() {
  if (!poolFormOk.value || !cluster.value) return
  const subnets = (vpc.value?.subnets || []).filter((s) => poolForm.zones.includes(s.zone)).map((s) => s.id)
  store.addPool(cluster.value, { ...poolForm, subnets: subnets.length ? subnets : [vpc.value?.subnets[0]?.id].filter(Boolean) })
  showAddPool.value = false
  poolForm.name = ''
}
function toggleZone(z) {
  const i = poolForm.zones.indexOf(z)
  i >= 0 ? poolForm.zones.splice(i, 1) : poolForm.zones.push(z)
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

/* copy endpoint */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    store.toast('success', 'Copied', 'Endpoint copied to clipboard.')
  } catch {
    store.toast('info', 'Copy failed', 'Copy the endpoint manually.')
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
          <span class="text-body-2 muted">{{ cluster.description || 'No description' }} · created {{ fmtDate(cluster.createdAt) }}</span>
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
        <span class="text-body-2-strong">Provisioning cluster…</span>
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
        <StatCard label="CPU" :value="String(cluster.usage.cpu) + '%'" badge="healthy" badge-tone="success">
          <ArProgress :value="cluster.usage.cpu" />
        </StatCard>
        <StatCard label="MEMORY" :value="String(cluster.usage.mem) + '%'" :badge="cluster.usage.mem >= 70 ? 'pressure' : 'healthy'" :badge-tone="cluster.usage.mem >= 70 ? 'warning' : 'success'">
          <ArProgress :value="cluster.usage.mem" />
        </StatCard>
        <StatCard label="PODS" :value="String(cluster.usage.pods)">
          <span class="text-caption-1 muted">across all namespaces</span>
        </StatCard>
      </div>

      <div class="charts-grid">
        <div class="ar-card chart-card">
          <div class="head">
            <div>
              <h3 class="text-title-3" style="margin: 0">Control plane</h3>
              <p class="text-caption-1 muted" style="margin: 2px 0 0">{{ cpPlan?.name }} · {{ cluster.cp.ha ? '3 nodes across ' + REGION.zones.map((z) => z.name).join(' / ') : 'single node' }}</p>
            </div>
            <span class="ar-badge success pill">etcd backup · {{ cluster.etcdBackup.restorePoints }} points</span>
          </div>
          <div class="kv">
            <div class="row"><span class="k" style="width: 140px">API endpoint</span><span class="v mono" style="font-size: 12px">{{ apiEndpoint(cluster) }}</span></div>
            <div class="row"><span class="k" style="width: 140px">etcd backup</span><span class="v">Daily · last run {{ cluster.etcdBackup.lastRun }}</span></div>
            <div class="row"><span class="k" style="width: 140px">Kubernetes</span><span class="v">v{{ cluster.version }}</span></div>
          </div>
        </div>

        <div class="ar-card chart-card">
          <div class="head">
            <div>
              <h3 class="text-title-3" style="margin: 0">Resource usage</h3>
              <p class="text-caption-1 muted" style="margin: 2px 0 0">Last 24 hours · cluster-wide</p>
            </div>
            <div class="legend" style="flex-direction: row; margin: 0; gap: var(--space-4)">
              <span class="row" style="border: 0; padding: 0"><span class="swatch" style="background: var(--bg-primary-t1-1-default)"></span>CPU</span>
              <span class="row" style="border: 0; padding: 0"><span class="swatch" style="background: var(--bg-info-t1-1-default)"></span>Memory</span>
            </div>
          </div>
          <AreaChart
            v-if="chart.cpu.length"
            :series="[
              { values: chart.cpu, color: 'var(--bg-primary-t1-1-default)' },
              { values: chart.mem, color: 'var(--bg-info-t1-1-default)' },
            ]"
            :labels="chart.labels"
            :max="100"
          />
        </div>
      </div>

      <div class="ar-card" style="padding: var(--space-6)">
        <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">Recent events</h3>
        <table class="ar-table">
          <thead>
            <tr><th style="width: 90px">Time</th><th style="width: 90px">Type</th><th style="width: 200px">Reason</th><th>Message</th></tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in events.slice(0, 6)" :key="i">
              <td class="mono muted">{{ e.ts }}</td>
              <td>
                <span class="ar-badge" :class="e.type === 'Warning' ? 'warning' : 'success'">{{ e.type }}</span>
              </td>
              <td class="text-body-2-strong">{{ e.reason }}</td>
              <td class="text-body-2 muted">{{ e.msg }}</td>
            </tr>
          </tbody>
        </table>
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
              {{ flavorName(pool.flavor) }} ({{ pool.flavor }} · {{ flavorSpec(pool.flavor) }}) · {{ pool.count }} node{{ pool.count === 1 ? '' : 's' }} · ssd-g1 {{ pool.volumeGb }} GB
              · {{ pool.zones.length ? pool.zones.map((z) => REGION.zones.find((zz) => zz.id === z)?.name).join(', ') : 'all zones' }}
            </div>
          </div>
          <span v-if="pool.autoscale.enabled" class="ar-badge primary pill">autoscale {{ pool.autoscale.min }}–{{ pool.autoscale.max }}</span>
          <div style="display: flex; align-items: center; gap: var(--space-2)">
            <div class="count-input" style="height: 30px">
              <button class="sm" style="width: 28px" :disabled="cluster.status !== 'running' || pool.count <= (pool.autoscale.enabled ? pool.autoscale.min : 1)" @click="store.scalePool(cluster, pool, -1)">−</button>
              <input :value="pool.count" readonly style="width: 40px; font-size: 13px" />
              <button class="sm" style="width: 28px" :disabled="cluster.status !== 'running' || pool.count >= (pool.autoscale.enabled ? Math.max(pool.autoscale.max, pool.count) : 20)" @click="store.scalePool(cluster, pool, 1)">+</button>
            </div>
            <ActionMenu
              :items="[
                { label: pool.autoscale.enabled ? 'Disable autoscaling' : 'Enable autoscaling', action: 'autoscale' },
                { sep: true },
                { label: 'Delete pool', danger: true, disabled: cluster.pools.length <= 1, action: 'delete' },
              ]"
              @select="(i) => {
                if (i.action === 'delete') store.removePool(cluster, pool)
                if (i.action === 'autoscale') { pool.autoscale.enabled = !pool.autoscale.enabled; store.toast('info', 'Autoscaling ' + (pool.autoscale.enabled ? 'enabled' : 'disabled'), pool.name) }
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

    <!-- ================= ADD NODE POOL ================= -->
    <ArSidePanel :open="showAddPool" title="Add node pool" :subtitle="cluster.name" @close="showAddPool = false">
      <div class="ar-field">
        <label>Pool name<span class="req">*</span></label>
        <div class="ar-input" :class="{ 'error-mode': poolForm.name && !poolFormOk && !/^[a-z]/.test(poolForm.name) === false && !/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(poolForm.name) }">
          <input v-model="poolForm.name" placeholder="e.g. worker-pool" spellcheck="false" style="text-transform: lowercase" />
        </div>
        <span class="hint">Lowercase letters, digits and dashes. 3–40 characters.</span>
      </div>

      <div class="ar-field">
        <span class="ar-field-label">Flavor<span class="req">*</span></span>
        <div class="plan-grid cols-2">
          <div v-for="f in FLAVORS" :key="f.id" class="ar-card selectable plan" :class="{ selected: poolForm.flavor === f.id }" @click="poolForm.flavor = f.id">
            <span class="p-check"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
            <div class="p-name">{{ f.id }}</div>
            <div class="p-spec">{{ f.vcpu }} vCPU · {{ f.ram }} GB RAM</div>
          </div>
        </div>
      </div>

      <div class="ar-field">
        <span class="ar-field-label">Availability zones</span>
        <div class="chip-row">
          <button v-for="z in REGION.zones" :key="z.id" class="chip" :class="{ on: poolForm.zones.includes(z.id) }" @click="toggleZone(z.id)">
            <span class="tick"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
            {{ z.name }}
          </button>
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

      <div style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3)">
        <label style="display: flex; align-items: center; gap: var(--space-3); cursor: pointer">
          <ArToggle v-model="poolForm.autoscale.enabled" />
          <span>
            <span class="text-body-2-strong">Autoscaling</span>
            <span class="text-caption-1 muted" style="display: block">Scale between min and max on pending pods.</span>
          </span>
        </label>
        <div v-if="poolForm.autoscale.enabled" style="display: flex; gap: var(--space-3)">
          <div class="ar-field" style="width: 110px">
            <label>Min nodes</label>
            <div class="ar-input"><input v-model.number="poolForm.autoscale.min" type="number" min="1" max="20" /></div>
          </div>
          <div class="ar-field" style="width: 110px">
            <label>Max nodes</label>
            <div class="ar-input"><input v-model.number="poolForm.autoscale.max" type="number" min="1" max="20" /></div>
          </div>
        </div>
      </div>

      <template #footer>
        <ArButton variant="tertiary" @click="showAddPool = false">Cancel</ArButton>
        <ArButton variant="primary" :disabled="!poolFormOk" @click="submitPool">Add pool</ArButton>
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
