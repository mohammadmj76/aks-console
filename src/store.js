import { reactive } from 'vue'
import { SEED_CLUSTERS, SEED_EVENTS, API_HOST, apiEndpoint, VERSIONS, CP_PLANS } from './data'

let uid = 100
const nextId = () => String(++uid)

export const store = reactive({
  clusters: [...SEED_CLUSTERS],
  events: { ...SEED_EVENTS },
  toasts: [],
  clusterQuota: 5,

  toast(type, title, msg, ttl = 4500) {
    const id = nextId()
    this.toasts.push({ id, type, title, msg, open: false })
    requestAnimationFrame(() => {
      const t = this.toasts.find((t) => t.id === id)
      if (t) t.open = true
    })
    setTimeout(() => this.dismiss(id), ttl)
  },
  dismiss(id) {
    const i = this.toasts.findIndex((t) => t.id === id)
    if (i >= 0) this.toasts.splice(i, 1)
  },

  getCluster(id) {
    return this.clusters.find((c) => c.id === id)
  },

  /* draft comes from the single-page create form */
  createCluster(draft) {
    const ver = VERSIONS.find((v) => v.id === draft.version)
    const zoneOf = {}
    for (const v of VPCS_SAFE) for (const s of v.subnets) zoneOf[s.id] = s.zone
    const zones = [...new Set(draft.subnetIds.map((id) => zoneOf[id]).filter(Boolean))]

    const poolDraft = draft.pool
    const pools = poolDraft?.specs?.length
      ? [{
          id: 'pool-' + nextId(),
          name: poolDraft.name || 'node-pool-1',
          count: poolDraft.count || 1,
          specs: poolDraft.specs.map((s) => ({ flavorId: s.flavorId, zones: [...s.zones] })),
          zones,
          subnets: [...draft.subnetIds],
          volumeGb: 50,
          labels: [...(poolDraft.labels || [])],
          taints: (poolDraft.taints || []).filter((t) => t.key).map((t) => ({ ...t })),
          userData: poolDraft.userData || '',
        }]
      : []

    const cluster = {
      id: 'aks-' + draft.name.replace(/[^a-z0-9]/g, '').slice(0, 10) + nextId(),
      name: draft.name,
      description: draft.description || '',
      labels: draft.labels || [],
      status: 'provisioning',
      progress: 5,
      progressLabel: 'Allocating control plane',
      version: ver.patch,
      region: draft.regionId || 'ir-central-1',
      cp: { plan: draft.cp.plan, ha: draft.cp.ha ?? true },
      vpcId: draft.vpcId,
      subnetIds: [...draft.subnetIds],
      podCidr: draft.podCidr,
      svcCidr: draft.svcCidr,
      securityGroups: [...(draft.securityGroups || ['Default'])],
      apiAccess: 'public',
      createdAt: new Date().toISOString(),
      etcdBackup: { enabled: true, lastRun: '—', restorePoints: 0 },
      monitoring: { enabled: draft.monitoring ?? true, endpoint: draft.monitoring === false ? '' : `https://metrics.${API_HOST}/v1/${draft.name}/prometheus` },
      auditLogs: draft.auditLogs ?? false,
      pools,
      usage: { cpu: 0, mem: 0, pods: 0 },
    }
    this.clusters.unshift(cluster)
    this.events[cluster.id] = [
      { ts: timeNow(), type: 'Normal', reason: 'ClusterCreateStarted', msg: `Provisioning dedicated control plane (${cpPlanName(cluster)})` },
    ]
    if (pools.length) {
      this.events[cluster.id].push({ ts: timeNow(), type: 'Normal', reason: 'NodePoolCreated', msg: `Node pool ${pools[0].name} created (${pools[0].count} nodes)` })
    }
    this.simulateProvisioning(cluster)
    return cluster
  },

  simulateProvisioning(cluster) {
    const steps = [
      [20, 'Allocating control plane'],
      [45, 'Bootstrapping etcd + backup schedule'],
      [65, 'Installing Cilium and CSI drivers'],
      [80, 'Joining worker nodes'],
      [92, 'Finalizing cluster'],
    ]
    let i = 0
    const tick = () => {
      if (i < steps.length) {
        cluster.progress = steps[i][0]
        cluster.progressLabel = steps[i][1]
        i++
        setTimeout(tick, 1400)
      } else {
        cluster.status = 'running'
        cluster.progress = 100
        cluster.etcdBackup.lastRun = 'Today ' + timeNow()
        cluster.etcdBackup.restorePoints = 1
        cluster.usage = { cpu: 6, mem: 14, pods: 9 }
        this.events[cluster.id].unshift({ ts: timeNow(), type: 'Normal', reason: 'ClusterReady', msg: 'Cluster is ready — kubeconfig available' })
        this.toast('success', 'Cluster is ready', `${cluster.name} finished provisioning.`)
      }
    }
    setTimeout(tick, 900)
  },

  upgradeCluster(cluster, toVersion) {
    const target = VERSIONS.find((v) => v.id === toVersion)
    cluster.status = 'upgrading'
    cluster.upgrade = { from: cluster.version, to: target.patch }
    this.events[cluster.id].unshift({ ts: timeNow(), type: 'Normal', reason: 'UpgradeStarted', msg: `Control-plane upgrade ${cluster.version} → ${target.patch} started` })
    this.toast('info', 'Upgrade started', `${cluster.name} is upgrading to ${target.patch}.`)
    setTimeout(() => {
      cluster.version = target.patch
      cluster.status = 'running'
      delete cluster.upgrade
      this.events[cluster.id].unshift({ ts: timeNow(), type: 'Normal', reason: 'UpgradeSucceeded', msg: `Cluster upgraded to ${target.patch}` })
      this.toast('success', 'Upgrade complete', `${cluster.name} is now on ${target.patch}.`)
    }, 6000)
  },

  addPool(cluster, pool) {
    cluster.pools.push({
      labels: [],
      taints: [],
      userData: '',
      ...pool,
      id: 'pool-' + nextId(),
    })
    this.events[cluster.id].unshift({ ts: timeNow(), type: 'Normal', reason: 'NodePoolCreated', msg: `Node pool ${pool.name} created (${pool.count} nodes)` })
    this.toast('success', 'Node pool created', `${pool.name} is joining ${cluster.name}.`)
  },

  scalePool(cluster, pool, delta) {
    const next = pool.count + delta
    if (next < 1 || next > 20) return
    pool.count = next
    this.events[cluster.id].unshift({
      ts: timeNow(), type: 'Normal',
      reason: delta > 0 ? 'ScaleUp' : 'ScaleDown',
      msg: `Pool ${pool.name} scaled to ${next} node${next === 1 ? '' : 's'}`,
    })
  },

  removePool(cluster, pool) {
    cluster.pools = cluster.pools.filter((p) => p.id !== pool.id)
    this.events[cluster.id].unshift({ ts: timeNow(), type: 'Normal', reason: 'NodePoolDeleted', msg: `Node pool ${pool.name} deleted` })
    this.toast('info', 'Node pool deleted', `${pool.name} removed from ${cluster.name}.`)
  },

  deleteCluster(cluster) {
    this.clusters = this.clusters.filter((c) => c.id !== cluster.id)
    delete this.events[cluster.id]
    this.toast('info', 'Cluster deleted', `${cluster.name} was removed.`)
  },
})

import { VPCS as VPCS_SAFE } from './data'

function timeNow() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function cpPlanName(cluster) {
  return (CP_PLANS.find((p) => p.id === cluster.cp.plan) || {}).name || ''
}

/* kubeconfig download (mock) */
export function downloadKubeconfig(cluster) {
  const yaml = `apiVersion: v1
kind: Config
clusters:
- name: ${cluster.name}
  cluster:
    server: ${apiEndpoint(cluster)}
    certificate-authority-data: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCiMgZGVtbwotLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tCg==
contexts:
- name: ${cluster.name}
  context:
    cluster: ${cluster.name}
    user: ${cluster.name}-admin
current-context: ${cluster.name}
users:
- name: ${cluster.name}-admin
  user:
    token: <your-IAM-token>
`
  const blob = new Blob([yaml], { type: 'text/yaml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${cluster.name}-kubeconfig.yaml`
  a.click()
  URL.revokeObjectURL(a.href)
  store.toast('success', 'Kubeconfig downloaded', `${cluster.name}-kubeconfig.yaml`)
}

export function newerVersionAvailable(cluster) {
  const latest = VERSIONS[0].patch
  return cluster.status === 'running' && cluster.version !== latest
}
