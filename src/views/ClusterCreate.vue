<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import {
  REGIONS, REGION, VERSIONS, CP_PLANS, FLAVORS, VPCS, FIREWALL_GROUPS,
  INCLUDED_COMPONENTS, monthlyPrice, fmtIRR, flavorName,
} from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArToggle from '../components/ui/ArToggle.vue'

const router = useRouter()

/* ---------------- draft ---------------- */
const regionId = ref('ir-central-1')
const typeView = ref('card')
const draft = reactive({
  name: '',
  labels: [],
  version: VERSIONS.find((v) => v.default).id,
  clusterSize: 50,
  cp: { plan: 'medium' },
  accessType: 'single',
  vpcId: '',
  subnetIds: [],
  securityGroups: ['Default'],
  podCidrs: [{ octets: ['192', '168', '0', '0'], prefix: '16' }],
  svcCidrs: [{ octets: ['10', '10', '0', '0'], prefix: '24' }],
  pools: [makePool()],
})
const net = reactive({ cluster: true, container: true, service: true })
const poolsOpen = ref(draft.pools.map(() => true))

function makePool() {
  return { name: '', flavor: 'g4-4-8', count: 2, autoscale: { enabled: true, min: 2, max: 12 } }
}

/* ---------------- computed ---------------- */
const region = computed(() => REGIONS.find((r) => r.id === regionId.value))
const vpc = computed(() => VPCS.find((v) => v.id === draft.vpcId))
const cpPlan = computed(() => CP_PLANS.find((p) => p.id === draft.cp.plan))
const flavor = computed(() => FLAVORS.find((f) => f.id === draft.pools[0]?.flavor))

const sizeOptions = computed(() =>
  [50, 100, 250, 500, 1000].filter((n) => n <= cpPlan.value.maxNodes)
)

const nameOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.name))
const subnetOk = computed(() => draft.subnetIds.length > 0)
const sgOk = computed(() => draft.securityGroups.length > 0)
const cidrsOk = computed(() => isValidCidrs(draft.podCidrs) && isValidCidrs(draft.svcCidrs))
const poolsOk = computed(
  () =>
    draft.pools.every(
      (p) =>
        /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(p.name) &&
        p.count >= 1 &&
        (!p.autoscale.enabled || (p.autoscale.min >= 1 && p.autoscale.max >= p.autoscale.min && p.autoscale.max <= 20))
    )
)
const canCreate = computed(
  () => nameOk.value && subnetOk.value && sgOk.value && cidrsOk.value && poolsOk.value
)

const price = computed(() =>
  monthlyPrice({ cp: { plan: draft.cp.plan }, pools: draft.pools })
)

function isValidCidrs(list) {
  return list.every(
    (r) =>
      r.octets.every((o) => o !== '' && !isNaN(o) && +o >= 0 && +o <= 255) &&
      +r.prefix >= 8 && +r.prefix <= 28
  )
}
const cidrStr = (r) => `${r.octets.join('.')}/${r.prefix}`

/* ---------------- interactions ---------------- */
function selectRegion(r) {
  if (r.enabled) regionId.value = r.id
}
function selectType(p) {
  draft.cp.plan = p.id
  if (draft.clusterSize > p.maxNodes) draft.clusterSize = p.maxNodes
}
function toggleSubnet(id) {
  if (draft.accessType === 'single') {
    draft.subnetIds = [id]
  } else {
    const i = draft.subnetIds.indexOf(id)
    i >= 0 ? draft.subnetIds.splice(i, 1) : draft.subnetIds.push(id)
  }
}
function setAccess(t) {
  draft.accessType = t
  if (t === 'single' && draft.subnetIds.length > 1) draft.subnetIds = [draft.subnetIds[0]]
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

/* security-group dropdown */
const sgOpen = ref(false)
const sgRoot = ref(null)
function onDocClick(e) {
  if (sgRoot.value && !sgRoot.value.contains(e.target)) sgOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
function toggleSg(name) {
  const i = draft.securityGroups.indexOf(name)
  i >= 0 ? draft.securityGroups.splice(i, 1) : draft.securityGroups.push(name)
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

/* pools */
function addPool() {
  draft.pools.push(makePool())
  poolsOpen.value.push(true)
}
function removePool(i) {
  if (draft.pools.length > 1) {
    draft.pools.splice(i, 1)
    poolsOpen.value.splice(i, 1)
  }
}
function togglePool(i) {
  poolsOpen.value[i] = !poolsOpen.value[i]
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
      clusterSize: draft.clusterSize,
      cp: { plan: draft.cp.plan, ha: true },
      regionId: regionId.value,
      vpcId: draft.vpcId,
      subnetIds: [...draft.subnetIds],
      securityGroups: [...draft.securityGroups],
      podCidr: cidrStr(draft.podCidrs[0]),
      svcCidr: cidrStr(draft.svcCidrs[0]),
      pools: draft.pools.map((p) => JSON.parse(JSON.stringify(p))),
    })
    creating.value = false
    store.toast('info', 'Provisioning started', `${cluster.name} is being created — this usually takes a few minutes.`)
    router.push(`/clusters/${cluster.id}`)
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
        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0">Region</h3>
          <p class="text-body-2 muted" style="margin: 2px 0 var(--space-4)">Select the region where you want to create Kubernetes cluster.</p>

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
                  {{ r.name }}
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

        <!-- ================= CLUSTER TYPE ================= -->
        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0">Cluster Type</h3>
          <p class="text-body-2 muted" style="margin: 2px 0 var(--space-4)">Choose cluster type based on your requirement.</p>

          <div class="seg" style="margin-bottom: var(--space-4)">
            <button :class="{ on: typeView === 'card' }" @click="typeView = 'card'">Card</button>
            <button :class="{ on: typeView === 'table' }" @click="typeView = 'table'">Table</button>
          </div>

          <div v-if="typeView === 'card'" class="plan-grid">
            <div
              v-for="p in CP_PLANS"
              :key="p.id"
              class="ar-card selectable plan"
              :class="{ selected: draft.cp.plan === p.id }"
              @click="selectType(p)"
            >
              <span class="p-check"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
              <div class="p-name">{{ p.name }}</div>
              <div class="p-spec" style="display: grid; grid-template-columns: auto 1fr; column-gap: var(--space-4); margin-top: var(--space-2)">
                <span class="muted">CPU</span><span>{{ p.vcpu }} vCPU</span>
                <span class="muted">RAM</span><span>{{ p.ram }} GB</span>
                <span class="muted">Max Nodes</span><span>{{ p.maxNodes }}</span>
              </div>
              <div class="p-price" style="margin-top: var(--space-2)">Price: {{ fmtIRR(p.pricePerDay) }} IRR/Day</div>
            </div>
          </div>

          <table v-else class="ar-table" style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md)">
            <thead>
              <tr><th></th><th>Type</th><th>CPU</th><th>RAM</th><th>Max Nodes</th><th>Price</th></tr>
            </thead>
            <tbody>
              <tr
                v-for="p in CP_PLANS"
                :key="p.id"
                class="selectable"
                :class="{ selected: draft.cp.plan === p.id }"
                @click="selectType(p)"
              >
                <td style="width: 36px"><span class="ar-tag" :class="{ primary: draft.cp.plan === p.id }"><span class="dot"></span></span></td>
                <td class="cell-main">{{ p.name }}</td>
                <td class="text-body-2">{{ p.vcpu }} vCPU</td>
                <td class="text-body-2">{{ p.ram }} GB</td>
                <td class="text-body-2">{{ p.maxNodes }}</td>
                <td class="text-body-2">{{ fmtIRR(p.pricePerDay) }} IRR/Day</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ================= CLUSTER CONFIGURATION ================= -->
        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0">Cluster Configuration</h3>
          <p class="text-body-2 muted" style="margin: 2px 0 var(--space-4)">Configure the core settings of your Kubernetes cluster.</p>

          <div style="display: flex; flex-direction: column; gap: var(--space-2); max-width: 520px">
            <div class="ar-field">
              <label>Cluster Size<span class="req">*</span></label>
              <div class="ar-input">
                <select v-model.number="draft.clusterSize">
                  <option v-for="n in sizeOptions" :key="n" :value="n">{{ n }} Nodes</option>
                </select>
                <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
              </div>
              <div class="banner warning" style="margin-top: var(--space-2)">
                <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2 14.5 13.5H1.5L8 2Z"/><path d="M8 6.8v3M8 12.2v.2"/></svg>
                <span>Select the maximum number of nodes that can be managed by the cluster. After the cluster is created, you can upgrade the flavor of the master nodes, but you cannot downgrade it.</span>
              </div>
            </div>

            <div class="ar-field" style="margin-top: var(--space-4)">
              <label>Kubernetes Version<span class="req">*</span></label>
              <div class="ar-input">
                <select v-model="draft.version">
                  <option v-for="v in VERSIONS" :key="v.id" :value="v.id">{{ v.patch }}</option>
                </select>
                <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
              </div>
              <div class="banner info" style="margin-top: var(--space-2)">
                <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
                <span>We generally recommend the latest version unless your team has a specific need.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= NETWORK ================= -->
        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0">Network</h3>
          <p class="text-body-2 muted" style="margin: 2px 0 var(--space-4)">Set up the network for your cluster.</p>

          <!-- Cluster Network -->
          <div style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md); padding: 0 var(--space-6); margin-bottom: var(--space-4)">
            <div class="collapse-head" :class="{ closed: !net.cluster }" style="padding: var(--space-4) 0" @click="net.cluster = !net.cluster">
              <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 6.5 4 4 4-4"/></svg>
              <span class="text-body-1">Cluster Network<span class="req">*</span></span>
            </div>
            <div v-if="net.cluster" style="display: flex; flex-direction: column; gap: var(--space-4); padding-bottom: var(--space-6)">
              <div class="ar-field" style="max-width: 520px">
                <label>VPC<span class="req">*</span></label>
                <div class="ar-input">
                  <select v-model="draft.vpcId" @change="draft.subnetIds = []">
                    <option value="" disabled>Select a VPC…</option>
                    <option v-for="v in VPCS" :key="v.id" :value="v.id">{{ v.name }} ({{ v.cidr }})</option>
                  </select>
                  <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
                </div>
              </div>

              <div class="ar-field">
                <span class="ar-field-label">Access Type<span class="req">*</span></span>
                <div class="seg">
                  <button :class="{ on: draft.accessType === 'single' }" @click="setAccess('single')">Single AZ</button>
                  <button :class="{ on: draft.accessType === 'multi' }" @click="setAccess('multi')">Multi AZ</button>
                </div>
              </div>

              <div class="ar-field">
                <span class="ar-field-label">Subnet<span class="req">*</span></span>
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
                      <td><span class="ar-tag" :class="{ primary: draft.subnetIds.includes(sn.id) }"><span class="dot"></span></span></td>
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
                <span class="hint">{{ draft.accessType === 'single' ? 'Single AZ — pick one subnet.' : 'Multi AZ — pick one subnet per availability zone.' }}</span>
              </div>

              <div class="ar-field" style="max-width: 520px; position: relative" ref="sgRoot">
                <span class="ar-field-label">Node Security Group Firewall<span class="req">*</span></span>
                <div class="tagbox" :class="{ open: sgOpen }" @click="sgOpen = !sgOpen">
                  <template v-if="draft.securityGroups.length">
                    <span v-for="g in draft.securityGroups" :key="g" class="ar-tag">
                      {{ g }}
                      <button class="tag-x" aria-label="Remove" @click.stop="toggleSg(g)">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 4 8 8M12 4l-8 8"/></svg>
                      </button>
                    </span>
                  </template>
                  <span v-else class="placeholder">Select firewall groups…</span>
                  <svg class="chev" style="margin-left:auto" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
                </div>
                <div v-if="sgOpen" class="tag-dropdown">
                  <label v-for="g in FIREWALL_GROUPS" :key="g">
                    <span class="ar-checkbox">
                      <input type="checkbox" :checked="draft.securityGroups.includes(g)" @change="toggleSg(g)" />
                      <span class="box"><svg class="check" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
                    </span>
                    {{ g }}
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Container Network -->
          <div style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md); padding: 0 var(--space-6); margin-bottom: var(--space-4)">
            <div class="collapse-head" :class="{ closed: !net.container }" style="padding: var(--space-4) 0" @click="net.container = !net.container">
              <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 6.5 4 4 4-4"/></svg>
              <span class="text-body-1">Container Network<span class="req">*</span></span>
            </div>
            <div v-if="net.container" style="display: flex; flex-direction: column; gap: var(--space-2); padding-bottom: var(--space-6)">
              <div v-for="(row, i) in draft.podCidrs" :key="i" class="cidr-row">
                <span class="cidr-idx">{{ i + 1 }}</span>
                <div class="cidr-octets" :class="{ invalid: row.octets.some((o) => o === '' || +o > 255) }">
                  <template v-for="(o, j) in row.octets" :key="j">
                    <input :value="o" inputmode="numeric" @input="octetInput($event, row, j)" aria-label="Octet" />
                    <span v-if="j < 3" class="dot-sep">.</span>
                  </template>
                  <span class="slash">/</span>
                  <select v-model="row.prefix" aria-label="Prefix">
                    <option v-for="p in ['8','12','16','17','18','20','22','24','26','28']" :key="p" :value="p">{{ p }}</option>
                  </select>
                </div>
                <button class="cidr-btn" :disabled="draft.podCidrs.length <= 1" @click="removeCidr(draft.podCidrs, i)" aria-label="Remove CIDR">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h10M5.5 4V3h5v1M4.5 4l.7 9h5.6l.7-9"/></svg>
                </button>
                <button v-if="i === draft.podCidrs.length - 1" class="cidr-btn" @click="addCidr(draft.podCidrs)" aria-label="Add CIDR">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
                </button>
              </div>
              <div class="banner warning" style="margin-top: var(--space-2)">
                <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2 14.5 13.5H1.5L8 2Z"/><path d="M8 6.8v3M8 12.2v.2"/></svg>
                CIDR range cannot be changed after creation.
              </div>
            </div>
          </div>

          <!-- Service Network -->
          <div style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md); padding: 0 var(--space-6)">
            <div class="collapse-head" :class="{ closed: !net.service }" style="padding: var(--space-4) 0" @click="net.service = !net.service">
              <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 6.5 4 4 4-4"/></svg>
              <span class="text-body-1">Service Network<span class="req">*</span></span>
            </div>
            <div v-if="net.service" style="display: flex; flex-direction: column; gap: var(--space-2); padding-bottom: var(--space-6)">
              <div v-for="(row, i) in draft.svcCidrs" :key="i" class="cidr-row">
                <span class="cidr-idx">{{ i + 1 }}</span>
                <div class="cidr-octets" :class="{ invalid: row.octets.some((o) => o === '' || +o > 255) }">
                  <template v-for="(o, j) in row.octets" :key="j">
                    <input :value="o" inputmode="numeric" @input="octetInput($event, row, j)" aria-label="Octet" />
                    <span v-if="j < 3" class="dot-sep">.</span>
                  </template>
                  <span class="slash">/</span>
                  <select v-model="row.prefix" aria-label="Prefix">
                    <option v-for="p in ['8','12','16','17','18','20','22','24','26','28']" :key="p" :value="p">{{ p }}</option>
                  </select>
                </div>
                <button class="cidr-btn" :disabled="draft.svcCidrs.length <= 1" @click="removeCidr(draft.svcCidrs, i)" aria-label="Remove CIDR">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h10M5.5 4V3h5v1M4.5 4l.7 9h5.6l.7-9"/></svg>
                </button>
                <button v-if="i === draft.svcCidrs.length - 1" class="cidr-btn" @click="addCidr(draft.svcCidrs)" aria-label="Add CIDR">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
                </button>
              </div>
              <div class="banner warning" style="margin-top: var(--space-2)">
                <svg style="flex:none" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2 14.5 13.5H1.5L8 2Z"/><path d="M8 6.8v3M8 12.2v.2"/></svg>
                CIDR range cannot be changed after creation.
              </div>
            </div>
          </div>
        </div>

        <!-- ================= NODE POOL ================= -->
        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0">Node Pool</h3>
          <p class="text-body-2 muted" style="margin: 2px 0 var(--space-4)">Create and configure a group of nodes for your cluster.</p>

          <div
            v-for="(pool, i) in draft.pools"
            :key="i"
            style="border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md); margin-bottom: var(--space-4)"
          >
            <div class="pool-head" @click="togglePool(i)">
              <svg class="chev" :style="{ transform: poolsOpen[i] ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .2s' }" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 6.5 4 4 4-4"/></svg>
              <span class="p-title">Node Pool {{ i + 1 }}</span>
              <span class="spacer"></span>
              <button class="delete-link" :disabled="draft.pools.length <= 1" @click.stop="removePool(i)">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h10M5.5 4V3h5v1M4.5 4l.7 9h5.6l.7-9"/></svg>
                Delete
              </button>
            </div>
            <div v-if="poolsOpen[i]" class="pool-body">
              <div class="ar-field" style="max-width: 520px">
                <label>Pool Name<span class="req">*</span></label>
                <div class="ar-input" :class="{ 'error-mode': pool.name && !/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(pool.name) }">
                  <input v-model="pool.name" placeholder="Enter a name" spellcheck="false" style="text-transform: lowercase" />
                </div>
                <span v-if="pool.name && !/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(pool.name)" class="error-text">Lowercase letters, digits and dashes. 3–40 characters.</span>
              </div>

              <div class="ar-field" style="max-width: 520px">
                <label>Flavor<span class="req">*</span></label>
                <div class="ar-input">
                  <select v-model="pool.flavor">
                    <option v-for="f in FLAVORS" :key="f.id" :value="f.id">{{ f.name }} · {{ f.vcpu }} vCPU / {{ f.ram }} GB</option>
                  </select>
                  <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
                </div>
                <span class="hint">{{ FLAVORS.find((f) => f.id === pool.flavor)?.helper }}</span>
              </div>

              <div style="display: flex; flex-direction: column; gap: var(--space-3)">
                <label style="display: flex; align-items: center; gap: var(--space-3); cursor: pointer">
                  <ArToggle v-model="pool.autoscale.enabled" />
                  <span class="text-body-2-strong">Auto scale</span>
                </label>

                <div style="display: flex; gap: var(--space-6); flex-wrap: wrap">
                  <div class="ar-field">
                    <label>Nodes<span class="req">*</span></label>
                    <div class="count-input">
                      <button :disabled="pool.count <= 1" @click="pool.count--">−</button>
                      <input v-model.number="pool.count" type="number" min="1" max="20" />
                      <button :disabled="pool.count >= 20" @click="pool.count++">+</button>
                    </div>
                  </div>
                  <template v-if="pool.autoscale.enabled">
                    <div class="ar-field">
                      <label>Min Nodes<span class="req">*</span></label>
                      <div class="count-input">
                        <button :disabled="pool.autoscale.min <= 1" @click="pool.autoscale.min--">−</button>
                        <input v-model.number="pool.autoscale.min" type="number" min="1" max="20" />
                        <button :disabled="pool.autoscale.min >= 20" @click="pool.autoscale.min++">+</button>
                      </div>
                      <span class="hint">We recommend a minimum of 2 nodes to ensure uptime during upgrades or maintenance.</span>
                    </div>
                    <div class="ar-field">
                      <label>Max Nodes<span class="req">*</span></label>
                      <div class="count-input">
                        <button :disabled="pool.autoscale.max <= 1" @click="pool.autoscale.max--">−</button>
                        <input v-model.number="pool.autoscale.max" type="number" min="1" max="20" />
                        <button :disabled="pool.autoscale.max >= 20" @click="pool.autoscale.max++">+</button>
                      </div>
                    </div>
                  </template>
                </div>
                <span v-if="pool.autoscale.enabled && pool.autoscale.max < pool.autoscale.min" class="error-text">Max nodes must be greater than or equal to min nodes.</span>
              </div>
            </div>
          </div>

          <ArButton variant="secondary" @click="addPool">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M3 8h10"/></svg>
            Add Node Pool
          </ArButton>
        </div>

        <!-- ================= BASIC INFO ================= -->
        <div class="ar-card" style="padding: var(--space-6)">
          <h3 class="text-title-3" style="margin: 0 0 var(--space-4)">Basic Info</h3>
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
        <div class="ar-card rail-card" style="display: flex; flex-direction: column; gap: var(--space-3)">
          <div class="rail-group">
            <h4>Region</h4>
            <div class="rail-lines">
              <div class="line"><span class="lk">Region</span><span class="lv">{{ region?.name }}</span></div>
              <div class="line"><span class="lk">Kubernetes Version</span><span class="lv">{{ VERSIONS.find((v) => v.id === draft.version)?.patch }}</span></div>
            </div>
          </div>

          <div class="rail-group">
            <h4>Network</h4>
            <div class="rail-lines">
              <div class="line"><span class="lk">VPC</span><span class="lv">{{ vpc?.name || '—' }}</span></div>
              <div class="line">
                <span class="lk">Subnet</span>
                <span class="lv">
                  <template v-if="draft.subnetIds.length">
                    {{ draft.subnetIds.slice(0, 2).map((id) => vpc?.subnets.find((s) => s.id === id)?.name).join(', ') }}{{ draft.subnetIds.length > 2 ? ` +${draft.subnetIds.length - 2}` : '' }}
                  </template>
                  <template v-else>—</template>
                </span>
              </div>
              <div class="line"><span class="lk">Access</span><span class="lv">{{ draft.accessType === 'single' ? 'Single AZ' : 'Multi AZ' }}</span></div>
              <div class="line"><span class="lk">Pod CIDR</span><span class="lv mono">{{ cidrStr(draft.podCidrs[0]) }}</span></div>
              <div class="line"><span class="lk">Service CIDR</span><span class="lv mono">{{ cidrStr(draft.svcCidrs[0]) }}</span></div>
              <div class="line"><span class="lk">Firewall</span><span class="lv">{{ draft.securityGroups.join(', ') || '—' }}</span></div>
            </div>
          </div>

          <div class="rail-group">
            <h4>Node Pool</h4>
            <div class="rail-lines" v-for="(pool, i) in draft.pools" :key="i">
              <div class="line"><span class="lk">Pool {{ i + 1 }} Name</span><span class="lv">{{ pool.name || '—' }}</span></div>
              <div class="line"><span class="lk">Flavor</span><span class="lv">{{ flavorName(pool.flavor) }}</span></div>
              <div class="line"><span class="lk">Auto Scale</span><span class="lv">{{ pool.autoscale.enabled ? 'Enabled' : 'Disabled' }}</span></div>
              <div class="line"><span class="lk">Nodes</span><span class="lv">{{ pool.count }}</span></div>
              <div class="line" v-if="pool.autoscale.enabled"><span class="lk">Min / Max Nodes</span><span class="lv">{{ pool.autoscale.min }} / {{ pool.autoscale.max }}</span></div>
            </div>
          </div>

          <div class="rail-group">
            <h4>Kubernetes Cluster Name</h4>
            <div class="rail-lines">
              <div class="line"><span class="lk">Name</span><span class="lv">{{ draft.name || '—' }}</span></div>
            </div>
          </div>

          <div class="rail-group">
            <div class="price-block">
              <span class="ph">{{ fmtIRR(price.hourly) }} <span class="text-caption-1 muted">IRR/Hour</span></span>
              <span class="text-body-2-strong">{{ fmtIRR(price.total) }} IRR</span>
            </div>
            <p class="text-caption-1 muted" style="margin: 0 0 var(--space-2)">Estimated / month · demo pricing</p>
            <ArButton variant="primary" style="width: 100%" :loading="creating" :disabled="!canCreate" @click="create">
              Create Kubernetes Cluster
            </ArButton>
            <p v-if="!canCreate" class="text-caption-1 muted" style="margin: var(--space-2) 0 0; text-align: center">
              Complete name, subnets, CIDRs and node pools to enable creation.
            </p>
          </div>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.page-wide { max-width: 1280px; }
</style>
