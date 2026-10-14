/* ============================================================
   Mock catalog + seed data — scoped to AKS Phase 1 + 2.
   Phase 3/4 items (addons marketplace, private API, multi-region,
   GPU flavors, autoscaling, managed Velero, unified IAM) are
   intentionally absent — see AKS release plan / descope.
   ============================================================ */

export const REGION = {
  id: 'ir-central-1',
  name: 'Iran Central',
  location: 'Tehran',
  zones: [
    { id: 'foroogh', name: 'Forough' },
    { id: 'bamdad', name: 'Bamdad' },
    { id: 'simin', name: 'Simin' },
  ],
}

/* Regions shown on the create page — only Iran Central is live */
export const REGIONS = [
  { id: 'ir-central-1', name: 'Iran Central', zones: ['Bamdad', 'Forough', 'Simin'], flag: 'ir', enabled: true },
  { id: 'ir-nw-1', name: 'Iran NorthWest', zones: ['Shahriar'], flag: 'ir', enabled: false },
  { id: 'eu-west-1', name: 'Europe West', zones: ['Goethe'], flag: 'de', enabled: false },
  { id: 'ir-sw-1', name: 'Iran Southwest', zones: ['Qeysar'], flag: 'ir', enabled: false, badge: 'New' },
]

export const VERSIONS = [
  { id: '1.36', patch: '1.36.3', default: true, endOfCycle: 'Jun 28, 2027' },
  { id: '1.35', patch: '1.35.4', endOfCycle: 'Feb 28, 2027' },
  { id: '1.34', patch: '1.34.8', endOfCycle: 'Oct 28, 2026' },
]

/* Cluster types — dedicated control-plane specs (price in IRR/day) */
export const CP_PLANS = [
  { id: 'xsmall',  name: 'xSmall', vcpu: 2,  ram: 8,  replicas: 3, maxNodes: 50,   etcdSize: '4 GB',  pricePerDay: 1_800_000 },
  { id: 'small',   name: 'Small',  vcpu: 4,  ram: 16, replicas: 3, maxNodes: 100,  etcdSize: '8 GB',  pricePerDay: 3_600_000 },
  { id: 'medium',  name: 'Medium', vcpu: 4,  ram: 32, replicas: 5, maxNodes: 250,  etcdSize: '16 GB', pricePerDay: 7_200_000 },
  { id: 'large',   name: 'Large',  vcpu: 8,  ram: 32, replicas: 5, maxNodes: 500,  etcdSize: '32 GB', pricePerDay: 14_400_000 },
]

/* ---------- flavor catalog (worker nodes) ---------- */
const AZS = () => [
  { id: 'foroogh', name: 'Forough', soldOut: false },
  { id: 'bamdad', name: 'Bamdad', soldOut: false },
  { id: 'simin', name: 'Simin', soldOut: false },
]
const azs = (soldOut = []) =>
  AZS().map((z) => (soldOut.includes(z.id) ? { ...z, soldOut: true } : z))

export const FLAVOR_CATALOG = [
  // Basic
  { id: 'g6.large.2',    category: 'Basic', vcpu: 2,  ram: 4,  azs: azs(),                   bandwidth: '0.8 / 4.0 Gbit/s',   pps: '400,000',   cpu: 'Intel Ice Lake 2.6GHz',  maxPods: 16,  pricePerHour: 68_685 },
  { id: 'g6.large.4',    category: 'Basic', vcpu: 2,  ram: 8,  azs: azs(),                   bandwidth: '0.8 / 4.0 Gbit/s',   pps: '400,000',   cpu: 'Intel Ice Lake 2.6GHz',  maxPods: 16,  pricePerHour: 93_669 },
  { id: 'g6.xlarge.2',   category: 'Basic', vcpu: 4,  ram: 8,  azs: azs(),                   bandwidth: '1.6 / 8.0 Gbit/s',   pps: '800,000',   cpu: 'Intel Ice Lake 2.6GHz',  maxPods: 32,  pricePerHour: 137_370 },
  { id: 'g6.xlarge.4',   category: 'Basic', vcpu: 4,  ram: 16, azs: azs(['bamdad', 'simin']), bandwidth: '1.6 / 8.0 Gbit/s',  pps: '800,000',   cpu: 'Intel Ice Lake 2.6GHz',  maxPods: 32,  pricePerHour: 187_338 },
  { id: 'g6.2xlarge.2',  category: 'Basic', vcpu: 8,  ram: 16, azs: azs(),                   bandwidth: '3.0 / 15.0 Gbit/s',  pps: '1,500,000', cpu: 'Intel Ice Lake 2.6GHz',  maxPods: 64,  pricePerHour: 274_740 },
  // Standard
  { id: 's6.large.2',    category: 'Standard', vcpu: 2,  ram: 4,  azs: azs(),                        bandwidth: '0.5 / 2.0 Gbit/s',  pps: '200,000',   cpu: 'Intel Sky Lake 2.4GHz', maxPods: 16,  pricePerHour: 52_000 },
  { id: 's6.large.4',    category: 'Standard', vcpu: 2,  ram: 8,  azs: azs(),                        bandwidth: '0.5 / 2.0 Gbit/s',  pps: '200,000',   cpu: 'Intel Sky Lake 2.4GHz', maxPods: 16,  pricePerHour: 78_000 },
  { id: 's6.xlarge.2',   category: 'Standard', vcpu: 4,  ram: 8,  azs: azs(['simin']),               bandwidth: '1.0 / 4.0 Gbit/s',  pps: '400,000',   cpu: 'Intel Sky Lake 2.4GHz', maxPods: 32,  pricePerHour: 104_000 },
  { id: 's6.2xlarge.2',  category: 'Standard', vcpu: 8,  ram: 16, azs: azs(),                        bandwidth: '2.0 / 8.0 Gbit/s',  pps: '800,000',   cpu: 'Intel Sky Lake 2.4GHz', maxPods: 64,  pricePerHour: 208_000 },
  // Premium
  { id: 'm6.large.4',    category: 'Premium', vcpu: 2,  ram: 8,  azs: azs(),                          bandwidth: '0.8 / 4.0 Gbit/s',  pps: '300,000',   cpu: 'Intel Ice Lake 2.6GHz', maxPods: 16,  pricePerHour: 96_000 },
  { id: 'm6.xlarge.4',   category: 'Premium', vcpu: 4,  ram: 16, azs: azs(['bamdad']),                bandwidth: '1.6 / 8.0 Gbit/s',  pps: '600,000',   cpu: 'Intel Ice Lake 2.6GHz', maxPods: 32,  pricePerHour: 192_000 },
  { id: 'm6.2xlarge.4',  category: 'Premium', vcpu: 8,  ram: 32, azs: azs(),                          bandwidth: '3.0 / 15.0 Gbit/s', pps: '1,200,000', cpu: 'Intel Ice Lake 2.6GHz', maxPods: 64,  pricePerHour: 384_000 },
  { id: 'g6.3xlarge.2',  category: 'Premium', vcpu: 12, ram: 24, azs: azs(),                          bandwidth: '5.0 / 17.0 Gbit/s', pps: '2,000,000', cpu: 'Intel Ice Lake 2.6GHz', maxPods: 96,  pricePerHour: 412_110 },
  // Premium Plus
  { id: 'g6.3xlarge.4',  category: 'Premium Plus', vcpu: 12, ram: 48, azs: azs(['foroogh', 'bamdad']), bandwidth: '5.0 / 17.0 Gbit/s', pps: '2,000,000', cpu: 'Intel Ice Lake 2.6GHz', maxPods: 96,  pricePerHour: 562_014 },
  { id: 'g6.4xlarge.2',  category: 'Premium Plus', vcpu: 16, ram: 32, azs: azs(),                      bandwidth: '6.0 / 20.0 Gbit/s', pps: '2,500,000', cpu: 'Intel Ice Lake 2.6GHz', maxPods: 128, pricePerHour: 549_480 },
]

export const FLAVOR_CATEGORIES = ['Basic', 'Standard', 'Premium', 'Premium Plus']

export const flavor = (id) => FLAVOR_CATALOG.find((f) => f.id === id)
export const flavorName = (id) => flavor(id)?.name || id
export const flavorSpec = (id) => {
  const f = flavor(id)
  return f ? `${f.vcpu} vCPU / ${f.ram} GB` : id
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
    labels: ['do-not-delete', 'contact-yosef'],
    status: 'running',
    version: '1.36.3',
    region: 'ir-central-1',
    cp: { plan: 'medium', ha: true },
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
        count: 3,
        specs: [{ flavorId: 'g6.xlarge.2', zones: ['foroogh', 'bamdad', 'simin'] }],
        zones: ['foroogh', 'bamdad', 'simin'],
        subnets: ['sn-prod-foroogh', 'sn-prod-bamdad', 'sn-prod-simin'],
        volumeGb: 50,
      },
      {
        id: 'pool-3c19',
        name: 'worker-pool',
        count: 4,
        specs: [{ flavorId: 'g6.2xlarge.2', zones: ['foroogh', 'bamdad'] }],
        zones: ['foroogh', 'bamdad'],
        subnets: ['sn-prod-foroogh', 'sn-prod-bamdad'],
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
        count: 2,
        specs: [{ flavorId: 'g6.large.2', zones: ['foroogh'] }],
        zones: ['foroogh'],
        subnets: ['sn-stg-foroogh'],
        volumeGb: 50,
      },
    ],
    usage: { cpu: 12, mem: 27, pods: 18 },
  },
  {
    id: 'aks-mlbatch03',
    name: 'ml-batch',
    description: 'Batch training and nightly jobs',
    labels: [],
    status: 'running',
    version: '1.35.4',
    region: 'ir-central-1',
    cp: { plan: 'small', ha: true },
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
        count: 3,
        specs: [{ flavorId: 'g6.2xlarge.2', zones: ['simin'] }],
        zones: ['simin'],
        subnets: ['sn-prod-simin'],
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
    { ts: '01:12:38', type: 'Normal', reason: 'ScaleDown', msg: 'Node api-pool-9d3c5 removed after scale-in' },
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
export const fmtIRR = (n) => (n == null ? 0 : n).toLocaleString('en-US')

export function monthlyPrice({ cp, pool }) {
  const cpPlan = CP_PLANS.find((p) => p.id === cp.plan)
  const cpCost = (cpPlan?.pricePerDay || 0) * 30
  let nodesCost = 0
  let volumeCost = 0
  if (pool && pool.specs?.length) {
    const count = pool.count || 1
    const avgHour = pool.specs.reduce((s, sp) => s + (flavor(sp.flavorId)?.pricePerHour || 0), 0) / pool.specs.length
    nodesCost = Math.round(avgHour * 730) * count
    volumeCost = VOLUME_PRICE_PER_GB * (pool.volumeGb || 50) * count
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
