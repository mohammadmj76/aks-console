/* ============================================================
   Mock catalog + seed data — scoped to AKS Phase 1 + 2.
   Phase 3/4 items (addons marketplace, private API, multi-region,
   GPU flavors, managed Velero, unified IAM) are intentionally
   absent — see AKS release plan / descope.
   ============================================================ */

export const REGION = {
  id: 'ir-central-1',
  name: 'Iran Central',
  location: 'Tehran',
  zones: [
    { id: 'foroogh', name: 'Foroogh' },
    { id: 'bamdad', name: 'Bamdad' },
    { id: 'simin', name: 'Simin' },
  ],
}

/* Regions shown on the create page — only Iran Central is live */
export const REGIONS = [
  { ...REGION, flag: 'ir', enabled: true },
  { id: 'ir-nw-1', name: 'Iran NorthWest', location: 'Tabriz', zones: [], flag: 'ir', enabled: false },
  { id: 'eu-west-1', name: 'Europe West', location: 'Paris', zones: [], flag: 'fr', enabled: false },
  { id: 'ir-sw-1', name: 'Iran Southwest', location: 'Ahvaz', zones: [], flag: 'ir', enabled: false, badge: 'New' },
]

export const VERSIONS = [
  { id: '1.36', patch: '1.36.3', default: true },
  { id: '1.35', patch: '1.35.4' },
  { id: '1.34', patch: '1.34.8', deprecation: 'Support ends Mar 2027' },
]

/* Cluster types — dedicated control-plane specs (price in IRR/day) */
export const CP_PLANS = [
  { id: 'xsmall',  name: 'xSmall', vcpu: 2,  ram: 8,  maxNodes: 50,   pricePerDay: 1_800_000 },
  { id: 'small',   name: 'Small',  vcpu: 4,  ram: 16, maxNodes: 100,  pricePerDay: 3_600_000 },
  { id: 'medium',  name: 'Medium', vcpu: 4,  ram: 32, maxNodes: 250,  pricePerDay: 7_200_000 },
  { id: 'large',   name: 'Large',  vcpu: 8,  ram: 32, maxNodes: 500,  pricePerDay: 14_400_000 },
  { id: 'xlarge',  name: 'XLarge', vcpu: 16, ram: 64, maxNodes: 1000, pricePerDay: 28_800_000 },
]

/* Worker flavors (price in IRR/month per node) */
export const FLAVORS = [
  { id: 'g4-2-4',   name: 'Basic',       vcpu: 2,  ram: 4,  price: 21_000_000,  helper: 'Cost-optimized for light workloads.' },
  { id: 'g4-4-8',   name: 'Standard',    vcpu: 4,  ram: 8,  price: 42_000_000,  helper: 'Balanced configuration for running general workloads.' },
  { id: 'g4-8-16',  name: 'Performance', vcpu: 8,  ram: 16, price: 84_000_000,  helper: 'Compute-optimized for demanding workloads.' },
  { id: 'g4-16-32', name: 'Memory',      vcpu: 16, ram: 32, price: 168_000_000, helper: 'Memory-optimized for data-heavy services.' },
]

export const flavorName = (id) => FLAVORS.find((f) => f.id === id)?.name || id
export const flavorSpec = (id) => {
  const f = FLAVORS.find((f) => f.id === id)
  return f ? `${f.vcpu} vCPU · ${f.ram} GB RAM` : id
}

export const VOLUME_PRICE_PER_GB = 90_000 // ssd-g1, IRR / GB / month

export const VPCS = [
  {
    id: 'vpc-prod',
    name: 'VPC-Name',
    cidr: '192.168.0.0/16',
    subnets: [
      { id: 'sn-prod-foroogh', name: 'Subnet Name', cidr: '192.168.1.1/24', zone: 'foroogh' },
      { id: 'sn-prod-bamdad', name: 'Subnet Name 2', cidr: '192.168.2.0/24', zone: 'bamdad' },
      { id: 'sn-prod-simin', name: 'Subnet Name 3', cidr: '192.168.3.0/24', zone: 'simin' },
    ],
  },
  {
    id: 'vpc-staging',
    name: 'VPC-Staging',
    cidr: '10.10.0.0/16',
    subnets: [
      { id: 'sn-stg-foroogh', name: 'Staging Subnet 1', cidr: '10.10.1.0/24', zone: 'foroogh' },
      { id: 'sn-stg-bamdad', name: 'Staging Subnet 2', cidr: '10.10.2.0/24', zone: 'bamdad' },
    ],
  },
]

export const FIREWALL_GROUPS = ['Default', 'Internal Traffic', 'Web Traffic', 'SSH Restricted']

export const CIDR_PREFIXES = ['8', '12', '16', '17', '18', '20', '22', '24', '26', '28']

/* Day-1 platform components — bundled, not user-manageable addons
   (addons management ships in a later phase) */
export const INCLUDED_COMPONENTS = [
  { name: 'Cilium', version: '1.15', note: 'Default CNI with LB-IPAM' },
  { name: 'Block Storage CSI', version: '1.2', note: 'ssd-g1 volumes + snapshots' },
  { name: 'metrics-server', version: '0.7', note: 'Resource metrics pipeline' },
  { name: 'snapshot-controller', version: '8.0', note: 'Volume snapshot primitives' },
  { name: 'Cloud Controller (ACCM)', version: '1.0', note: 'Zones, provider IDs, LB sync' },
]

export const QUOTA = { clusters: 5, nodes: 250 } // per region, Phase 1 defaults

/* ---------- seed clusters ---------- */
export const SEED_CLUSTERS = [
  {
    id: 'aks-prodplatform01',
    name: 'prod-platform',
    description: 'Customer-facing API and web workloads',
    labels: ['prod', 'customer-facing'],
    status: 'running',
    version: '1.36.3',
    region: 'ir-central-1',
    cp: { plan: 'medium', ha: true },
    clusterSize: 50,
    vpcId: 'vpc-prod',
    subnetIds: ['sn-prod-foroogh', 'sn-prod-bamdad', 'sn-prod-simin'],
    podCidr: '192.168.0.0/16',
    svcCidr: '10.10.0.0/24',
    securityGroups: ['Default', 'Internal Traffic'],
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
    labels: ['staging'],
    status: 'upgrading',
    upgrade: { from: '1.35.4', to: '1.36.3' },
    version: '1.35.4',
    region: 'ir-central-1',
    cp: { plan: 'xsmall', ha: true },
    clusterSize: 50,
    vpcId: 'vpc-staging',
    subnetIds: ['sn-stg-foroogh'],
    podCidr: '10.200.0.0/16',
    svcCidr: '10.96.0.0/24',
    securityGroups: ['Default'],
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
    labels: ['batch'],
    status: 'running',
    version: '1.35.4',
    region: 'ir-central-1',
    cp: { plan: 'small', ha: true },
    clusterSize: 100,
    vpcId: 'vpc-prod',
    subnetIds: ['sn-prod-simin'],
    podCidr: '10.202.0.0/16',
    svcCidr: '10.98.0.0/24',
    securityGroups: ['Default'],
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
    { ts: '10:40:51', type: 'Normal', reason: 'NodeReady', msg: 'Node api-pool-7f2a1 became ready' },
    { ts: '09:58:13', type: 'Warning', reason: 'BackOff', msg: 'Back-off restarting failed container checkout in pod checkout-5d8f7b6c9-p4kzt' },
    { ts: '02:00:04', type: 'Normal', reason: 'EtcdBackupSucceeded', msg: 'Control-plane backup uploaded (14 restore points retained)' },
    { ts: '01:12:38', type: 'Normal', reason: 'ScaleDown', msg: 'Cluster autoscaler removed node api-pool-9d3c5 (underutilized)' },
  ],
  'aks-staging77': [
    { ts: '11:03:22', type: 'Normal', reason: 'UpgradeStarted', msg: 'Control-plane upgrade 1.35.4 → 1.36.3 started (KCP rolling replacement)' },
    { ts: '11:02:10', type: 'Normal', reason: 'PreChecksPassed', msg: 'Pre-upgrade checks and etcd backup completed' },
    { ts: '10:44:59', type: 'Warning', reason: 'PodDisruptionBudget', msg: 'Worker drain delayed by PDB default-deny in namespace shop' },
  ],
  'aks-mlbatch03': [
    { ts: '08:15:40', type: 'Normal', reason: 'SuccessfulCreate', msg: 'Created pod: trainer-0' },
    { ts: '02:00:09', type: 'Normal', reason: 'EtcdBackupSucceeded', msg: 'Control-plane backup uploaded (6 restore points retained)' },
  ],
}

export const API_HOST = 'aks.ir-central-1.arvaninternal.ir'

export function apiEndpoint(cluster) {
  return `https://api.${cluster.name}.${API_HOST}`
}

/* ---------- pricing (IRR) ---------- */
export const fmtIRR = (n) => n.toLocaleString('en-US')

export function monthlyPrice({ cp, pools }) {
  const cpPlan = CP_PLANS.find((p) => p.id === cp.plan)
  const cpCost = (cpPlan?.pricePerDay || 0) * 30
  let nodesCost = 0
  let volumeCost = 0
  for (const p of pools) {
    const f = FLAVORS.find((f) => f.id === p.flavor)
    nodesCost += (f?.price || 0) * p.count
    volumeCost += VOLUME_PRICE_PER_GB * (p.volumeGb || 50) * p.count
  }
  const total = cpCost + nodesCost + volumeCost
  return {
    cpCost,
    nodesCost,
    volumeCost,
    total,
    hourly: Math.max(1_000, Math.round(total / 730 / 1_000) * 1_000),
  }
}

export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/* Backwards-compat alias */
export const fmtToman = fmtIRR
