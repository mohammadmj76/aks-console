<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { store } from '../store'
import { REGION, VPCS, FLAVOR_CATALOG, fmtDate, flavorName } from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArBadge from '../components/ui/ArBadge.vue'
import ArProgress from '../components/ui/ArProgress.vue'
import ArEmpty from '../components/ui/ArEmpty.vue'
import PoolActions from '../components/PoolActions.vue'
import StatCard from '../components/ui/StatCard.vue'
import ClusterStatus from '../components/ClusterStatus.vue'

const route = useRoute()

const cluster = computed(() => store.getCluster(route.params.id))
const pool = computed(() => cluster.value?.pools.find((p) => p.id === route.params.poolId))

const tab = ref('nodes')
const tabs = [
  { id: 'nodes', label: 'Nodes' },
  { id: 'config', label: 'Configuration' },
  { id: 'events', label: 'Events' },
]

/* pool flavor ids (multi-spec pools supported) */
const flavorIds = computed(() => {
  const p = pool.value
  if (!p) return []
  return p.specs?.length ? p.specs.map((s) => s.flavorId) : [p.flavor].filter(Boolean)
})
const poolFlavors = computed(() => flavorIds.value.map((id) => FLAVOR_CATALOG.find((f) => f.id === id)).filter(Boolean))

/* per-node mock rows — same derivation as the cluster page pool card */
const nodes = computed(() => {
  const p = pool.value
  if (!cluster.value || !p) return []
  return Array.from({ length: p.count }, (_, i) => ({
    name: `${p.name}-${(p.id + i * 7919).toString(36).slice(0, 5)}`,
    flavor: flavorIds.value[i % flavorIds.value.length],
    zone: p.zones.length ? p.zones[i % p.zones.length] : REGION.zones[i % REGION.zones.length].id,
    ip: `172.31.${(parseInt(p.id.slice(-1), 36) % 9) + 1}.${10 + i}`,
    cpu: Math.round((cluster.value.usage.cpu || 10) * (0.7 + ((i * 37) % 60) / 100)),
    mem: Math.round((cluster.value.usage.mem || 20) * (0.6 + ((i * 53) % 55) / 100)),
    ready: cluster.value.status !== 'error',
  }))
})
const readyCount = computed(() => nodes.value.filter((n) => n.ready).length)

/* aggregate capacity: node i runs flavor i % flavors.length (matches the rows above) */
const caps = computed(() => {
  let vcpu = 0, ram = 0, pods = 0
  const fs = poolFlavors.value
  for (let i = 0; i < (pool.value?.count || 0); i++) {
    const f = fs[i % fs.length]
    vcpu += f?.vcpu || 0
    ram += f?.ram || 0
    pods += f?.maxPods || 0
  }
  return { vcpu, ram, pods }
})

const zoneNames = computed(() => {
  const p = pool.value
  if (!p) return []
  const zs = p.zones.length ? p.zones : REGION.zones.map((z) => z.id)
  return zs.map((z) => REGION.zones.find((zz) => zz.id === z)?.name).filter(Boolean)
})

const vpc = computed(() => VPCS.find((v) => v.id === cluster.value?.vpcId))
const poolSubnets = computed(() => {
  const ids = pool.value?.subnets || cluster.value?.subnetIds || []
  return ids.map((sid) => vpc.value?.subnets.find((s) => s.id === sid)).filter(Boolean)
})

/* O&M events mentioning this pool */
const poolEvents = computed(() =>
  (store.events[cluster.value?.id] || []).filter((e) => pool.value && e.msg.includes(pool.value.name))
)
</script>

<template>
  <main v-if="cluster && pool" class="page">
    <div class="crumbs">
      <router-link to="/clusters">Kubernetes</router-link>
      <span class="sep">/</span>
      <router-link to="/clusters">Clusters</router-link>
      <span class="sep">/</span>
      <router-link :to="{ path: `/clusters/${cluster.id}`, query: { tab: 'pools' } }">{{ cluster.name }}</router-link>
      <span class="sep">/</span>
      <span class="here">{{ pool.name }}</span>
    </div>

    <div class="page-header">
      <div>
        <div class="title-row">
          <h1 class="text-title-2" style="margin: 0">{{ pool.name }}</h1>
          <ClusterStatus :status="cluster.status" />
        </div>
        <div class="meta">
          <span class="text-body-2 muted">
            {{ flavorIds.map((id) => flavorName(id)).join(', ') }} ·
            {{ pool.count }} node{{ pool.count === 1 ? '' : 's' }} · ssd-g1 {{ pool.volumeGb }} GB ·
            {{ zoneNames.join(', ') }} · created {{ fmtDate(pool.createdAt || cluster.createdAt) }}
          </span>
        </div>
      </div>
      <div style="display: flex; gap: var(--space-2); align-items: center">
        <PoolActions :cluster="cluster" :pool="pool" />
      </div>
    </div>

    <div class="stats-grid">
      <StatCard
        label="NODES"
        :value="String(pool.count)"
        :unit="`of 20 scale max`"
        :badge="readyCount === pool.count ? 'All ready' : `${readyCount}/${pool.count} ready`"
        :badge-tone="readyCount === pool.count ? 'success' : 'warning'"
      >
        <span class="text-caption-1 muted">across {{ zoneNames.length }} availability zone{{ zoneNames.length === 1 ? '' : 's' }}</span>
      </StatCard>
      <StatCard label="TOTAL vCPU" :value="String(caps.vcpu)" unit="vCPUs">
        <span class="text-caption-1 muted">{{ pool.count }} × {{ poolFlavors.map((f) => f.vcpu).join('/') }} per node</span>
      </StatCard>
      <StatCard label="TOTAL MEMORY" :value="String(caps.ram)" unit="GiB">
        <span class="text-caption-1 muted">{{ pool.count }} × {{ poolFlavors.map((f) => f.ram).join('/') }} GB per node</span>
      </StatCard>
      <StatCard label="POD CAPACITY" :value="String(caps.pods)" unit="max pods">
        <span class="text-caption-1 muted">allocatable across {{ pool.count }} node{{ pool.count === 1 ? '' : 's' }}</span>
      </StatCard>
    </div>

    <nav class="ar-tabs" style="margin-bottom: var(--space-6)">
      <button v-for="t in tabs" :key="t.id" class="ar-tab" :class="{ active: tab === t.id }" @click="tab = t.id">
        {{ t.label }}
        <span v-if="t.id === 'nodes'" class="count">{{ pool.count }}</span>
        <span v-if="t.id === 'events' && poolEvents.length" class="count">{{ poolEvents.length }}</span>
      </button>
    </nav>

    <!-- ================= NODES ================= -->
    <template v-if="tab === 'nodes'">
      <div class="ar-card" style="padding: 0 var(--space-2)">
        <table class="ar-table">
          <thead>
            <tr><th>Node</th><th>Status</th><th>Flavor</th><th>Zone</th><th>Internal IP</th><th style="width: 180px">CPU</th><th style="width: 180px">Memory</th></tr>
          </thead>
          <tbody>
            <tr v-for="n in nodes" :key="n.name">
              <td class="mono">{{ n.name }}</td>
              <td>
                <ArBadge :variant="n.ready ? 'success' : 'danger'" :prepend-icon="n.ready ? 'check-circle' : 'error'" :text="n.ready ? 'Ready' : 'NotReady'" />
              </td>
              <td class="text-body-2 muted">{{ flavorName(n.flavor) }}</td>
              <td class="text-body-2 muted">{{ REGION.zones.find((z) => z.id === n.zone)?.name }}</td>
              <td class="mono muted">{{ n.ip }}</td>
              <td><ArProgress :value="n.cpu" :label="n.cpu + '%'" /></td>
              <td><ArProgress :value="n.mem" :label="n.mem + '%'" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-caption-1 muted" style="margin-top: var(--space-3)">
        Scaling the pool adds or drains nodes one by one; volumes stay attached to their nodes.
      </p>
    </template>

    <!-- ================= CONFIGURATION ================= -->
    <template v-if="tab === 'config'">
      <div class="charts-grid" style="grid-template-columns: 1fr 1fr">
        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">General</h3>
          <div class="kv">
            <div class="row"><span class="k" style="width: 120px">Pool name</span><span class="v mono">{{ pool.name }}</span></div>
            <div class="row"><span class="k" style="width: 120px">Cluster</span><span class="v"><router-link :to="`/clusters/${cluster.id}`" class="pool-name-link">{{ cluster.name }}</router-link></span></div>
            <div class="row"><span class="k" style="width: 120px">Status</span><span class="v"><ClusterStatus :status="cluster.status" /></span></div>
            <div class="row"><span class="k" style="width: 120px">Created</span><span class="v">{{ fmtDate(pool.createdAt || cluster.createdAt) }}</span></div>
            <div class="row"><span class="k" style="width: 120px">Pool ID</span><span class="v mono muted">{{ pool.id }}</span></div>
          </div>
        </div>

        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">Compute</h3>
          <div class="kv">
            <div class="row">
              <span class="k" style="width: 120px">Flavor{{ poolFlavors.length > 1 ? 's' : '' }}</span>
              <span class="v" style="display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start">
                <ArBadge v-for="f in poolFlavors" :key="f.id" variant="neutral" :text="`${f.id} · ${f.vcpu} vCPU / ${f.ram} GB · ${f.category}`" />
              </span>
            </div>
            <div class="row"><span class="k" style="width: 120px">Node count</span><span class="v">{{ pool.count }}</span></div>
            <div class="row"><span class="k" style="width: 120px">Root volume</span><span class="v">ssd-g1 · {{ pool.volumeGb }} GB per node</span></div>
            <div class="row">
              <span class="k" style="width: 120px">Zones</span>
              <span class="v" style="display: flex; flex-wrap: wrap; gap: var(--space-1)">
                <ArBadge v-for="z in zoneNames" :key="z" variant="neutral" :text="z" />
              </span>
            </div>
            <div class="row">
              <span class="k" style="width: 120px">Subnets</span>
              <span class="v" style="display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start">
                <ArBadge v-for="s in poolSubnets" :key="s.id" variant="neutral" :text="`${s.name} · ${s.cidr} · ${REGION.zones.find((z) => z.id === s.zone)?.name}`" />
              </span>
            </div>
          </div>
        </div>

        <div class="ar-card" style="padding: var(--space-6); grid-column: 1 / -1">
          <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">Kubernetes</h3>
          <div class="kv">
            <div class="row"><span class="k" style="width: 120px">OS image</span><span class="v mono">{{ pool.image || 'ubuntu-22.04' }}</span></div>
            <div class="row">
              <span class="k" style="width: 120px">Labels</span>
              <span v-if="pool.labels?.length" class="v pool-meta">
                <ArBadge v-for="l in pool.labels" :key="l" variant="neutral" :text="l" />
              </span>
              <span v-else class="v muted">—</span>
            </div>
            <div class="row">
              <span class="k" style="width: 120px">Taints</span>
              <span v-if="pool.taints?.length" class="v pool-meta">
                <ArBadge v-for="(t, i) in pool.taints" :key="'t' + i" variant="warning" prepend-icon="warning" :text="`${t.key}${t.value ? '=' + t.value : ''}:${t.effect}`" />
              </span>
              <span v-else class="v muted">—</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ================= EVENTS ================= -->
    <template v-if="tab === 'events'">
      <div v-if="poolEvents.length" class="ar-card" style="padding: 0 var(--space-2)">
        <table class="ar-table">
          <thead>
            <tr><th style="width: 90px">Time</th><th style="width: 110px">Level</th><th style="width: 200px">Reason</th><th>Message</th></tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in poolEvents" :key="i">
              <td class="mono muted">{{ e.ts }}</td>
              <td><ArBadge :variant="e.type === 'Warning' ? 'warning' : 'neutral'" :prepend-icon="e.type === 'Warning' ? 'warning' : ''" :text="e.type === 'Warning' ? 'Warning' : 'Info'" /></td>
              <td class="text-body-2">{{ e.reason }}</td>
              <td class="text-body-2 muted">{{ e.msg }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="ar-card">
        <ArEmpty title="No pool events" desc="Control-plane events that mention this pool will appear here." />
      </div>
      <p class="text-caption-1 muted" style="margin-top: var(--space-3)">
        Full cluster event history — including Kubernetes workload events — is on the cluster's
        <router-link :to="{ path: `/clusters/${cluster.id}`, query: { tab: 'events' } }" class="pool-name-link">Events tab</router-link>.
      </p>
    </template>
  </main>

  <main v-else class="page">
    <div class="ar-card">
      <ArEmpty title="Node pool not found" desc="This pool may have been deleted.">
        <router-link to="/clusters" class="ar-btn secondary sm" style="text-decoration: none">Back to clusters</router-link>
      </ArEmpty>
    </div>
  </main>
</template>
