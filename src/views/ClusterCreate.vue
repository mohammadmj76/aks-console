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
  pool: { name: '', count: 2 },
  specs: [], // [{ flavorId, zones: [] }]
})
/* ---------------- computed ---------------- */
const region = computed(() => REGIONS.find((r) => r.id === regionId.value))
const vpc = computed(() => VPCS.find((v) => v.id === draft.vpcId))
const cpPlan = computed(() => CP_PLANS.find((p) => p.id === draft.cp.plan))

const nameOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.name))
const subnetOk = computed(() => draft.subnetIds.length > 0)
const cidrsOk = computed(() => isValidCidrs(draft.podCidrs) && isValidCidrs(draft.svcCidrs))
const poolNameOk = computed(() => !draft.pool.name || /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.pool.name))
const specsOk = computed(() => draft.specs.every((s) => s.zones.length > 0))
const canCreate = computed(
  () => nameOk.value && subnetOk.value && cidrsOk.value && poolNameOk.value && specsOk.value
)

const price = computed(() =>
  monthlyPrice({
    cp: { plan: draft.cp.plan },
    pool: draft.specs.length ? { count: draft.pool.count, specs: draft.specs } : null,
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

function addCidr(list) {
  const last = list[list.length - 1]
  list.push({ octets: [...last.octets], prefix: last.prefix })
}
function removeCidr(list, i) {
  if (list.length > 1) list.splice(i, 1)
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

/* ---------------- flavor catalog ---------------- */
const fCat = ref('Basic')
const fVcpu = ref('')
const fMem = ref('')
const fAz = ref('')
const fQ = ref('')
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
    if (fQ.value && !f.id.toLowerCase().includes(fQ.value.toLowerCase())) return false
    return true
  })
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredFlavors.value.length / perPage.value)))
const pagedFlavors = computed(() =>
  filteredFlavors.value.slice((page.value - 1) * perPage.value, page.value * perPage.value)
)
watch([fCat, fVcpu, fMem, fAz, fQ], () => { page.value = 1 })

const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, i) => i + 1))

const zoneName = (id) => REGION.zones.find((z) => z.id === id)?.name || id
const azCell = (f) =>
  f.azs.map((z) => (z.soldOut ? `${zoneName(z.id)} (Sold out)` : zoneName(z.id))).join(' | ')
const availableZones = (f) => f.azs.filter((z) => !z.soldOut).map((z) => z.id)
const allZonesSoldOut = (f) => f.azs.every((z) => z.soldOut)

/* selected specs (multi-select) */
function toggleFlavor(f) {
  const i = draft.specs.findIndex((s) => s.flavorId === f.id)
  if (i >= 0) draft.specs.splice(i, 1)
  else draft.specs.push({ flavorId: f.id, zones: availableZones(f) })
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
/* header checkbox: toggle all page rows */
const pageAllSelected = computed(
  () => pagedFlavors.value.length > 0 && pagedFlavors.value.every((f) => specSelected(f) || allZonesSoldOut(f))
)
function togglePageAll() {
  const target = !pageAllSelected.value
  for (const f of pagedFlavors.value) {
    const has = specSelected(f)
    if (target && !has && !allZonesSoldOut(f)) draft.specs.push({ flavorId: f.id, zones: availableZones(f) })
    if (!target && has) removeSpec(draft.specs.find((s) => s.flavorId === f.id))
  }
}

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
        ? { name: draft.pool.name || 'node-pool-1', count: draft.pool.count, specs: JSON.parse(JSON.stringify(draft.specs)) }
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
              <div class="t-spec"><span class="ts-k">Memory</span><span class="ts-v">{{ p.ram }} GB</span></div>
              <div class="t-spec"><span class="ts-k">Max Nodes</span><span class="ts-v">{{ p.maxNodes }}</span></div>
              <div class="t-spec"><span class="ts-k">Max etcd Size</span><span class="ts-v">{{ p.etcdSize }}</span></div>
              <div class="t-spec t-price"><span class="ts-k">Price</span><span class="ts-v">{{ fmtIRR(p.pricePerDay) }} IRR/Day</span></div>
            </div>
          </div>

          <div v-else-if="typeView === 'table'" class="table-scroll">
            <table class="ar-table" style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md)">
              <thead>
                <tr><th></th><th>Type</th><th>Memory</th><th>Max Nodes</th><th>Max etcd Size</th><th>Price</th></tr>
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
                  <td class="text-body-2">{{ p.ram }} GB</td>
                  <td class="text-body-2">{{ p.maxNodes }}</td>
                  <td class="text-body-2">{{ p.etcdSize }}</td>
                  <td class="text-body-2">{{ fmtIRR(p.pricePerDay) }} IRR/Day</td>
                </tr>
              </tbody>
            </table>
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
                <button class="cidr-btn" :disabled="draft.podCidrs.length <= 1" @click="removeCidr(draft.podCidrs, i)" aria-label="Remove CIDR">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h10M5.5 4V3h5v1M4.5 4l.7 9h5.6l.7-9"/></svg>
                </button>
                <button v-if="i === draft.podCidrs.length - 1" class="cidr-btn" @click="addCidr(draft.podCidrs)" aria-label="Add CIDR">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
                </button>
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
                <button class="cidr-btn" :disabled="draft.svcCidrs.length <= 1" @click="removeCidr(draft.svcCidrs, i)" aria-label="Remove CIDR">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h10M5.5 4V3h5v1M4.5 4l.7 9h5.6l.7-9"/></svg>
                </button>
                <button v-if="i === draft.svcCidrs.length - 1" class="cidr-btn" @click="addCidr(draft.svcCidrs)" aria-label="Add CIDR">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
                </button>
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
              <div class="ar-field" v-if="draft.specs.length" style="width: 180px">
                <label>Nodes</label>
                <div class="count-input">
                  <button :disabled="draft.pool.count <= 1" @click="draft.pool.count--">−</button>
                  <input v-model.number="draft.pool.count" type="number" min="1" max="20" />
                  <button :disabled="draft.pool.count >= 20" @click="draft.pool.count++">+</button>
                </div>
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
              <div class="ar-field" style="flex: 1; min-width: 180px">
                <label>Flavor</label>
                <div class="ar-input">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
                  <input v-model="fQ" placeholder="Search flavor name" />
                </div>
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
                    <th style="width: 36px"><ArCheckbox :model-value="pageAllSelected" @update:model-value="togglePageAll" /></th>
                    <th>Flavor</th>
                    <th>AZ</th>
                    <th>vCPUs / Memory</th>
                    <th>Assured / Max Bandwidth</th>
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
                      <ArCheckbox
                        :model-value="specSelected(f)"
                        :disabled="allZonesSoldOut(f)"
                        @update:model-value="toggleFlavor(f)"
                      />
                    </td>
                    <td class="mono cell-main">{{ f.id }}</td>
                    <td class="text-body-2" :class="{ muted: f.azs.some((z) => z.soldOut) }">{{ azCell(f) }}</td>
                    <td class="text-body-2">{{ f.vcpu }} vCPUs / {{ f.ram }} GiB</td>
                    <td class="text-body-2 muted">{{ f.bandwidth }}</td>
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

            <!-- selected specifications -->
            <div v-if="draft.specs.length" style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md); padding: var(--space-4) var(--space-6) var(--space-6)">
              <h4 class="text-body-1" style="margin: 0 0 var(--space-3)">Selected Specifications</h4>
              <div class="banner info" style="margin-bottom: var(--space-4); align-items: flex-start">
                <svg style="flex:none; margin-top: 2px" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
                <ol style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px">
                  <li>Nodes in a newly created node pool are created using the first flavor with available capacity.</li>
                  <li>When manually scaling a node pool, you can only add nodes using the selected flavors — select multiple flavors (spec and AZ) as alternatives.</li>
                  <li>Choose the availability zones where the nodes of each flavor should be provisioned.</li>
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
              <p v-if="draft.specs.length">Nodes: {{ draft.pool.count }}</p>
              <p v-if="draft.specs.length">Availability Zone: {{ [...new Set(draft.specs.flatMap((s) => s.zones))].map(zoneName).join(', ') || '—' }}</p>
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
            Complete name, subnets, CIDRs{{ draft.specs.length ? ' and AZ selection' : '' }} to enable creation.
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
