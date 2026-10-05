<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import {
  REGIONS, REGION, VERSIONS, CP_PLANS, FLAVOR_CATALOG, FLAVOR_CATEGORIES,
  VPCS, INCLUDED_COMPONENTS, monthlyPrice, fmtIRR,
} from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArCheckbox from '../components/ui/ArCheckbox.vue'
import ArToggle from '../components/ui/ArToggle.vue'
import ArSelectMenu from '../components/ui/ArSelectMenu.vue'
import ArRadioDot from '../components/ui/ArRadioDot.vue'

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
  podCidrs: [{ octets: ['192', '168', '0', '0'], prefix: '16' }],
  svcCidrs: [{ octets: ['10', '10', '0', '0'], prefix: '24' }],
  pool: { name: '', image: 'ubuntu-22.04', loginMode: 'password', password: '', passwordConfirm: '', labels: [], taints: [], userData: '' },
  specs: [], // [{ flavorId, zones: [] }]
})

/* ---------------- advanced settings (node pool) ---------------- */
const advOpen = ref(false)
const poolImageTab = ref('public')

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
const poolNameOk = computed(() => !draft.pool.name || /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.pool.name))
const specsOk = computed(() => draft.specs.every((s) => s.zones.length > 0))
const IMAGES = [
  { id: 'ubuntu-22.04', name: 'Ubuntu 22.04' },
  { id: 'debian-12', name: 'Debian 12' },
]
const passwordOk = computed(
  () =>
    draft.pool.loginMode !== 'password' ||
    (draft.pool.password.length >= 8 && draft.pool.password === draft.pool.passwordConfirm)
)
const canCreate = computed(
  () => nameOk.value && subnetOk.value && cidrsOk.value && poolNameOk.value && specsOk.value && masterAzsOk.value && passwordOk.value && nodeLabelOk.value && taintsOk.value && userDataOk.value
)

const price = computed(() =>
  monthlyPrice({
    cp: { plan: draft.cp.plan },
    pool: draft.specs.length ? { count: draft.specs.length, specs: draft.specs } : null,
  })
)

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

/* ---------------- interactions ---------------- */
function selectRegion(r) {
  if (r.enabled) regionId.value = r.id
}
function selectType(p) {
  draft.cp.plan = p.id
}
function toggleSubnet(id) {
  const i = draft.subnetIds.indexOf(id)
  i >= 0 ? draft.subnetIds.splice(i, 1) : draft.subnetIds.push(id)
}

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

/* node pool labels / taints / startup script */
const K8S_KEY = /^[a-z0-9]([a-z0-9-.]*[a-z0-9])?(\/[a-z0-9]([a-z0-9-.]*[a-z0-9])?)?$/
const K8S_VAL = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/
const nodeLabelInput = ref('')
const nodeLabelOk = computed(() => draft.pool.labels.every((l) => {
  const [k, v] = l.split('=')
  return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v) && k.length <= 63 && v.length <= 63
}))
function addNodeLabel() {
  const v = nodeLabelInput.value.trim().replace(/\s+/g, '')
  if (v && v.includes('=') && !draft.pool.labels.includes(v) && draft.pool.labels.length < 20) draft.pool.labels.push(v)
  nodeLabelInput.value = ''
}
function removeNodeLabel(l) {
  draft.pool.labels = draft.pool.labels.filter((x) => x !== l)
}
function addTaint() {
  draft.pool.taints.push({ key: '', value: '', effect: 'NoSchedule' })
}
function removeTaint(t) {
  draft.pool.taints = draft.pool.taints.filter((x) => x !== t)
}
const taintsOk = computed(() =>
  draft.pool.taints.every((t) => K8S_KEY.test(t.key) && (t.value === '' || K8S_VAL.test(t.value)))
)
const userDataOk = computed(() => !draft.pool.userData || draft.pool.userData.length <= 16000)

/* ---------------- flavor catalog ---------------- */
const fCat = ref('Basic')
const fVcpu = ref('')
const fMem = ref('')
const fAz = ref('')
const page = ref(1)
const perPage = ref(5)

const vcpuOptions = [...new Set(FLAVOR_CATALOG.map((f) => f.vcpu))].sort((a, b) => a - b)
const memOptions = [...new Set(FLAVOR_CATALOG.map((f) => f.ram))].sort((a, b) => a - b)

const filteredFlavors = computed(() =>
  FLAVOR_CATALOG.filter((f) => {
    if (f.category !== fCat.value) return false
    if (fVcpu.value !== '' && f.vcpu !== +fVcpu.value) return false
    if (fMem.value !== '' && f.ram !== +fMem.value) return false
    // values arrive as strings from ArSelectMenu — comparisons above already coerce with +
    if (fAz.value !== '' && !f.azs.some((z) => z.id === fAz.value && !z.soldOut)) return false
    return true
  })
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredFlavors.value.length / perPage.value)))
const pagedFlavors = computed(() =>
  filteredFlavors.value.slice((page.value - 1) * perPage.value, page.value * perPage.value)
)
watch([fCat, fVcpu, fMem, fAz], () => { page.value = 1 })

const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, i) => i + 1))

const zoneName = (id) => REGION.zones.find((z) => z.id === id)?.name || id
const azCell = (f) =>
  f.azs.map((z) => (z.soldOut ? `${zoneName(z.id)} (Sold out)` : zoneName(z.id))).join(' | ')
const availableZones = (f) => f.azs.filter((z) => !z.soldOut).map((z) => z.id)
const allZonesSoldOut = (f) => f.azs.every((z) => z.soldOut)

/* selected spec — single choice: picking a flavor replaces the previous one */
function toggleFlavor(f) {
  const i = draft.specs.findIndex((s) => s.flavorId === f.id)
  if (i >= 0) draft.specs.splice(i, 1)
  else {
    draft.specs = [{ flavorId: f.id, zones: availableZones(f) }]
  }
}
function specToggleZone(spec, zoneId, f) {
  if (f.azs.find((z) => z.id === zoneId)?.soldOut) return
  const i = spec.zones.indexOf(zoneId)
  i >= 0 ? spec.zones.splice(i, 1) : spec.zones.push(zoneId)
}
function removeSpec(spec) {
  draft.specs = draft.specs.filter((s) => s.flavorId !== spec.flavorId)
}
function specSelected(f) {
  return draft.specs.some((s) => s.flavorId === f.id)
}
/* header cell: with single-select there is no select-all; keep the cell empty */

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
      pool: draft.specs.length
        ? {
            name: draft.pool.name || 'node-pool-1',
            count: draft.specs.length,
            specs: JSON.parse(JSON.stringify(draft.specs)),
            labels: [...draft.pool.labels],
            taints: draft.pool.taints.filter((t) => t.key).map((t) => ({ ...t })),
            userData: draft.pool.userData,
          }
        : null,
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
                        :class="{ selected: draft.subnetIds.includes(sn.id) }"
                        @click="toggleSubnet(sn.id)"
                      >
                        <td @click.stop>
                          <ArCheckbox :model-value="draft.subnetIds.includes(sn.id)" @update:model-value="toggleSubnet(sn.id)" />
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
                <span class="hint">Pick one subnet per availability zone you want worker nodes in.</span>
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
            </div>
          </div>
        </div>

        <!-- ================= NODE POOL ================= -->
        <div class="ar-card sect">
          <div class="sect-head">
            <h3 class="text-title-3" style="margin: 0">Node Pool</h3>
            <p class="text-body-2 muted" style="margin: 2px 0 0">Configure a group of nodes for your cluster. Optional — you can add pools after creation.</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: var(--space-4)">
            <div style="display: flex; gap: var(--space-4); flex-wrap: wrap">
              <div class="ar-field" style="flex: 1; min-width: 220px; max-width: 360px">
                <label>Pool Name</label>
                <div class="ar-input" :class="{ 'error-mode': draft.pool.name && !poolNameOk }">
                  <input v-model="draft.pool.name" placeholder="Enter a name" spellcheck="false" style="text-transform: lowercase" />
                </div>
                <span v-if="draft.pool.name && !poolNameOk" class="error-text">Lowercase letters, digits and dashes. 3–40 characters.</span>
              </div>
            </div>

            <!-- flavor filters -->
            <div class="flavor-filter">
              <div class="ar-field" style="width: 130px">
                <label>vCPUs</label>
                <ArSelectMenu
                  v-model="fVcpu"
                  :options="[{ value: '', label: 'All' }, ...vcpuOptions.map((v) => ({ value: String(v), label: String(v) }))]"
                  aria-label="vCPUs"
                />
              </div>
              <div class="ar-field" style="width: 130px">
                <label>Memory</label>
                <ArSelectMenu
                  v-model="fMem"
                  :options="[{ value: '', label: 'All' }, ...memOptions.map((m) => ({ value: String(m), label: String(m) }))]"
                  aria-label="Memory"
                />
              </div>
              <div class="ar-field" style="width: 150px">
                <label>AZ</label>
                <ArSelectMenu
                  v-model="fAz"
                  :options="[{ value: '', label: 'All' }, ...REGION.zones.map((z) => ({ value: z.id, label: z.name }))]"
                  aria-label="AZ"
                />
              </div>
            </div>

            <div class="pill-tabs">
              <button
                v-for="c in FLAVOR_CATEGORIES"
                :key="c"
                :class="{ on: fCat === c }"
                @click="fCat = c"
              >{{ c }}</button>
            </div>

            <!-- flavor table -->
            <div class="table-scroll">
              <table class="ar-table flavor-table">
                <thead>
                  <tr>
                    <th style="width: 36px"></th>
                    <th>Flavor</th>
                    <th>AZ</th>
                    <th>vCPUs / Memory</th>
                    <th>Port Speed</th>
                    <th>Packets Per Second</th>
                    <th>Max. Pods</th>
                    <th>Pricing</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="f in pagedFlavors"
                    :key="f.id"
                    class="selectable"
                    :class="{ selected: specSelected(f), 'sold-out': allZonesSoldOut(f) }"
                    @click="!allZonesSoldOut(f) && toggleFlavor(f)"
                  >
                    <td @click.stop>
                      <ArRadioDot
                        :model-value="specSelected(f)"
                        :disabled="allZonesSoldOut(f)"
                        @update:model-value="toggleFlavor(f)"
                      />
                    </td>
                    <td class="mono cell-main">{{ f.id }}</td>
                    <td class="text-body-2" :class="{ muted: f.azs.some((z) => z.soldOut) }">{{ azCell(f) }}</td>
                    <td class="text-body-2">{{ f.vcpu }} vCPUs / {{ f.ram }} GiB</td>
                    <td class="text-body-2 muted">{{ f.bandwidth.split(' / ').pop() }}</td>
                    <td class="text-body-2 muted">{{ f.pps }} pps</td>
                    <td class="text-body-2">{{ f.maxPods }}</td>
                    <td class="text-body-2-strong">{{ fmtIRR(f.pricePerHour) }} IRR/hour</td>
                  </tr>
                  <tr v-if="!pagedFlavors.length">
                    <td colspan="8" class="text-body-2 muted" style="text-align: center; padding: var(--space-6)">No flavors match the current filters.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center">
              <span class="text-caption-1 muted">
                Showing {{ filteredFlavors.length ? (page - 1) * perPage + 1 : 0 }}–{{ Math.min(page * perPage, filteredFlavors.length) }} of {{ filteredFlavors.length }}
              </span>
              <div style="display: flex; align-items: center; gap: var(--space-4)">
                <label class="check-line" style="gap: var(--space-2)">
                  Per page
                  <ArSelectMenu
                    class="per-page-menu"
                    v-model="perPage"
                    :options="[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 20, label: '20' }]"
                    aria-label="Rows per page"
                    @update:model-value="page = 1"
                  />
                </label>
                <nav class="ar-pagination" aria-label="Flavor pagination">
                  <button class="ar-page" :disabled="page <= 1" @click="page--">‹</button>
                  <button
                    v-for="n in pageNumbers"
                    :key="n"
                    class="ar-page"
                    :class="{ current: n === page }"
                    @click="page = n"
                  >{{ n }}</button>
                  <button class="ar-page" :disabled="page >= totalPages" @click="page++">›</button>
                </nav>
              </div>
            </div>

            <!-- login mode (required) -->
            <div class="ar-field" style="max-width: 640px">
              <span class="ar-field-label">Login Mode<span class="req">*</span></span>
              <div class="dist-rows">
                <div class="dist-row">
                  <div class="seg dist-seg">
                    <button :class="{ on: draft.pool.loginMode === 'password' }" @click="draft.pool.loginMode = 'password'">Password</button>
                    <button :class="{ on: draft.pool.loginMode === 'keypair' }" @click="draft.pool.loginMode = 'keypair'">Key Pair</button>
                  </div>
                </div>
                <template v-if="draft.pool.loginMode === 'password'">
                  <div class="dist-row" style="flex-wrap: nowrap">
                    <span class="dist-k" style="width: 90px">Username</span>
                    <span class="text-body-2-strong">root</span>
                  </div>
                  <div class="dist-row" style="flex-wrap: nowrap">
                    <span class="dist-k" style="width: 90px">Password</span>
                    <div class="ar-input" style="flex: 1; max-width: 250px" :class="{ 'error-mode': draft.pool.password && draft.pool.password.length < 8 }">
                      <input v-model="draft.pool.password" type="password" placeholder="Enter a password." autocomplete="new-password" />
                    </div>
                    <div class="ar-input" style="flex: 1; max-width: 250px" :class="{ 'error-mode': draft.pool.passwordConfirm && draft.pool.passwordConfirm !== draft.pool.password }">
                      <input v-model="draft.pool.passwordConfirm" type="password" placeholder="Confirm the password." autocomplete="new-password" />
                    </div>
                  </div>
                  <span v-if="draft.pool.password && draft.pool.password.length < 8" class="error-text">Password must be at least 8 characters.</span>
                  <span v-else-if="draft.pool.passwordConfirm && draft.pool.passwordConfirm !== draft.pool.password" class="error-text">Passwords do not match.</span>
                  <p class="scale-note muted">The password is used to log in to the nodes of this pool over SSH.</p>
                </template>
                <p v-else class="scale-note muted">Choose an SSH key pair from your project after the cluster is created.</p>
              </div>
            </div>

            <!-- advanced settings (optional) -->
            <button class="adv-toggle" @click="advOpen = !advOpen">
              Advanced Settings (Optional)
              <svg class="chev" :style="{ transform: advOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 6.5 4 4 4-4"/></svg>
            </button>

            <div v-if="advOpen" style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md); padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-5)">
              <!-- OS -->
              <div class="dist-row" style="align-items: flex-start">
                <span class="dist-k" style="margin-top: 6px">OS</span>
                <div style="display: flex; flex-direction: column; gap: var(--space-3)">
                  <div class="seg">
                    <button :class="{ on: poolImageTab === 'public' }" @click="poolImageTab = 'public'">Public image</button>
                    <button :class="{ on: poolImageTab === 'private' }" @click="poolImageTab = 'private'">Private image</button>
                  </div>
                  <div v-if="poolImageTab === 'public'" class="chip-row">
                    <button
                      v-for="img in IMAGES"
                      :key="img.id"
                      class="os-card"
                      :class="{ on: draft.pool.image === img.id }"
                      @click="draft.pool.image = img.id"
                    >
                      <span class="os-logo" :class="img.id.startsWith('ubuntu') ? 'os-ubuntu' : 'os-debian'">
                        <svg v-if="img.id.startsWith('ubuntu')" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="12" r="1.6"/><circle cx="14" cy="7.5" r="1.6"/><circle cx="14" cy="16.5" r="1.6"/></svg>
                        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 9 9c0-.6 0-1.2-.2-1.8A5 5 0 0 1 13 4.2 9 9 0 0 0 12 3Z"/><path d="M8 12.5c1.8 0 3.2-1.4 3.2-3.2"/></svg>
                      </span>
                      {{ img.name }}
                    </button>
                  </div>
                  <p v-else class="scale-note muted">Private images are not available yet.</p>
                </div>
              </div>

              <!-- Node labels -->
              <div class="dist-row" style="align-items: flex-start">
                <span class="dist-k" style="margin-top: 6px">Node Labels</span>
                <div style="flex: 1; display: flex; flex-direction: column; gap: var(--space-2); max-width: 560px">
                  <div class="tagbox">
                    <span v-for="l in draft.pool.labels" :key="l" class="ar-tag mono">
                      {{ l }}
                      <button class="tag-x" aria-label="Remove label" @click="removeNodeLabel(l)">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 4 8 8M12 4l-8 8"/></svg>
                      </button>
                    </span>
                    <input
                      v-model="nodeLabelInput"
                      placeholder="key=value"
                      spellcheck="false"
                      @keydown.enter.prevent="addNodeLabel"
                    />
                  </div>
                  <span v-if="nodeLabelInput && !nodeLabelOk" class="error-text">Use key=value — lowercase keys (letters, digits, -, .), values up to 63 characters.</span>
                  <span v-else class="hint">Applied as Kubernetes labels to every node of this pool. Press Enter after each label. Up to 20.</span>
                </div>
              </div>

              <!-- Taints -->
              <div class="dist-row" style="align-items: flex-start">
                <span class="dist-k" style="margin-top: 6px">Taints</span>
                <div style="flex: 1; display: flex; flex-direction: column; gap: var(--space-3); max-width: 560px">
                  <div v-for="(t, i) in draft.pool.taints" :key="i" class="dist-row" style="flex-wrap: nowrap; gap: var(--space-2)">
                    <div class="ar-input" style="flex: 2" :class="{ 'error-mode': t.key && !K8S_KEY.test(t.key) }">
                      <input v-model="t.key" placeholder="Key" spellcheck="false" style="text-transform: lowercase" />
                    </div>
                    <div class="ar-input" style="flex: 2" :class="{ 'error-mode': t.value && !K8S_VAL.test(t.value) }">
                      <input v-model="t.value" placeholder="Value" spellcheck="false" />
                    </div>
                    <ArSelectMenu
                      class="taint-effect"
                      v-model="t.effect"
                      :options="['NoSchedule', 'PreferNoSchedule', 'NoExecute']"
                      aria-label="Taint effect"
                    />
                    <button class="taint-x" aria-label="Remove taint" @click="removeTaint(t)">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 4 8 8M12 4l-8 8"/></svg>
                    </button>
                  </div>
                  <button class="link-btn" @click="addTaint">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
                    Add taint
                  </button>
                  <span v-if="draft.pool.taints.length && !taintsOk" class="error-text">Taint keys must be lowercase (letters, digits, -, .). Value is optional.</span>
                  <span v-else class="hint">Tainted nodes repel pods that do not tolerate the taint. Value is optional.</span>
                </div>
              </div>

              <!-- Startup script -->
              <div class="dist-row" style="align-items: flex-start">
                <span class="dist-k" style="margin-top: 6px">Startup Script</span>
                <div style="flex: 1; display: flex; flex-direction: column; gap: var(--space-2); max-width: 560px">
                  <div class="ar-input textarea" :class="{ 'error-mode': draft.pool.userData.length > 16000 }">
                    <textarea
                      v-model="draft.pool.userData"
                      rows="5"
                      placeholder="#!/bin/bash"
                      spellcheck="false"
                      style="font-family: var(--font-mono, monospace); font-size: 12px"
                    ></textarea>
                  </div>
                  <span class="hint">A cloud-init user-data script that runs on every node of this pool at first boot. Maximum 16 KB.</span>
                </div>
              </div>
            </div>

            <!-- selected specification (single) -->
            <div v-if="draft.specs.length" style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md); padding: var(--space-4) var(--space-6) var(--space-6)">
              <h4 class="text-body-1" style="margin: 0 0 var(--space-3)">Selected Specification</h4>
              <div class="banner info" style="margin-bottom: var(--space-4); align-items: flex-start">
                <svg style="flex:none; margin-top: 2px" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
                <ol style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px">
                  <li>Only one flavor can be selected per node pool — picking another flavor replaces the current one.</li>
                  <li>Choose the availability zones where the nodes of this flavor should be provisioned.</li>
                </ol>
              </div>
              <div class="table-scroll">
                <table class="ar-table">
                  <thead>
                    <tr><th>Specifications</th><th>Pricing</th><th style="width: 40%">AZ</th><th style="width: 90px">Operation</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="spec in draft.specs" :key="spec.flavorId">
                      <td class="text-body-2-strong">
                        {{ FLAVOR_CATALOG.find((f) => f.id === spec.flavorId)?.category }} /
                        <span class="mono">{{ spec.flavorId }}</span> ·
                        {{ FLAVOR_CATALOG.find((f) => f.id === spec.flavorId)?.vcpu }} vCPUs /
                        {{ FLAVOR_CATALOG.find((f) => f.id === spec.flavorId)?.ram }} GiB
                      </td>
                      <td class="text-body-2">{{ fmtIRR(FLAVOR_CATALOG.find((f) => f.id === spec.flavorId)?.pricePerHour) }} IRR/hour</td>
                      <td>
                        <div class="chip-row">
                          <label
                            v-for="z in FLAVOR_CATALOG.find((f) => f.id === spec.flavorId)?.azs"
                            :key="z.id"
                            class="check-line"
                            :style="z.soldOut ? 'opacity:.5' : ''"
                          >
                            <ArCheckbox
                              :model-value="spec.zones.includes(z.id)"
                              :disabled="z.soldOut"
                              @update:model-value="specToggleZone(spec, z.id, FLAVOR_CATALOG.find((f) => f.id === spec.flavorId))"
                            />
                            {{ z.soldOut ? `${zoneName(z.id)} (Sold out)` : zoneName(z.id) }}
                          </label>
                        </div>
                      </td>
                      <td><button class="link-danger" @click="removeSpec(spec)">Delete</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <span v-if="draft.specs.some((s) => !s.zones.length)" class="error-text">
              Select at least one availability zone for every selected flavor.
            </span>
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
            <h4>Node Pool</h4>
            <div class="rail-text">
              <p>Pool Name: {{ draft.pool.name || (draft.specs.length ? 'node-pool-1' : '—') }}</p>
              <p>Flavors: {{ draft.specs.length ? draft.specs.map((s) => s.flavorId).join(', ') : '—' }}</p>
              <p v-if="draft.specs.length">Availability Zone: {{ [...new Set(draft.specs.flatMap((s) => s.zones))].map(zoneName).join(', ') || '—' }}</p>
              <p>Login: {{ draft.pool.loginMode === 'password' ? 'Password' : 'Key Pair' }}</p>
              <p v-if="draft.pool.labels.length || draft.pool.taints.length">
                Labels/Taints: {{ draft.pool.labels.length }} label{{ draft.pool.labels.length === 1 ? '' : 's' }} · {{ draft.pool.taints.length }} taint{{ draft.pool.taints.length === 1 ? '' : 's' }}
              </p>
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
            Complete name, subnets, CIDRs, login credentials{{ draft.specs.length ? ' and AZ selection' : '' }} to enable creation.
          </p>
          <p v-else-if="!nodeLabelOk || !taintsOk" class="error-text" style="margin: var(--space-2) 0 0; text-align: center">
            Fix invalid node labels or taints in Advanced Settings to enable creation.
          </p>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.page-wide { max-width: 1280px; }
.sect { padding: var(--space-6); }
.sect-head {
  padding-bottom: var(--space-4);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--st-neutral-t1-1-default);
}
.net-block { padding-top: var(--space-2); }
.check-line {
  display: inline-flex; align-items: center; gap: var(--space-2);
  font-size: 13px; color: var(--fg-neutral-t1-2-default); cursor: pointer;
}
.flavor-filter { display: flex; gap: var(--space-4); flex-wrap: wrap; align-items: flex-end; }
.flavor-filter .check-line { white-space: nowrap; }
.link-danger {
  border: 0; background: none; cursor: pointer; font: inherit; font-size: 13px; font-weight: 450;
  color: var(--fg-primary-t1-1-default); padding: 0;
}
.link-danger:hover { text-decoration: underline; }
.cidr-cap { color: var(--fg-error-t1-1-default); font-weight: 450; }
.flavor-table tbody tr.sold-out td { color: var(--fg-neutral-t1-3-default); }
</style>
