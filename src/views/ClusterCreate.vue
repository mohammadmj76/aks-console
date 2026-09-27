<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import { REGION, VERSIONS, CP_PLANS, FLAVORS, VPCS, POD_CIDRS, SVC_CIDRS, INCLUDED_COMPONENTS, monthlyPrice, fmtToman } from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArToggle from '../components/ui/ArToggle.vue'

const router = useRouter()

/* ------- draft state (survives step navigation) ------- */
const draft = reactive({
  name: '',
  description: '',
  version: VERSIONS.find((v) => v.default).id,
  cp: { plan: 'cp-medium', ha: true },
  vpcId: '',
  subnetIds: [],
  podCidr: POD_CIDRS[0],
  svcCidr: SVC_CIDRS[0],
  monitoring: true,
  auditLogs: false,
  pool: {
    name: 'default-pool',
    flavor: 'g4-4-8',
    count: 2,
    zones: ['foroogh'],
    volumeGb: 50,
    autoscale: { enabled: false, min: 2, max: 4 },
  },
})

/* ------- stepper ------- */
const step = ref(1)
const steps = [
  { n: 1, label: 'Cluster & control plane' },
  { n: 2, label: 'Network & node pool' },
  { n: 3, label: 'Review & create' },
]
const stepError = ref('')

/* ------- validation ------- */
const nameOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.name))
const vpc = computed(() => VPCS.find((v) => v.id === draft.vpcId))
const subnetOk = computed(() => draft.subnetIds.length > 0)
const poolNameOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.pool.name))
const autoscaleOk = computed(
  () => !draft.pool.autoscale.enabled || (draft.pool.autoscale.min >= 1 && draft.pool.autoscale.max >= draft.pool.autoscale.min && draft.pool.autoscale.max <= 20)
)
const step1Ok = computed(() => nameOk.value)
const step2Ok = computed(() => subnetOk.value && poolNameOk.value && draft.pool.count >= 1 && autoscaleOk.value)

function goStep(n) {
  stepError.value = ''
  if (n === 2 && !step1Ok.value) {
    stepError.value = 'Enter a valid cluster name before continuing (lowercase letters, digits and dashes; 3–40 chars).'
    return
  }
  if (n === 3 && !step2Ok.value) {
    stepError.value = 'Complete the network and node pool settings before reviewing.'
    return
  }
  if (n > step.value && !step1Ok.value) {
    stepError.value = 'Enter a valid cluster name before continuing.'
    return
  }
  step.value = n
}

/* ------- summary / price ------- */
const price = computed(() =>
  monthlyPrice({ cp: draft.cp, pools: [{ ...draft.pool, count: autoscaledCount.value }] })
)
const autoscaledCount = computed(() => (draft.pool.autoscale.enabled ? draft.pool.autoscale.min : draft.pool.count))

const summaryLines = computed(() => [
  { k: 'Region', v: `${REGION.name} (${REGION.id})` },
  { k: 'Kubernetes', v: VERSIONS.find((v) => v.id === draft.version)?.patch },
  { k: 'Control plane', v: `${CP_PLANS.find((p) => p.id === draft.cp.plan).name}${draft.cp.ha ? ' · HA ×3' : ''}` },
  { k: 'VPC', v: vpc.value ? vpc.value.name : '—' },
  { k: 'Subnets', v: draft.subnetIds.length ? `${draft.subnetIds.length} selected` : '—' },
  { k: 'Pod CIDR', v: draft.podCidr },
  { k: 'Service CIDR', v: draft.svcCidr },
])

function toggleZone(z) {
  const i = draft.pool.zones.indexOf(z)
  if (i >= 0) draft.pool.zones.splice(i, 1)
  else draft.pool.zones.push(z)
}
function toggleSubnet(id) {
  const i = draft.subnetIds.indexOf(id)
  if (i >= 0) draft.subnetIds.splice(i, 1)
  else draft.subnetIds.push(id)
}
function onVpcChange() {
  draft.subnetIds = []
}

/* ------- create ------- */
const creating = ref(false)
function create() {
  creating.value = true
  setTimeout(() => {
    const cluster = store.createCluster(JSON.parse(JSON.stringify(draft)))
    creating.value = false
    store.toast('info', 'Provisioning started', `${cluster.name} is being created — this usually takes a few minutes.`)
    router.push(`/clusters/${cluster.id}`)
  }, 800)
}
</script>

<template>
  <main class="page">
    <div class="page-header">
      <div>
        <div class="title-row">
          <router-link to="/clusters" class="ar-btn ghost icon" aria-label="Back to clusters" style="text-decoration: none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3 5 8l5 5"/></svg>
          </router-link>
          <h1 class="text-title-2" style="margin: 0">Create cluster</h1>
        </div>
        <div class="meta">
          <span class="text-body-2 muted">A dedicated control plane is provisioned for every cluster in your own VPC.</span>
        </div>
      </div>
    </div>

    <!-- stepper -->
    <nav class="ar-steps" aria-label="Create cluster steps">
      <template v-for="(s, i) in steps" :key="s.n">
        <div
          class="ar-step"
          :class="{ current: step === s.n, done: step > s.n }"
          @click="step > s.n && goStep(s.n)"
        >
          <span class="bubble">
            <svg v-if="step > s.n" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg>
            <template v-else>{{ s.n }}</template>
          </span>
          <span class="label">{{ s.label }}</span>
        </div>
        <div v-if="i < steps.length - 1" class="bar"></div>
      </template>
    </nav>

    <div v-if="stepError" class="banner warning" style="margin-bottom: var(--space-4)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5.2v3.4M8 11.4v.2"/><circle cx="8" cy="8" r="6.2"/></svg>
      {{ stepError }}
    </div>

    <div class="wizard-grid">
      <div class="wizard-main">
        <!-- ================= STEP 1 ================= -->
        <template v-if="step === 1">
          <div class="ar-card" style="padding: var(--space-6)">
            <div class="ar-section-head">
              <div>
                <h3 class="text-title-3" style="margin: 0">Cluster settings</h3>
                <p class="text-body-2 muted" style="margin: 2px 0 0">Name, description and Kubernetes version.</p>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: var(--space-4)">
              <div class="ar-field">
                <label>Cluster name<span class="req">*</span></label>
                <div class="ar-input" :class="{ 'error-mode': draft.name && !nameOk }">
                  <input v-model="draft.name" placeholder="e.g. prod-platform" spellcheck="false" autocomplete="off" style="text-transform: lowercase" />
                </div>
                <span class="hint" :class="{ 'error-text': draft.name && !nameOk }">
                  Lowercase letters, digits and dashes; starts with a letter, ends with a letter or digit. 3–40 characters.
                </span>
              </div>

              <div class="ar-field">
                <label>Description</label>
                <div class="ar-input">
                  <input v-model="draft.description" placeholder="What is this cluster for? (optional)" />
                </div>
              </div>

              <div class="ar-field">
                <label>Kubernetes version<span class="req">*</span></label>
                <div class="ar-input" style="max-width: 320px">
                  <select v-model="draft.version">
                    <option v-for="v in VERSIONS" :key="v.id" :value="v.id">
                      {{ v.patch }}{{ v.default ? ' — default' : '' }}{{ v.deprecation ? ` — ${v.deprecation}` : '' }}
                    </option>
                  </select>
                  <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
                </div>
                <span class="hint">Minor-version upgrades are user-initiated and rolling. The control plane is upgraded first, then worker pools.</span>
              </div>
            </div>
          </div>

          <div class="ar-card" style="padding: var(--space-6)">
            <div class="ar-section-head">
              <div>
                <h3 class="text-title-3" style="margin: 0">Control plane</h3>
                <p class="text-body-2 muted" style="margin: 2px 0 0">Every cluster gets a dedicated control plane. etcd backups are always on.</p>
              </div>
              <span class="ar-badge primary pill">etcd backup included</span>
            </div>

            <div class="ar-field">
              <span class="ar-field-label">Plan<span class="req">*</span></span>
              <div class="plan-grid cols-2">
                <div
                  v-for="p in CP_PLANS"
                  :key="p.id"
                  class="ar-card selectable plan"
                  :class="{ selected: draft.cp.plan === p.id }"
                  @click="draft.cp.plan = p.id"
                >
                  <span class="p-check"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
                  <div class="p-name">{{ p.name }}</div>
                  <div class="p-spec">{{ p.vcpu }} vCPU · {{ p.ram }} GB RAM per CP node</div>
                  <div class="p-spec">Up to {{ p.maxNodes }} worker nodes</div>
                  <div class="p-price">{{ fmtToman(p.price) }} T/mo per CP node</div>
                </div>
              </div>
            </div>

            <div class="ar-field" style="margin-top: var(--space-4)">
              <span class="ar-field-label">Availability<span class="req">*</span></span>
              <div class="plan-grid cols-2">
                <div class="ar-card selectable plan" :class="{ selected: !draft.cp.ha }" @click="draft.cp.ha = false">
                  <span class="p-check"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
                  <div class="p-name">Single node</div>
                  <div class="p-spec">One CP VM. Fine for dev/test — not recommended for production.</div>
                </div>
                <div class="ar-card selectable plan" :class="{ selected: draft.cp.ha }" @click="draft.cp.ha = true">
                  <span class="p-check"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
                  <div class="p-name">High availability <span class="ar-badge success pill" style="margin-left: 4px">recommended</span></div>
                  <div class="p-spec">3 CP VMs, one per availability zone ({{ REGION.zones.map((z) => z.name).join(', ') }}).</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ================= STEP 2 ================= -->
        <template v-if="step === 2">
          <div class="ar-card" style="padding: var(--space-6)">
            <div class="ar-section-head">
              <div>
                <h3 class="text-title-3" style="margin: 0">Network</h3>
                <p class="text-body-2 muted" style="margin: 2px 0 0">The cluster runs inside your VPC. Nodes get addresses from the selected subnets.</p>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: var(--space-4)">
              <div class="ar-field">
                <label>VPC<span class="req">*</span></label>
                <div class="ar-input" style="max-width: 320px">
                  <select v-model="draft.vpcId" @change="onVpcChange">
                    <option value="" disabled>Select a VPC…</option>
                    <option v-for="v in VPCS" :key="v.id" :value="v.id">{{ v.name }} · {{ v.cidr }}</option>
                  </select>
                  <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
                </div>
              </div>

              <div class="ar-field">
                <span class="ar-field-label">Subnets<span class="req">*</span></span>
                <div class="chip-row">
                  <template v-if="vpc">
                    <button
                      v-for="sn in vpc.subnets"
                      :key="sn.id"
                      class="chip"
                      :class="{ on: draft.subnetIds.includes(sn.id) }"
                      @click="toggleSubnet(sn.id)"
                    >
                      <span class="tick"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
                      {{ sn.name }} · {{ sn.cidr }} · {{ REGION.zones.find((z) => z.id === sn.zone)?.name }}
                    </button>
                  </template>
                  <span v-else class="text-caption-1 muted">Select a VPC first.</span>
                </div>
                <span class="hint">Pick one subnet per availability zone you want worker nodes in.</span>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4)">
                <div class="ar-field">
                  <label>Pod network CIDR</label>
                  <div class="ar-input">
                    <select v-model="draft.podCidr">
                      <option v-for="c in POD_CIDRS" :key="c">{{ c }}</option>
                    </select>
                    <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
                  </div>
                </div>
                <div class="ar-field">
                  <label>Service network CIDR</label>
                  <div class="ar-input">
                    <select v-model="draft.svcCidr">
                      <option v-for="c in SVC_CIDRS" :key="c">{{ c }}</option>
                    </select>
                    <svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6.5 4 4 4-4"/></svg>
                  </div>
                </div>
              </div>
              <div class="callout">
                <svg style="margin-top: 2px" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
                CIDRs must not overlap the VPC range ({{ vpc?.cidr || 'selected VPC' }}) or peered networks. The API server is reachable over the public internet; firewall rules apply.
              </div>
            </div>
          </div>

          <div class="ar-card" style="padding: var(--space-6)">
            <div class="ar-section-head">
              <div>
                <h3 class="text-title-3" style="margin: 0">First node pool</h3>
                <p class="text-body-2 muted" style="margin: 2px 0 0">Worker nodes run your workloads. You can add more pools after the cluster is created.</p>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: var(--space-4)">
              <div class="ar-field">
                <label>Pool name<span class="req">*</span></label>
                <div class="ar-input" :class="{ 'error-mode': draft.pool.name && !poolNameOk }" style="max-width: 320px">
                  <input v-model="draft.pool.name" spellcheck="false" style="text-transform: lowercase" />
                </div>
                <span v-if="draft.pool.name && !poolNameOk" class="error-text">Same rules as the cluster name.</span>
              </div>

              <div class="ar-field">
                <span class="ar-field-label">Flavor<span class="req">*</span></span>
                <div class="plan-grid cols-4">
                  <div
                    v-for="f in FLAVORS"
                    :key="f.id"
                    class="ar-card selectable plan"
                    :class="{ selected: draft.pool.flavor === f.id }"
                    @click="draft.pool.flavor = f.id"
                  >
                    <span class="p-check"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
                    <div class="p-name">{{ f.id }}</div>
                    <div class="p-spec">{{ f.vcpu }} vCPU · {{ f.ram }} GB RAM</div>
                    <div class="p-price">{{ fmtToman(f.price) }} T/mo</div>
                  </div>
                </div>
              </div>

              <div class="ar-field">
                <span class="ar-field-label">Availability zones</span>
                <div class="chip-row">
                  <button
                    v-for="z in REGION.zones"
                    :key="z.id"
                    class="chip"
                    :class="{ on: draft.pool.zones.includes(z.id) }"
                    @click="toggleZone(z.id)"
                  >
                    <span class="tick"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
                    {{ z.name }}
                  </button>
                </div>
                <span class="hint">Nodes are spread across the selected zones. No zones selected → all zones.</span>
              </div>

              <div style="display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-6); align-items: end">
                <div class="ar-field">
                  <label>Node count</label>
                  <div class="count-input">
                    <button :disabled="draft.pool.count <= 1" @click="draft.pool.count--">−</button>
                    <input v-model.number="draft.pool.count" type="number" min="1" max="20" />
                    <button :disabled="draft.pool.count >= 20" @click="draft.pool.count++">+</button>
                  </div>
                </div>
                <div class="ar-field">
                  <label>Root volume (ssd-g1)</label>
                  <div class="ar-input" style="max-width: 220px">
                    <select v-model.number="draft.pool.volumeGb">
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
                  <ArToggle v-model="draft.pool.autoscale.enabled" />
                  <span>
                    <span class="text-body-2-strong">Autoscaling</span>
                    <span class="text-caption-1 muted" style="display: block">Add or remove nodes between min and max based on pending pods.</span>
                  </span>
                </label>
                <div v-if="draft.pool.autoscale.enabled" style="display: flex; gap: var(--space-4)">
                  <div class="ar-field" style="width: 120px">
                    <label>Min nodes</label>
                    <div class="ar-input"><input v-model.number="draft.pool.autoscale.min" type="number" min="1" max="20" /></div>
                  </div>
                  <div class="ar-field" style="width: 120px">
                    <label>Max nodes</label>
                    <div class="ar-input"><input v-model.number="draft.pool.autoscale.max" type="number" min="1" max="20" /></div>
                  </div>
                </div>
                <span v-if="!autoscaleOk" class="error-text">1 ≤ min ≤ max ≤ 20.</span>
              </div>
            </div>
          </div>

          <div class="ar-card" style="padding: var(--space-6)">
            <div class="ar-section-head">
              <div>
                <h3 class="text-title-3" style="margin: 0">Operations</h3>
                <p class="text-body-2 muted" style="margin: 2px 0 0">Observability integrations. Both can be changed later.</p>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-4)">
              <label style="display: flex; align-items: center; gap: var(--space-3); cursor: pointer">
                <ArToggle v-model="draft.monitoring" />
                <span>
                  <span class="text-body-2-strong">Prometheus metrics endpoint</span>
                  <span class="text-caption-1 muted" style="display: block">Expose cluster metrics on a per-cluster scrape endpoint.</span>
                </span>
              </label>
              <label style="display: flex; align-items: center; gap: var(--space-3); cursor: pointer">
                <ArToggle v-model="draft.auditLogs" />
                <span>
                  <span class="text-body-2-strong">Audit logs to Cloud Logs</span>
                  <span class="text-caption-1 muted" style="display: block">Stream API-server and platform actions to your Cloud Logs project.</span>
                </span>
              </label>
            </div>
          </div>
        </template>

        <!-- ================= STEP 3 : REVIEW ================= -->
        <template v-if="step === 3">
          <div class="ar-card" style="padding: var(--space-6)">
            <div class="ar-section-head">
              <div>
                <h3 class="text-title-3" style="margin: 0">Cluster</h3>
                <button class="ar-btn tertiary sm" @click="goStep(1)">Edit</button>
              </div>
            </div>
            <div class="kv">
              <div class="row"><span class="k">Name</span><span class="v cell-main">{{ draft.name || '—' }}</span></div>
              <div class="row"><span class="k">Description</span><span class="v">{{ draft.description || '—' }}</span></div>
              <div class="row"><span class="k">Kubernetes version</span><span class="v">{{ VERSIONS.find((v) => v.id === draft.version)?.patch }}</span></div>
              <div class="row"><span class="k">Region</span><span class="v">{{ REGION.name }} · {{ REGION.zones.map((z) => z.name).join(' / ') }}</span></div>
              <div class="row">
                <span class="k">Control plane</span>
                <span class="v">{{ CP_PLANS.find((p) => p.id === draft.cp.plan).name }} · {{ draft.cp.ha ? 'High availability (3 nodes, one per zone)' : 'Single node' }}</span>
              </div>
              <div class="row"><span class="k">etcd backups</span><span class="v">Enabled — daily snapshots, retained automatically</span></div>
            </div>
          </div>

          <div class="ar-card" style="padding: var(--space-6)">
            <div class="ar-section-head">
              <div>
                <h3 class="text-title-3" style="margin: 0">Network</h3>
                <button class="ar-btn tertiary sm" @click="goStep(2)">Edit</button>
              </div>
            </div>
            <div class="kv">
              <div class="row"><span class="k">VPC</span><span class="v">{{ vpc ? `${vpc.name} (${vpc.cidr})` : '—' }}</span></div>
              <div class="row">
                <span class="k">Subnets</span>
                <span class="v">
                  <span v-if="!draft.subnetIds.length" class="muted">—</span>
                  <span v-else class="chip-row">
                    <span v-for="sid in draft.subnetIds" :key="sid" class="ar-tag">
                      {{ vpc?.subnets.find((s) => s.id === sid)?.name }} · {{ vpc?.subnets.find((s) => s.id === sid)?.cidr }}
                    </span>
                  </span>
                </span>
              </div>
              <div class="row"><span class="k">Pod / Service CIDR</span><span class="v mono">{{ draft.podCidr }} / {{ draft.svcCidr }}</span></div>
              <div class="row"><span class="k">API server</span><span class="v">Public endpoint · firewall rules apply</span></div>
            </div>
          </div>

          <div class="ar-card" style="padding: var(--space-6)">
            <div class="ar-section-head">
              <div>
                <h3 class="text-title-3" style="margin: 0">Node pool</h3>
                <button class="ar-btn tertiary sm" @click="goStep(2)">Edit</button>
              </div>
            </div>
            <div class="kv">
              <div class="row"><span class="k">Name</span><span class="v cell-main">{{ draft.pool.name }}</span></div>
              <div class="row">
                <span class="k">Nodes</span>
                <span class="v">
                  {{ autoscaledCount }} × {{ draft.pool.flavor }}
                  <span v-if="draft.pool.autoscale.enabled" class="ar-badge primary pill" style="margin-left: 6px">autoscale {{ draft.pool.autoscale.min }}–{{ draft.pool.autoscale.max }}</span>
                </span>
              </div>
              <div class="row">
                <span class="k">Zones</span>
                <span class="v">{{ draft.pool.zones.length ? draft.pool.zones.map((z) => REGION.zones.find((zz) => zz.id === z)?.name).join(', ') : 'All zones' }}</span>
              </div>
              <div class="row"><span class="k">Root volume</span><span class="v">ssd-g1 · {{ draft.pool.volumeGb }} GB per node</span></div>
              <div class="row">
                <span class="k">Operations</span>
                <span class="v">Metrics: {{ draft.monitoring ? 'on' : 'off' }} · Audit logs: {{ draft.auditLogs ? 'on' : 'off' }}</span>
              </div>
            </div>
          </div>

          <div class="ar-card" style="padding: var(--space-6)">
            <h3 class="text-title-3" style="margin: 0 0 var(--space-3)">Included platform components</h3>
            <p class="text-body-2 muted" style="margin: 0 0 var(--space-4)">Installed automatically with every cluster.</p>
            <div class="chip-row">
              <span v-for="c in INCLUDED_COMPONENTS" :key="c.name" class="ar-tag"><span class="dot"></span>{{ c.name }} · v{{ c.version }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- ================= SUMMARY RAIL ================= -->
      <aside class="wizard-rail">
        <div class="ar-card rail-card">
          <h3 class="text-title-3">Order summary</h3>
          <div class="rail-lines">
            <div v-for="l in summaryLines" :key="l.k" class="line">
              <span class="lk">{{ l.k }}</span><span class="lv">{{ l.v }}</span>
            </div>
          </div>
        </div>

        <div class="ar-card rail-card">
          <h3 class="text-title-3">Estimated cost</h3>
          <div class="rail-lines">
            <div class="line">
              <span class="lk">Control plane ({{ draft.cp.ha ? '3' : '1' }} node)</span>
              <span class="lv">{{ fmtToman(price.cpCost) }} T</span>
            </div>
            <div class="line">
              <span class="lk">Workers · {{ autoscaledCount }} × {{ draft.pool.flavor }}</span>
              <span class="lv">{{ fmtToman(price.nodesCost) }} T</span>
            </div>
            <div class="line">
              <span class="lk">Root volumes</span>
              <span class="lv">{{ fmtToman(price.volumeCost) }} T</span>
            </div>
            <div class="line total">
              <span class="lk text-body-2-strong">Total / month</span>
              <span class="lv text-body-2-strong">{{ fmtToman(price.total) }} Toman</span>
            </div>
          </div>
          <p class="text-caption-1 muted" style="margin: var(--space-3) 0 0">Demo pricing — actual invoices follow the service tariff.</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: var(--space-3)">
          <ArButton v-if="step === 1" variant="primary" @click="goStep(2)">Next: Network & node pool</ArButton>
          <ArButton v-else-if="step === 2" variant="primary" @click="goStep(3)">Review & create</ArButton>
          <template v-else>
            <ArButton variant="primary" :loading="creating" :disabled="!step2Ok || !nameOk" @click="create">
              Create cluster
            </ArButton>
            <ArButton variant="secondary" @click="goStep(2)">Back</ArButton>
          </template>
          <ArButton v-if="step !== 3 && step !== 1" variant="ghost" @click="goStep(step - 1)">Back</ArButton>
        </div>
      </aside>
    </div>
  </main>
</template>
