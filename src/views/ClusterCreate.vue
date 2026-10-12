<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import {
  REGIONS, REGION, VERSIONS, CP_PLANS, FLAVOR_CATALOG,
  VPCS, KEY_PAIRS, INCLUDED_COMPONENTS, VOLUME_PRICE_PER_GB, fmtIRR,
} from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArCheckbox from '../components/ui/ArCheckbox.vue'
import ArRadioDot from '../components/ui/ArRadioDot.vue'
import ArSelectMenu from '../components/ui/ArSelectMenu.vue'
import PoolCard from '../components/create/PoolCard.vue'

const router = useRouter()

/* ---------------- draft ---------------- */
const regionId = ref('ir-central-1')
const typeView = ref('card')
const draft = reactive({
  name: '',
  labels: [],
  version: VERSIONS.find((v) => v.default).id,
  cp: { plan: 'medium' },
  vpcId: '',
  subnetIds: [],
  podCidrs: [{ octets: ['172', '16', '0', '0'], prefix: '16' }],
  svcCidrs: [{ octets: ['10', '10', '0', '0'], prefix: '24' }],
  pools: [], // up to 3 — same accordion cards as the stepper flow
})

/* pool factory — new pools copy the credentials of the first pool
   (same-as-pool-1 default; each pool can still override) */
let poolSeq = 0
function makePool(from) {
  poolSeq++
  return {
    id: `np-${poolSeq}`,
    name: '',
    count: 3,
    specs: [], // single choice: [{ flavorId, zones: [] }]
    loginMode: from?.loginMode || 'password',
    password: from?.password || '',
    passwordConfirm: from?.passwordConfirm || '',
    keyPairId: from?.keyPairId || '',
    image: from?.image || 'ubuntu-22.04',
    labels: [],
    taints: [],
  }
}
draft.pools.push(makePool())
const openId = ref(draft.pools[0].id)

function togglePool(id) {
  openId.value = openId.value === id ? '' : id
}
function addPool() {
  if (draft.pools.length >= 3) return
  const p = makePool(draft.pools[0])
  draft.pools.push(p)
  openId.value = p.id
}
function removePool(id) {
  const i = draft.pools.findIndex((p) => p.id === id)
  draft.pools.splice(i, 1)
  if (openId.value === id) openId.value = draft.pools.at(-1)?.id || ''
}

/* ---------------- master distribution ---------------- */
const masterDist = ref('automatic')
const masterHostAz = ref('foroogh')
const masterAzsOk = computed(() => masterDist.value === 'automatic' || masterHostAz.value !== '')

/* ---------------- computed ---------------- */
const region = computed(() => REGIONS.find((r) => r.id === regionId.value))
const vpc = computed(() => VPCS.find((v) => v.id === draft.vpcId))
const cpPlan = computed(() => CP_PLANS.find((p) => p.id === draft.cp.plan))

const nameOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.name))
/* Multi AZ requires at least one subnet per availability zone */
const selectedSubnetZones = computed(() =>
  [...new Set(draft.subnetIds.map((id) => vpc.value?.subnets.find((s) => s.id === id)?.zone).filter(Boolean))]
)
const missingAzSubnets = computed(() =>
  REGION.zones.map((z) => z.id).filter((z) => !selectedSubnetZones.value.includes(z))
)
const subnetOk = computed(() => {
  if (!draft.subnetIds.length) return false
  if (masterDist.value !== 'automatic') return true
  return missingAzSubnets.value.length === 0
})
const cidrsOk = computed(() => isValidCidrs(draft.podCidrs) && isValidCidrs(draft.svcCidrs))

/* ---------------- pool validation (same rules as the stepper) ---------------- */
const POOL_NAME = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/
const K8S_KEY = /^[a-z0-9]([a-z0-9-.]*[a-z0-9])?(\/[a-z0-9]([a-z0-9-.]*[a-z0-9])?)?$/
const K8S_VAL = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/

function poolNameOf(p, i) {
  return p.name || `node-pool-${i + 1}`
}
function poolOk(p, i, all) {
  const nm = poolNameOf(p, i)
  if (!POOL_NAME.test(nm)) return false
  /* effective names must be unique across pools */
  if (all.some((o, j) => j !== i && poolNameOf(o, j) === nm)) return false
  if (p.specs.length !== 1 || !p.specs[0].zones.length) return false
  if (!(Number.isInteger(p.count) && p.count >= 1 && p.count <= 20)) return false
  if (p.loginMode === 'keypair') {
    if (!KEY_PAIRS.some((k) => k.id === p.keyPairId)) return false
  } else {
    if (p.password.length < 8 || p.password !== p.passwordConfirm) return false
  }
  if (!p.labels.every((l) => {
    const [k, v] = l.split('=')
    return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v) && k.length <= 63 && v.length <= 63
  })) return false
  if (!p.taints.every((t) => K8S_KEY.test(t.key) && (t.value === '' || K8S_VAL.test(t.value)))) return false
  return true
}
const poolStates = computed(() => draft.pools.map((p, i) => poolOk(p, i, draft.pools)))
const poolsOk = computed(() => poolStates.value.every(Boolean))
const canCreate = computed(() => nameOk.value && subnetOk.value && cidrsOk.value && masterAzsOk.value && poolsOk.value && !cidrConflicts.value.length)

/* ---------------- price (sum over pools) ---------------- */
const price = computed(() => {
  const cpCost = (CP_PLANS.find((p) => p.id === draft.cp.plan)?.pricePerDay || 0) * 30
  let nodesCost = 0
  let volumeCost = 0
  for (const p of draft.pools) {
    const f = FLAVOR_CATALOG.find((x) => x.id === p.specs[0]?.flavorId)
    if (!f) continue
    nodesCost += Math.round(f.pricePerHour * 730) * p.count
    volumeCost += VOLUME_PRICE_PER_GB * 50 * p.count
  }
  const total = cpCost + nodesCost + volumeCost
  return {
    cpCost,
    nodesCost,
    volumeCost,
    total,
    hourly: Math.max(1_000, Math.round(total / 730 / 1_000) * 1_000),
  }
})

/* rail helpers */
const railZones = computed(() =>
  [...new Set(draft.subnetIds.map((id) => vpc.value?.subnets.find((s) => s.id === id)?.zone).filter(Boolean))]
)
const railSubnets = computed(() => {
  if (!draft.subnetIds.length) return ''
  const names = draft.subnetIds.map((id) => vpc.value?.subnets.find((s) => s.id === id)?.name)
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '')
})

function isValidCidrs(list) {
  return list.every(
    (r) =>
      r.octets.every((o) => o !== '' && !isNaN(o) && +o >= 0 && +o <= 255) &&
      +r.prefix >= 8 && +r.prefix <= 28
  )
}
const cidrStr = (r) => `${r.octets.join('.')}/${r.prefix}`
const cidrCapacity = (r) => Math.pow(2, 32 - +r.prefix).toLocaleString('en-US')

/* ---- CIDR overlap checks: container / service vs each other and the VPC ----
   (selected subnets sit inside the VPC range, so the VPC check covers them) */
function parseCidr(str) {
  const [ip, p] = str.split('/')
  const parts = ip.split('.')
  if (parts.length !== 4 || parts.some((x) => x === '')) return null
  const [a, b, c, d] = parts.map(Number)
  if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  if (!(+p >= 8 && +p <= 32)) return null
  const base = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
  return [base, base + Math.pow(2, 32 - +p) - 1]
}
const rangesOverlap = (x, y) => x[0] <= y[1] && y[0] <= x[1]
const cidrConflicts = computed(() => {
  const out = []
  const v = vpc.value
  if (!v) return out
  const pod = parseCidr(cidrStr(draft.podCidrs[0]))
  const svc = parseCidr(cidrStr(draft.svcCidrs[0]))
  const vpcR = parseCidr(v.cidr)
  if (!pod || !svc || !vpcR) return out
  if (rangesOverlap(pod, svc)) {
    out.push({ net: 'pod', text: `The container CIDR overlaps the service CIDR (${cidrStr(draft.svcCidrs[0])}). Choose a different range for one of them.` })
    out.push({ net: 'svc', text: `The service CIDR overlaps the container CIDR (${cidrStr(draft.podCidrs[0])}). Choose a different range for one of them.` })
  }
  const vpcLabel = `the VPC CIDR of ${v.name} (${v.cidr})`
  if (rangesOverlap(pod, vpcR)) out.push({ net: 'pod', text: `The container CIDR overlaps ${vpcLabel}. Choose a different range.` })
  if (rangesOverlap(svc, vpcR)) out.push({ net: 'svc', text: `The service CIDR overlaps ${vpcLabel}. Choose a different range.` })
  return out
})
const podConflicts = computed(() => cidrConflicts.value.filter((c) => c.net === 'pod'))
const svcConflicts = computed(() => cidrConflicts.value.filter((c) => c.net === 'svc'))

/* ---------------- interactions ---------------- */
function selectRegion(r) {
  if (r.enabled) regionId.value = r.id
}
function selectType(p) {
  draft.cp.plan = p.id
}
function toggleSubnet(id) {
  if (masterDist.value === 'custom') {
    /* Single AZ: one subnet only (radio behaviour — clicking the selected row keeps it) */
    draft.subnetIds = draft.subnetIds[0] === id ? draft.subnetIds : [id]
  } else {
    const i = draft.subnetIds.indexOf(id)
    i >= 0 ? draft.subnetIds.splice(i, 1) : draft.subnetIds.push(id)
  }
}
/* subnets outside the chosen AZ are locked in Single AZ mode */
const subnetLocked = (sn) => masterDist.value === 'custom' && sn.zone !== masterHostAz.value
const singleAzSubnets = computed(() =>
  masterDist.value === 'custom' ? (vpc.value?.subnets || []).filter((sn) => sn.zone === masterHostAz.value) : []
)
/* keep the selection valid when the distribution or AZ changes */
watch([masterDist, masterHostAz], () => {
  if (masterDist.value !== 'custom' || !vpc.value) return
  const keep = draft.subnetIds.filter((id) => {
    const sn = vpc.value.subnets.find((s) => s.id === id)
    return sn && sn.zone === masterHostAz.value
  })
  draft.subnetIds = keep.slice(0, 1)
})

function octetInput(e, row, i) {
  const v = e.target.value.replace(/[^\d]/g, '').slice(0, 3)
  row.octets[i] = v
  e.target.value = v
}

/* labels */
const labelInput = ref('')
function addLabel() {
  const v = labelInput.value.trim().toLowerCase().replace(/\s+/g, '-')
  if (v && !draft.labels.includes(v) && draft.labels.length < 10) draft.labels.push(v)
  labelInput.value = ''
}
function removeLabel(l) {
  draft.labels = draft.labels.filter((x) => x !== l)
}

const zoneName = (id) => REGION.zones.find((z) => z.id === id)?.name || id

/* ---------------- create ---------------- */
const creating = ref(false)
function create() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  setTimeout(() => {
    const cluster = store.createCluster({
      name: draft.name,
      labels: [...draft.labels],
      version: draft.version,
      cp: { plan: draft.cp.plan, ha: true },
      regionId: regionId.value,
      vpcId: draft.vpcId,
      subnetIds: [...draft.subnetIds],
      securityGroups: ['Default'],
      podCidr: cidrStr(draft.podCidrs[0]),
      svcCidr: cidrStr(draft.svcCidrs[0]),
      /* one entry per pool — store.createCluster accepts a pools array */
      pools: draft.pools.map((p, i) => ({
        name: poolNameOf(p, i),
        count: p.count,
        specs: JSON.parse(JSON.stringify(p.specs)),
        loginMode: p.loginMode,
        ...(p.loginMode === 'keypair' ? { keyPairId: p.keyPairId } : {}),
        image: p.image,
        labels: [...p.labels],
        taints: p.taints.filter((t) => t.key).map((t) => ({ ...t })),
      })),
    })
    creating.value = false
    store.toast('info', 'Creating cluster', `${cluster.name} is being created — this usually takes a few minutes.`)
    router.push('/clusters')
  }, 800)
}
</script>

<template>
  <main class="page page-wide">
    <div class="page-header">
      <div class="title-row">
        <router-link to="/clusters" class="ar-btn ghost icon" aria-label="Back" style="text-decoration: none">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3 5 8l5 5"/></svg>
        </router-link>
        <h1 class="text-title-2" style="margin: 0">Create Kubernetes Cluster</h1>
        <router-link :to="{ path: '/clusters/create', query: { flow: 'stepper' } }" class="flow-link">
          Try the two-step flow
        </router-link>
      </div>
    </div>

    <div class="wizard-grid">
      <div class="wizard-main">
        <!-- ================= REGION ================= -->
        <div class="ar-card sect">
          <div class="sect-head">
            <h3 class="text-title-3" style="margin: 0">Region</h3>
            <p class="text-body-2 muted" style="margin: 2px 0 0">Select the region where you want to create Kubernetes cluster.</p>
          </div>

          <div class="region-grid">
            <div
              v-for="r in REGIONS"
              :key="r.id"
              class="ar-card selectable region-card"
              :class="{ selected: regionId === r.id, disabled: !r.enabled }"
              @click="selectRegion(r)"
            >
              <span class="radio"></span>
              <div class="r-body">
                <div class="r-name">
                  <span class="flag" :class="r.flag"></span>
                  <span class="r-title">{{ r.name }}</span>
                  <span v-if="r.badge" class="badge-new">{{ r.badge }}</span>
                </div>
                <div class="r-zones">
                  <span v-for="z in r.zones" :key="z" class="r-zone">{{ z }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="banner info" style="margin-top: var(--space-4)">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
            Currently, only Iran Central is available for Kubernetes clusters.
          </div>
        </div>

        <!-- ================= CLUSTER TYPE (+ version) ================= -->
        <div class="ar-card sect">
          <div class="sect-head">
            <h3 class="text-title-3" style="margin: 0">Cluster Type</h3>
            <p class="text-body-2 muted" style="margin: 2px 0 0">Choose cluster type based on your requirement.</p>
          </div>

          <div class="ar-field" style="margin-bottom: var(--space-3)">
            <span class="ar-field-label">Cluster Size</span>
          </div>
          <div class="seg" style="margin-bottom: var(--space-4)">
            <button :class="{ on: typeView === 'card' }" @click="typeView = 'card'">Card</button>
            <button :class="{ on: typeView === 'table' }" @click="typeView = 'table'">Table</button>
            <button :class="{ on: typeView === 'scale' }" @click="typeView = 'scale'">Scale</button>
          </div>

          <!-- scale selector: pick the max node count, CP flavor follows -->
          <div v-if="typeView === 'scale'" class="scale-wrap">
            <div class="scale-pills">
              <button
                v-for="p in CP_PLANS"
                :key="p.id"
                class="scale-pill"
                :class="{ on: draft.cp.plan === p.id }"
                @click="selectType(p)"
              >Nodes: {{ fmtIRR(p.maxNodes) }}</button>
            </div>
            <p class="scale-note">
              Select the maximum number of nodes that can be managed by the cluster. The scale of a cluster determines the flavor of the master nodes. After the cluster is created, you can upgrade the flavor of the master nodes, <strong>but you cannot downgrade it.</strong>
            </p>
            <p class="scale-note">
              Typically, a cluster may not achieve the maximum node count within the selected scale due to factors such as the type, quantity, and size of resource objects within the cluster, as well as the volume of access requests from external systems to kube-apiserver. To prevent cluster overload, strengthen the cluster by monitoring its resource usage.
            </p>
          </div>

          <div v-else-if="typeView === 'card'" class="type-rows">
            <div
              v-for="p in CP_PLANS"
              :key="p.id"
              class="ar-card selectable type-row"
              :class="{ selected: draft.cp.plan === p.id }"
              @click="selectType(p)"
            >
              <span class="radio"></span>
              <div class="t-name">{{ p.name }}</div>
              <div class="t-spec"><span class="ts-k">Replica</span><span class="ts-v">{{ p.replicas }}</span></div>
              <div class="t-spec"><span class="ts-k">Max Nodes</span><span class="ts-v">{{ p.maxNodes }}</span></div>
              <div class="t-spec"><span class="ts-k">Max etcd Size</span><span class="ts-v">{{ p.etcdSize }}</span></div>
              <div class="t-spec t-price"><span class="ts-k">Price</span><span class="ts-v">{{ fmtIRR(p.pricePerDay) }} IRR/Day</span></div>
            </div>
          </div>

          <div v-else-if="typeView === 'table'" class="table-scroll">
            <table class="ar-table" style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md)">
              <thead>
                <tr><th></th><th>Type</th><th>Replica</th><th>Max Nodes</th><th>Max etcd Size</th><th>Price</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in CP_PLANS"
                  :key="p.id"
                  class="selectable"
                  :class="{ selected: draft.cp.plan === p.id }"
                  @click="selectType(p)"
                >
                  <td style="width: 36px"><span class="radio-box" :class="{ on: draft.cp.plan === p.id }"></span></td>
                  <td class="cell-main">{{ p.name }}</td>
                  <td class="text-body-2">{{ p.replicas }}</td>
                  <td class="text-body-2">{{ p.maxNodes }}</td>
                  <td class="text-body-2">{{ p.etcdSize }}</td>
                  <td class="text-body-2">{{ fmtIRR(p.pricePerDay) }} IRR/Day</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Master distribution -->
          <div class="ar-field" style="margin-top: var(--space-6); max-width: 640px">
            <span class="ar-field-label">Master Distribution<span class="req">*</span></span>
            <div class="dist-rows">
              <div class="dist-row">
                <div class="seg dist-seg">
                  <button :class="{ on: masterDist === 'automatic' }" @click="masterDist = 'automatic'">Multi AZ</button>
                  <button :class="{ on: masterDist === 'custom' }" @click="masterDist = 'custom'">Single AZ</button>
                </div>
              </div>

              <template v-if="masterDist === 'custom'">
                <div class="dist-row">
                  <span class="dist-k">Select AZ</span>
                  <label class="dist-radio">
                    <span class="radio-dot" :class="{ on: masterHostAz === 'foroogh' }"></span>
                    <input type="radio" name="master-host-az" value="foroogh" v-model="masterHostAz" /> Forough
                  </label>
                  <label class="dist-radio">
                    <span class="radio-dot" :class="{ on: masterHostAz === 'bamdad' }"></span>
                    <input type="radio" name="master-host-az" value="bamdad" v-model="masterHostAz" /> Bamdad
                  </label>
                  <label class="dist-radio">
                    <span class="radio-dot" :class="{ on: masterHostAz === 'simin' }"></span>
                    <input type="radio" name="master-host-az" value="simin" v-model="masterHostAz" /> Simin
                  </label>
                </div>
                <p class="scale-note">
                  After you customize AZ for your cluster's master nodes, the platform will create the master nodes based on the node distribution policy.
                </p>
                <p class="scale-note warn-note">
                  Insufficient resources in the specified AZ may cause the master node creation to fail, affecting the overall cluster creation process.
                </p>
              </template>

              <template v-else>
                <p class="scale-note">
                  The system will make the best effort to create master nodes in different AZs for cluster DR. However, if the number of available AZs is less than the number of nodes to be created, the platform will create the nodes in the AZs with sufficient resources to preferentially ensure cluster creation. In this case, AZ-level DR may not be ensured.
                </p>
                <p class="scale-note warn-note">
                  Available AZs in the current region: Forough, Bamdad, Simin.
                </p>
              </template>
            </div>
          </div>

          <div class="ar-field" style="margin-top: var(--space-6); max-width: 520px">
            <label>Kubernetes Version<span class="req">*</span></label>
            <ArSelectMenu
              v-model="draft.version"
              :options="VERSIONS.map((v) => ({ value: v.id, label: v.patch }))"
              aria-label="Kubernetes Version"
            />
            <div class="banner info" style="margin-top: var(--space-2)">
              <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
              <span>We generally recommend the latest version unless your team has a specific need.</span>
            </div>
          </div>
        </div>

        <!-- ================= NETWORK ================= -->
        <div class="ar-card sect">
          <div class="sect-head">
            <h3 class="text-title-3" style="margin: 0">Network</h3>
            <p class="text-body-2 muted" style="margin: 2px 0 0">Set up the network for your cluster.</p>
          </div>

          <!-- Cluster Network -->
          <div class="net-block">
            <div class="collapse-head static" style="padding: var(--space-4) 0">
              <span class="text-body-1">Cluster Network<span class="req">*</span></span>
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-4); padding-bottom: var(--space-6)">
              <div class="ar-field" style="max-width: 520px">
                <label>VPC<span class="req">*</span></label>
                <ArSelectMenu
                  v-model="draft.vpcId"
                  :options="[{ value: '', label: 'Select a VPC…' }, ...VPCS.map((v) => ({ value: v.id, label: `${v.name} (${v.cidr})` }))]"
                  aria-label="VPC"
                  @update:model-value="draft.subnetIds = []"
                />
              </div>

              <div class="ar-field">
                <span class="ar-field-label">Subnet<span class="req">*</span></span>
                <div class="table-scroll">
                  <table class="ar-table" style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md)">
                    <thead>
                      <tr><th style="width: 36px"></th><th>Name</th><th>IPv4 CIDR</th><th>AZ</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="sn in vpc?.subnets || []"
                        :key="sn.id"
                        class="selectable"
                        :class="{ selected: draft.subnetIds.includes(sn.id), 'row-locked': subnetLocked(sn) }"
                        @click="!subnetLocked(sn) && toggleSubnet(sn.id)"
                      >
                        <td @click.stop>
                          <ArRadioDot
                            v-if="masterDist === 'custom'"
                            :model-value="draft.subnetIds.includes(sn.id)"
                            :disabled="subnetLocked(sn)"
                            @update:model-value="toggleSubnet(sn.id)"
                          />
                          <ArCheckbox v-else :model-value="draft.subnetIds.includes(sn.id)" @update:model-value="toggleSubnet(sn.id)" />
                        </td>
                        <td><a href="#" @click.prevent.stop>{{ sn.name }}</a></td>
                        <td class="mono text-body-2">{{ sn.cidr }}</td>
                        <td class="text-body-2">{{ REGION.zones.find((z) => z.id === sn.zone)?.name }}</td>
                        <td><span class="ar-badge success pill">Available</span></td>
                      </tr>
                      <tr v-if="!vpc">
                        <td colspan="5" class="text-body-2 muted" style="text-align: center; padding: var(--space-6)">Select a VPC to list its subnets.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <span v-if="masterDist === 'custom'" class="hint">
                  Single AZ deployment — select one subnet in {{ REGION.zones.find((z) => z.id === masterHostAz)?.name }}. Subnets in other AZs are locked.
                </span>
                <span v-else class="hint">Pick one subnet per availability zone you want worker nodes in.</span>
                <span v-if="masterDist === 'custom' && vpc && !singleAzSubnets.length" class="error-text">
                  No subnet in {{ REGION.zones.find((z) => z.id === masterHostAz)?.name }} for this VPC — choose a different AZ or VPC.
                </span>
                <span v-if="masterDist === 'automatic' && vpc && missingAzSubnets.length" class="error-text">
                  Multi AZ requires a subnet in every availability zone — missing: {{ missingAzSubnets.map((z) => REGION.zones.find((zz) => zz.id === z)?.name).join(', ') }}.
                </span>
              </div>
            </div>
          </div>

          <!-- Container Network -->
          <div class="net-block" style="border-top: 0; padding-top: var(--space-2)">
            <div class="collapse-head static" style="padding: var(--space-4) 0">
              <span class="text-body-1">Container Network<span class="req">*</span></span>
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-2); padding-bottom: var(--space-6)">
              <div v-for="(row, i) in draft.podCidrs" :key="i" class="cidr-row">
                <span class="cidr-idx">{{ i + 1 }}</span>
                <div class="cidr-octets">
                  <ArSelectMenu
                    class="oct-box sel"
                    v-model="row.octets[0]"
                    :options="['10', '172', '192']"
                    aria-label="First octet"
                  />
                  <span class="dot-sep">.</span>
                  <span class="oct-box"><input :value="row.octets[1]" inputmode="numeric" @input="octetInput($event, row, 1)" aria-label="Octet 2" /></span>
                  <span class="dot-sep">.</span>
                  <span class="oct-box"><input :value="row.octets[2]" inputmode="numeric" @input="octetInput($event, row, 2)" aria-label="Octet 3" /></span>
                  <span class="dot-sep">.</span>
                  <span class="oct-box"><input :value="row.octets[3]" inputmode="numeric" @input="octetInput($event, row, 3)" aria-label="Octet 4" /></span>
                  <span class="slash">/</span>
                  <ArSelectMenu
                    class="oct-box sel oct-prefix"
                    v-model="row.prefix"
                    :options="['8','12','16','17','18','20','22','24','26','28']"
                    aria-label="Prefix"
                  />
                </div>
              </div>
              <p class="text-caption-1 muted" style="margin: var(--space-1) 0 0">
                The container CIDR block is the IP address range for Kubernetes Pods. The current CIDR block supports a maximum of
                <strong class="cidr-cap">{{ cidrCapacity(draft.podCidrs[0]) }}</strong> Pods.
              </p>
              <div class="banner warning" style="margin-top: var(--space-1)">
                <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2 14.5 13.5H1.5L8 2Z"/><path d="M8 6.8v3M8 12.2v.2"/></svg>
                <span>CIDR block cannot be modified after the cluster is created. Ensure it does not overlap with the VPC and subnet CIDR blocks to prevent communication issues.</span>
              </div>
              <div v-for="(c, i) in podConflicts" :key="i" class="banner error" style="margin-top: var(--space-1)">
                <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5.2v3.4M8 11.4v.2"/><circle cx="8" cy="8" r="6.2"/></svg>
                <span>{{ c.text }}</span>
              </div>
            </div>
          </div>

          <!-- Service Network -->
          <div class="net-block" style="border-top: 0">
            <div class="collapse-head static" style="padding: var(--space-4) 0">
              <span class="text-body-1">Service Network<span class="req">*</span></span>
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-2); padding-bottom: var(--space-6)">
              <div v-for="(row, i) in draft.svcCidrs" :key="i" class="cidr-row">
                <span class="cidr-idx">{{ i + 1 }}</span>
                <div class="cidr-octets">
                  <ArSelectMenu
                    class="oct-box sel"
                    v-model="row.octets[0]"
                    :options="['10', '172', '192']"
                    aria-label="First octet"
                  />
                  <span class="dot-sep">.</span>
                  <span class="oct-box"><input :value="row.octets[1]" inputmode="numeric" @input="octetInput($event, row, 1)" aria-label="Octet 2" /></span>
                  <span class="dot-sep">.</span>
                  <span class="oct-box"><input :value="row.octets[2]" inputmode="numeric" @input="octetInput($event, row, 2)" aria-label="Octet 3" /></span>
                  <span class="dot-sep">.</span>
                  <span class="oct-box"><input :value="row.octets[3]" inputmode="numeric" @input="octetInput($event, row, 3)" aria-label="Octet 4" /></span>
                  <span class="slash">/</span>
                  <ArSelectMenu
                    class="oct-box sel oct-prefix"
                    v-model="row.prefix"
                    :options="['8','12','16','17','18','20','22','24','26','28']"
                    aria-label="Prefix"
                  />
                </div>
              </div>
              <p class="text-caption-1 muted" style="margin: var(--space-1) 0 0">
                The service CIDR block is the IP address range for Kubernetes ClusterIP Services. The current CIDR block supports a maximum of
                <strong class="cidr-cap">{{ cidrCapacity(draft.svcCidrs[0]) }}</strong> Services.
              </p>
              <div class="banner warning" style="margin-top: var(--space-1)">
                <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2 14.5 13.5H1.5L8 2Z"/><path d="M8 6.8v3M8 12.2v.2"/></svg>
                <span>CIDR block cannot be modified after the cluster is created. Ensure it does not overlap with the subnet CIDR blocks of dependent middleware (such as RDS and Redis) to prevent communication issues.</span>
              </div>
              <div v-for="(c, i) in svcConflicts" :key="i" class="banner error" style="margin-top: var(--space-1)">
                <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5.2v3.4M8 11.4v.2"/><circle cx="8" cy="8" r="6.2"/></svg>
                <span>{{ c.text }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= NODE POOLS ================= -->
        <div class="ar-card sect">
          <div class="sect-head">
            <h3 class="text-title-3" style="margin: 0">Node Pools</h3>
            <p class="text-body-2 muted" style="margin: 2px 0 0">
              Configure up to 3 groups of nodes. Pools are optional — you can also add them after creation.
            </p>
          </div>

          <div class="pool-list">
            <PoolCard
              v-for="(p, i) in draft.pools"
              :key="p.id"
              :pool="p"
              :index="i"
              :open="openId === p.id"
              :ok="poolStates[i]"
              @toggle="togglePool(p.id)"
              @remove="removePool(p.id)"
            />

            <div v-if="!draft.pools.length" class="banner info">
              <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
              <span>No node pools — the cluster will be created without worker nodes. You can add pools after creation from the cluster page.</span>
            </div>

            <div style="display: flex; align-items: center; gap: var(--space-4)">
              <button class="add-pool" :disabled="draft.pools.length >= 3" @click="addPool">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
                Add node pool
              </button>
              <span v-if="draft.pools.length >= 3" class="hint">Maximum of 3 node pools per cluster.</span>
              <span v-else-if="draft.pools.length > 1" class="hint">New pools start with the same credentials as node-pool-1.</span>
            </div>
          </div>
        </div>

        <!-- ================= BASIC INFO ================= -->
        <div class="ar-card sect">
          <div class="sect-head">
            <h3 class="text-title-3" style="margin: 0">Basic Info</h3>
          </div>
          <div style="display: flex; flex-direction: column; gap: var(--space-4); max-width: 520px">
            <div class="ar-field">
              <label>Name<span class="req">*</span></label>
              <div class="ar-input" :class="{ 'error-mode': draft.name && !nameOk }">
                <input v-model="draft.name" placeholder="Enter a name" spellcheck="false" autocomplete="off" style="text-transform: lowercase" />
              </div>
              <span class="hint" :class="{ 'error-text': draft.name && !nameOk }">Lowercase letters, digits and dashes; starts with a letter, ends with a letter or digit. 3–40 characters.</span>
            </div>

            <div class="ar-field">
              <label>Labels</label>
              <div class="tagbox">
                <span v-for="l in draft.labels" :key="l" class="ar-tag">
                  {{ l }}
                  <button class="tag-x" aria-label="Remove label" @click="removeLabel(l)">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 4 8 8M12 4l-8 8"/></svg>
                  </button>
                </span>
                <input
                  v-model="labelInput"
                  placeholder="Enter a label"
                  @keydown.enter.prevent="addLabel"
                />
              </div>
              <span class="hint">After typing each label, press the Enter key.</span>
            </div>
          </div>
        </div>

        <!-- included components note -->
        <div class="callout">
          <svg style="margin-top: 2px" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
          <span>
            Installed automatically with every cluster:
            {{ INCLUDED_COMPONENTS.map((c) => c.name).join(' · ') }}.
          </span>
        </div>
      </div>

      <!-- ================= SUMMARY RAIL ================= -->
      <aside class="wizard-rail">
        <div class="ar-card rail-card">
          <div class="rail-group">
            <h4>Region and Availability Zone</h4>
            <div class="rail-text">
              <p>Region: {{ region?.name }}</p>
              <p>Availability Zone: {{ railZones.length ? railZones.map(zoneName).join(', ') : '—' }}</p>
            </div>
          </div>

          <div class="rail-group">
            <h4>Cluster Type and Version</h4>
            <div class="rail-text">
              <p>Cluster Type: {{ cpPlan?.name }}</p>
              <p>Master Distribution: {{ masterDist === 'automatic' ? 'Multi AZ' : `Single AZ · ${REGION.zones.find((z) => z.id === masterHostAz)?.name}` }}</p>
              <p>Kubernetes Version: {{ VERSIONS.find((v) => v.id === draft.version)?.patch }}</p>
            </div>
          </div>

          <div class="rail-group">
            <h4>Network</h4>
            <div class="rail-text">
              <p>VPC: {{ vpc ? `${vpc.name} (${vpc.cidr})` : '—' }}</p>
              <p>Subnet: {{ railSubnets || '—' }}</p>
              <p>Pod CIDR: <span class="mono">{{ cidrStr(draft.podCidrs[0]) }}</span></p>
              <p>Service CIDR: <span class="mono">{{ cidrStr(draft.svcCidrs[0]) }}</span></p>
            </div>
          </div>

          <div class="rail-group">
            <h4>Node Pools ({{ draft.pools.length }}/3)</h4>
            <div class="rail-text">
              <template v-if="draft.pools.length">
                <p v-for="(p, i) in draft.pools" :key="p.id">
                  {{ poolNameOf(p, i) }} · {{ p.specs[0]?.flavorId || 'no flavor' }} × {{ p.count || '—' }}
                  <span v-if="!poolStates[i]" class="rail-err">· incomplete</span>
                </p>
                <p>Login:
                  <template v-for="(p, i) in draft.pools" :key="p.id">
                    {{ i ? ' | ' : ' ' }}{{ p.loginMode === 'password' ? 'Password' : `Key Pair${p.keyPairId ? ` · ${KEY_PAIRS.find((k) => k.id === p.keyPairId)?.name}` : ''}` }}
                  </template>
                </p>
              </template>
              <p v-else>No node pools configured.</p>
            </div>
          </div>

          <div class="rail-group">
            <h4>Cluster Name</h4>
            <div class="rail-text">
              <p>Name: {{ draft.name || '—' }}</p>
            </div>
          </div>

          <div class="price-line">
            <span class="ph">{{ fmtIRR(price.hourly) }} <span>IRR/hour</span></span>
            <span class="pd">{{ fmtIRR(price.hourly * 24) }} IRR/Day</span>
          </div>
          <ArButton variant="primary" style="width: 100%; margin-top: var(--space-3)" :loading="creating" :disabled="!canCreate" @click="create">
            Create Kubernetes Cluster
          </ArButton>
          <p v-if="!canCreate" class="text-caption-1 muted" style="margin: var(--space-2) 0 0; text-align: center">
            Complete the cluster settings and every node pool card to enable creation.
          </p>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.page-wide { max-width: 1280px; }
.flow-link {
  margin-left: auto; font-size: 13px; font-weight: 450;
  color: var(--fg-primary-t1-1-default); text-decoration: none;
}
.flow-link:hover { text-decoration: underline; }
.sect { padding: var(--space-6); }
.sect-head {
  padding-bottom: var(--space-4);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--st-neutral-t1-1-default);
}
.net-block { padding-top: var(--space-2); }
.cidr-cap { color: var(--fg-error-t1-1-default); font-weight: 450; }
/* subnets outside the selected AZ (Single AZ mode) */
:deep(.ar-table tbody tr.row-locked) { opacity: .45; cursor: not-allowed; }
:deep(.ar-table tbody tr.row-locked:hover) { background: transparent; }

/* pool accordion list — same as the stepper flow */
.pool-list { display: flex; flex-direction: column; gap: var(--space-4); }
.add-pool {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px dashed var(--st-primary-t1-1-default); border-radius: var(--radius-md);
  background: var(--bg-primary-t3-1-default); color: var(--fg-primary-t1-1-default);
  font: inherit; font-size: 13.5px; font-weight: 450;
  padding: 10px 18px; cursor: pointer;
}
.add-pool:hover:not(:disabled) { background: var(--bg-primary-t2-1-default, var(--bg-primary-t3-1-default)); }
.add-pool:disabled { opacity: .5; cursor: not-allowed; }
.rail-err { color: var(--fg-error-t1-1-default); }
</style>
