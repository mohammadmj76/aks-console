/* ============================================================
   Mock catalog + seed data — scoped to AKS Phase 1 + 2.
   Phase 3/4 items (addons marketplace, private API, multi-region,
   GPU flavors, managed Velero, unified IAM) are intentionally
   absent — see AKS release plan / descope.
   ============================================================ */

export const REGION = {
  id: 'ir-central-1',
  name: 'Iran Central 1',
  location: 'Tehran',
  zones: [
    { id: 'foroogh', name: 'Foroogh' },
    { id: 'bamdad', name: 'Bamdad' },
    { id: 'simin', name: 'Simin' },
  ],
}

export const VERSIONS = [
  { id: '1.30', patch: '1.30.5', default: true },
  { id: '1.29', patch: '1.29.8' },
  { id: '1.28', patch: '1.28.7', deprecation: 'Support ends Mar 2027' },
]

/* Dedicated control plane — v1 model (one spec per cluster) */
export const CP_PLANS = [
  { id: 'cp-small',  name: 'Small',  vcpu: 2, ram: 4,  maxNodes: 10,  price: 9_500_000 },
  { id: 'cp-medium', name: 'Medium', vcpu: 4, ram: 8,  maxNodes: 50,  price: 19_000_000 },
  { id: 'cp-large',  name: 'Large',  vcpu: 8, ram: 16, maxNodes: 100, price: 38_000_000 },
]

/* General-purpose g* flavors only in Phase 1 (GPU is out of scope) */
export const FLAVORS = [
  { id: 'g4-2-4',   vcpu: 2,  ram: 4,   price: 4_200_000 },
  { id: 'g4-4-8',   vcpu: 4,  ram: 8,   price: 8_400_000 },
  { id: 'g4-8-16',  vcpu: 8,  ram: 16,  price: 16_800_000 },
  { id: 'g4-16-32', vcpu: 16, ram: 32,  price: 33_600_000 },
]

export const VOLUME_PRICE_PER_GB = 9_000 // ssd-g1, Toman / GB / month

export const VPCS = [
  {
    id: 'vpc-prod',
    name: 'vpc-prod',
    cidr: '172.31.0.0/16',
    subnets: [
      { id: 'sn-prod-foroogh', name: 'sn-prod-foroogh', cidr: '172.31.1.0/24', zone: 'foroogh' },
      { id: 'sn-prod-bamdad', name: 'sn-prod-bamdad', cidr: '172.31.2.0/24', zone: 'bamdad' },
      { id: 'sn-prod-simin', name: 'sn-prod-simin', cidr: '172.31.3.0/24', zone: 'simin' },
    ],
  },
  {
    id: 'vpc-staging',
    name: 'vpc-staging',
    cidr: '10.10.0.0/16',
    subnets: [
      { id: 'sn-stg-foroogh', name: 'sn-stg-foroogh', cidr: '10.10.1.0/24', zone: 'foroogh' },
      { id: 'sn-stg-bamdad', name: 'sn-stg-bamdad', cidr: '10.10.2.0/24', zone: 'bamdad' },
    ],
  },
]

export const POD_CIDRS = ['10.200.0.0/16', '10.201.0.0/16', '10.202.0.0/16']
export const SVC_CIDRS = ['10.96.0.0/16', '10.97.0.0/16', '10.98.0.0/16']

/* Day-1 platform components — bundled, not user-manageable addons
   (addons management ships in a later phase) */
export const INCLUDED_COMPONENTS = [
  { name: 'Cilium', version: '1.15', note: 'Default CNI with LB-IPAM' },
  { name: 'Block Storage CSI', version: '1.2', note: 'ssd-g1 volumes + snapshots' },
  { name: 'metrics-server', version: '0.7', note: 'Resource metrics pipeline' },
  { name: 'snapshot-controller', version: '8.0', note: 'Volume snapshot primitives' },
  { name: 'Cloud Controller (ACCM)', version: '1.0', note: 'Zones, provider IDs, LB sync' },
]

export const QUOTA = { clusters: 5, nodes: 60 } // per region, Phase 1 defaults

/* ---------- seed clusters ---------- */
export const SEED_CLUSTERS = [
  {
    id: 'aks-prodplatform01',
    name: 'prod-platform',
    description: 'Customer-facing API and web workloads',
    status: 'running',
    version: '1.30.5',
    region: 'ir-central-1',
    cp: { plan: 'cp-large', ha: true },
    vpcId: 'vpc-prod',
    subnetIds: ['sn-prod-foroogh', 'sn-prod-bamdad', 'sn-prod-simin'],
    podCidr: '10.200.0.0/16',
    svcCidr: '10.96.0.0/16',
    apiAccess: 'public',
    createdAt: '2026-09-12T09:20:00Z',
    etcdBackup: { enabled: true, lastRun: 'Today 02:00', restorePoints: 14 },
    monitoring: { enabled: true, endpoint: 'https://metrics.aks.ir-central-1.arvaninternal.ir/v1/prod-platform/prometheus' },
    auditLogs: true,
    pools: [
      {
        id: 'pool-8fa2',
        name: 'api-pool',
        flavor: 'g4-4-8',
        count: 3,
        zones: ['foroogh', 'bamdad', 'simin'],
        subnets: ['sn-prod-foroogh', 'sn-prod-bamdad', 'sn-prod-simin'],
        autoscale: { enabled: true, min: 3, max: 6 },
        volumeGb: 50,
      },
      {
        id: 'pool-3c19',
        name: 'worker-pool',
        flavor: 'g4-8-16',
        count: 4,
        zones: ['foroogh', 'bamdad'],
        subnets: ['sn-prod-foroogh', 'sn-prod-bamdad'],
        autoscale: { enabled: false, min: 4, max: 4 },
        volumeGb: 100,
      },
    ],
    usage: { cpu: 41, mem: 63, pods: 86 },
  },
  {
    id: 'aks-staging77',
    name: 'staging',
    description: 'Pre-production environment',
    status: 'upgrading',
    upgrade: { from: '1.29.8', to: '1.30.5' },
    version: '1.29.8',
    region: 'ir-central-1',
    cp: { plan: 'cp-small', ha: false },
    vpcId: 'vpc-staging',
    subnetIds: ['sn-stg-foroogh'],
    podCidr: '10.201.0.0/16',
    svcCidr: '10.97.0.0/16',
    apiAccess: 'public',
    createdAt: '2026-09-15T14:05:00Z',
    etcdBackup: { enabled: true, lastRun: 'Today 02:00', restorePoints: 3 },
    monitoring: { enabled: true, endpoint: 'https://metrics.aks.ir-central-1.arvaninternal.ir/v1/staging/prometheus' },
    auditLogs: false,
    pools: [
      {
        id: 'pool-b7e4',
        name: 'default-pool',
        flavor: 'g4-2-4',
        count: 2,
        zones: ['foroogh'],
        subnets: ['sn-stg-foroogh'],
        autoscale: { enabled: false, min: 2, max: 2 },
        volumeGb: 50,
      },
    ],
    usage: { cpu: 12, mem: 27, pods: 18 },
  },
  {
    id: 'aks-mlbatch03',
    name: 'ml-batch',
    description: 'Batch training and nightly jobs',
    status: 'running',
    version: '1.29.8',
    region: 'ir-central-1',
    cp: { plan: 'cp-medium', ha: true },
    vpcId: 'vpc-prod',
    subnetIds: ['sn-prod-simin'],
    podCidr: '10.202.0.0/16',
    svcCidr: '10.98.0.0/16',
    apiAccess: 'public',
    createdAt: '2026-09-18T08:41:00Z',
    etcdBackup: { enabled: true, lastRun: 'Today 02:00', restorePoints: 6 },
    monitoring: { enabled: false, endpoint: '' },
    auditLogs: true,
    pools: [
      {
        id: 'pool-52ab',
        name: 'batch-pool',
        flavor: 'g4-8-16',
        count: 3,
        zones: ['simin'],
        subnets: ['sn-prod-simin'],
        autoscale: { enabled: false, min: 3, max: 3 },
        volumeGb: 100,
      },
    ],
    usage: { cpu: 58, mem: 71, pods: 34 },
  },
]

export const SEED_EVENTS = {
  'aks-prodplatform01': [
    { ts: '10:42:07', type: 'Normal', reason: 'SuccessfulCreate', msg: 'Created pod: api-7f6d9c4b8-x2vqn' },
    { ts: '10:40:51', type: 'Normal', reason: 'NodeReady', msg: 'Node pool-a-7f2a1 became ready' },
    { ts: '09:58:13', type: 'Warning', reason: 'BackOff', msg: 'Back-off restarting failed container checkout in pod checkout-5d8f7b6c9-p4kzt' },
    { ts: '02:00:04', type: 'Normal', reason: 'EtcdBackupSucceeded', msg: 'Control-plane backup uploaded (14 restore points retained)' },
    { ts: '01:12:38', type: 'Normal', reason: 'ScaleDown', msg: 'Cluster autoscaler removed node pool-a-9d3c5 (underutilized)' },
  ],
  'aks-staging77': [
    { ts: '11:03:22', type: 'Normal', reason: 'UpgradeStarted', msg: 'Control-plane upgrade 1.29.8 → 1.30.5 started (KCP rolling replacement)' },
    { ts: '11:02:10', type: 'Normal', reason: 'PreChecksPassed', msg: 'Pre-upgrade checks and etcd backup completed' },
    { ts: '10:44:59', type: 'Warning', reason: 'PodDisruptionBudget', msg: 'Worker drain delayed by PDB default-deny in namespace shop' },
  ],
  'aks-mlbatch03': [
    { ts: '08:15:40', type: 'Normal', reason: 'SuccessfulCreate', msg: 'Created pod: trainer-0' },
    { ts: '02:00:09', type: 'Normal', reason: 'EtcdBackupSucceeded', msg: 'Control-plane backup uploaded (6 restore points retained)' },
  ],
  'aks-edgetest11': [
    { ts: '07:31:02', type: 'Warning', reason: 'CPUnreachable', msg: 'Control-plane VM cp-2 not reachable over 3 consecutive probes' },
    { ts: '07:33:44', type: 'Warning', reason: 'EtcdQuorumAtRisk', msg: 'etcd member lost — quorum retained, incident raised' },
  ],
}

export const API_HOST = 'aks.ir-central-1.arvaninternal.ir'

export function apiEndpoint(cluster) {
  return `https://api.${cluster.name}.${API_HOST}`
}

/* ---------- pricing ---------- */
export const fmtToman = (n) => n.toLocaleString('en-US')

export function monthlyPrice({ cp, pools }) {
  const cpPlan = CP_PLANS.find((p) => p.id === cp.plan)
  const cpCost = cpPlan.price * (cp.ha ? 3 : 1)
  let nodesCost = 0
  let volumeCost = 0
  for (const p of pools) {
    const f = FLAVORS.find((f) => f.id === p.flavor)
    nodesCost += f.price * p.count
    volumeCost += VOLUME_PRICE_PER_GB * p.volumeGb * p.count
  }
  return { cpCost, nodesCost, volumeCost, total: cpCost + nodesCost + volumeCost }
}

export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
