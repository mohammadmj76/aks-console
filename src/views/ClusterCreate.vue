<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import {
  REGIONS, REGION, VERSIONS, CP_PLANS, FLAVOR_CATALOG,
  VPCS, VOLUME_PRICE_PER_GB, fmtIRR,
} from '../data'
import ArButton from '../components/ui/ArButton.vue'
import ArBadge from '../components/ui/ArBadge.vue'
import ArCheckbox from '../components/ui/ArCheckbox.vue'
import ArRadioDot from '../components/ui/ArRadioDot.vue'
import ArSelect from '../components/ui/ArSelect.vue'
import ArSection from '../components/ui/ArSection.vue'
import ArField from '../components/ui/ArField.vue'
import ArInput from '../components/ui/ArInput.vue'
import ArAlert from '../components/ui/ArAlert.vue'
import ArTag from '../components/ui/ArTag.vue'
import ArCard from '../components/ui/ArCard.vue'
import ArRadioGroup from '../components/ui/ArRadioGroup.vue'
import ArRadio from '../components/ui/ArRadio.vue'
import ArLinkButton from '../components/ui/ArLinkButton.vue'
import ArTable from '../components/ui/ArTable.vue'
import ArTableRow from '../components/ui/ArTableRow.vue'
import ArTableCell from '../components/ui/ArTableCell.vue'
import ArIcon from '../components/ui/ArIcon.vue'
import PoolCard from '../components/create/PoolCard.vue'

const router = useRouter()

/* tooltip contents (v-tippy on info icons), matching the team convention */
const SPEC_TIPS = {
    replica: 'The number of control plane nodes that run the cluster. If one node stops working, the others keep the cluster running.',
    maxNodes: 'The maximum number of worker nodes that the cluster can manage. You can increase this limit later, but you cannot decrease it.',
    etcd: 'etcd is the database that stores the cluster’s configuration and state. This is the maximum storage size etcd can use. Bigger clusters need more etcd space.',
    size: 'Sets the size of the cluster. It decides how many worker nodes the cluster can manage and the hardware of the control plane nodes. You can make it larger after creation, but you cannot make it smaller.',
    dist: 'Sets where the control plane nodes run. Multi AZ: the nodes run in different availability zones, so the cluster still works if one zone has a problem. Single AZ: all nodes run in one availability zone that you select.',
}
const NETWORK_TIPS = {
    cluster: 'The network that the cluster’s nodes use. Control plane nodes and worker nodes get their IP addresses from the VPC and subnets you select here.',
    pod: 'The IP address range for Kubernetes Pods. Every Pod receives an IP address from this range, so Pods can talk to each other directly.',
    service: 'The IP address range for Kubernetes Services. A Service gives workloads one address that stays the same, even when the Pods behind it change.',
}

const TIPPY_TOP = { placement: 'top', arrow: true }

/* ---------------- draft ---------------- */
const regionId = ref('ir-central-1')
const draft = reactive({
    name: '',
    labels: [],
    version: VERSIONS.find((v) => v.default).id,
    cp: { plan: 'medium' },
    vpcId: '',
    subnetIds: [],
    podCidrs: [{ o1: '172', o2: '16', o3: '0', o4: '0', prefix: '16' }],
    svcCidrs: [{ o1: '10', o2: '10', o3: '0', o4: '0', prefix: '20' }],
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
        image: from?.image || 'ubuntu-22.04',
        rootDisk: from?.rootDisk || 25,
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
/* Single AZ clusters host their worker nodes in the master's AZ too */
const poolAllowedZones = computed(() => (masterDist.value === 'custom' ? [masterHostAz.value] : []))
/* keep existing pools valid when the distribution or AZ changes */
watch(poolAllowedZones, (zones) => {
    if (!zones.length) return
    draft.pools.forEach((p) => {
        p.specs = p.specs.filter((sp) => {
            const f = FLAVOR_CATALOG.find((x) => x.id === sp.flavorId)
            return f?.azs.some((z) => zones.includes(z.id) && !z.soldOut)
        })
        p.specs.forEach((sp) => {
            sp.zones = sp.zones.filter((z) => zones.includes(z))
            if (!sp.zones.length) {
                /* flavor still exists in the new AZ — move it there instead of unselecting */
                const f = FLAVOR_CATALOG.find((x) => x.id === sp.flavorId)
                sp.zones = f.azs.filter((z) => zones.includes(z.id) && !z.soldOut).map((z) => z.id)
            }
        })
    })
})

/* ---------------- computed ---------------- */
const region = computed(() => REGIONS.find((r) => r.id === regionId.value))
const vpc = computed(() => VPCS.find((v) => v.id === draft.vpcId))
const cpPlan = computed(() => CP_PLANS.find((p) => p.id === draft.cp.plan))

const nameOk = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(draft.name))
const nameMessage = computed(() => {
    if (draft.name && !nameOk.value) {
        return 'Lowercase letters, digits and dashes; starts with a letter, ends with a letter or digit. 3–40 characters.'
    }
    return 'Lowercase letters, digits and dashes. 3–40 characters.'
})
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
const subnetMessage = computed(() => {
    if (masterDist.value === 'custom') {
        return `Single AZ deployment — select one subnet in ${REGION.zones.find((z) => z.id === masterHostAz.value)?.name}. Subnets in other AZs are locked.`
    }
    return 'Pick one subnet per availability zone you want worker nodes in.'
})
const subnetError = computed(() => {
    if (masterDist.value === 'custom' && vpc.value && !singleAzSubnets.value.length) {
        return `No subnet in ${REGION.zones.find((z) => z.id === masterHostAz.value)?.name} for this VPC — choose a different AZ or VPC.`
    }
    if (masterDist.value === 'automatic' && vpc.value && missingAzSubnets.value.length) {
        return `Multi AZ requires a subnet in every availability zone — missing: ${missingAzSubnets.value.map((z) => REGION.zones.find((zz) => zz.id === z)?.name).join(', ')}.`
    }
    return ''
})

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
    if (!p.labels.every((l) => {
        const [k, v] = l.split('=')
        return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v) && k.length <= 63 && v.length <= 63
    })) return false
    if (!p.taints.every((t) => K8S_KEY.test(t.key) && (t.value === '' || K8S_VAL.test(t.value)))) return false
    return true
}
const poolStates = computed(() => draft.pools.map((p, i) => poolOk(p, i, draft.pools)))
const poolsOk = computed(() => poolStates.value.every(Boolean))

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

/* ---- CIDR input: four editable octets + prefix select /16…/28.
   Validation follows the real VPC-create zod (vpc-mfe CreateVpc + utils):
   private range, prefix bounds, then network address (host bits zero) ---- */
const CIDR_PREFIXES = Array.from({ length: 13 }, (_, i) => String(16 + i))
function cidrError(r, maxPrefix) {
    const octets = [r.o1, r.o2, r.o3, r.o4].map(Number)
    if ([r.o1, r.o2, r.o3, r.o4].some((o) => o === '') || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return 'The IP address is not valid.'
    const isPrivate = (octets[0] === 10) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168)
    if (!isPrivate) return 'The CIDR block must be in a private IP range (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16).'
    if (!(+r.prefix >= 16 && +r.prefix <= maxPrefix)) return `CIDR block size must be between /16 and /${maxPrefix}.`
    const ipInt = octets.reduce((acc, o, i) => acc + (o << (24 - 8 * i)), 0)
    const mask = ~(2 ** (32 - +r.prefix) - 1) >>> 0
    if ((ipInt & mask) !== ipInt) return 'CIDR must use the network address for its prefix (host bits must be zero).'
    return ''
}
const podCidrError = computed(() => cidrError(draft.podCidrs[0], 28))
const svcCidrError = computed(() => cidrError(draft.svcCidrs[0], 20))
const cidrsOk = computed(() => cidrError(draft.podCidrs[0], 28) === '' && cidrError(draft.svcCidrs[0], 20) === '')
function sanitizeOctet(v) {
    return String(v).replace(/[^\d]/g, '').slice(0, 3)
}
const cidrStr = (r) => `${r.o1}.${r.o2}.${r.o3}.${r.o4}/${r.prefix}`
const cidrCapacity = (r) => Math.pow(2, 32 - +r.prefix).toLocaleString('en-US')

/* ---- CIDR overlap checks: pod / service vs each other and the VPC ----
   (selected subnets sit inside the VPC range, so the VPC check covers them) */
function parseCidr(str) {
    const [ip, p] = str.split('/')
    const parts = ip.split('.')
    if (parts.length !== 4 || parts.some((x) => x === '')) return null
    const [a, b, c, d] = parts.map(Number)
    if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
    if (!(+p >= 16 && +p <= 32)) return null
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
        out.push({ net: 'pod', text: `The pod CIDR overlaps the service CIDR (${cidrStr(draft.svcCidrs[0])}). Choose a different range for one of them.` })
        out.push({ net: 'svc', text: `The service CIDR overlaps the pod CIDR (${cidrStr(draft.podCidrs[0])}). Choose a different range for one of them.` })
    }
    const vpcLabel = `the VPC CIDR of ${v.name} (${v.cidr})`
    if (rangesOverlap(pod, vpcR)) out.push({ net: 'pod', text: `The pod CIDR overlaps ${vpcLabel}. Choose a different range.` })
    if (rangesOverlap(svc, vpcR)) out.push({ net: 'svc', text: `The service CIDR overlaps ${vpcLabel}. Choose a different range.` })
    return out
})
const podConflicts = computed(() => cidrConflicts.value.filter((c) => c.net === 'pod'))
const svcConflicts = computed(() => cidrConflicts.value.filter((c) => c.net === 'svc'))
const canCreate = computed(() => nameOk.value && subnetOk.value && cidrsOk.value && masterAzsOk.value && poolsOk.value && !cidrConflicts.value.length)

/* ---------------- interactions ---------------- */
function selectType(p) {
    draft.cp.plan = p.id
}
function selectRegion(r) {
    if (r.enabled) regionId.value = r.id
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

/* labels */
const labelInput = ref('')
const labelError = ref('')
function addLabel(e) {
    /* read the DOM value at Enter time: the ref can lag behind while an IME
       composition is still open (Persian keyboards, mobile keyboards) */
    const raw = e && e.target ? e.target.value : labelInput.value
    const v = raw.trim().toLowerCase().replace(/\s+/g, '-')
    labelError.value = ''
    if (!v) {
        /* nothing typed */
    } else if (draft.labels.includes(v)) {
        labelError.value = 'This label is already added.'
    } else if (draft.labels.length >= 10) {
        labelError.value = 'You can add up to 10 labels.'
    } else {
        draft.labels.push(v)
    }
    labelInput.value = ''
    if (e && e.target) e.target.value = ''
}
/* ignore the Enter that commits an IME composition, so the text stays in
   the box and the next Enter adds the label */
function onLabelKeydown(e) {
    if (e.key !== 'Enter') return
    if (e.isComposing || e.keyCode === 229) return
    e.preventDefault()
    addLabel(e)
}
function removeLabel(l) {
    draft.labels = draft.labels.filter((x) => x !== l)
}

const zoneName = (id) => REGION.zones.find((z) => z.id === id)?.name || id

/* subnet table columns (ArTable) */
const SUBNET_COLUMNS = [
    { label: '', name: 'check' },
    { label: 'Name', name: 'name' },
    { label: 'IPv4 CIDR', name: 'cidr' },
    { label: 'AZ', name: 'zone' },
    { label: 'Status', name: 'status' },
]

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
                <router-link
                    to="/clusters"
                    class="ar-btn ghost icon"
                    aria-label="Back"
                    style="text-decoration: none"
                >
                    <ArIcon
                        name="chevron-left"
                        size="sm"
                    />
                </router-link>
                <h1 class="text-title-2 m-0">Create Kubernetes Cluster</h1>
                <ArLinkButton
                    :to="{ path: '/clusters/create', query: { flow: 'stepper' } }"
                    class="flow-link"
                    append-icon="chevron-right"
                >
                    Try the two-step flow
                </ArLinkButton>
            </div>
        </div>

        <div class="wizard-grid">
            <div class="wizard-main create-sections">
                <!-- ================= REGION ================= -->
                <ArSection
                    title="Region"
                    description="Select the region where you want to create Kubernetes cluster."
                >
                    <div class="region-grid">
                        <ArCard
                            v-for="r in REGIONS"
                            :key="r.id"
                            :model-value="regionId"
                            :value="r.id"
                            :disabled="!r.enabled"
                            class="region-card"
                            :class="{ selected: regionId === r.id, disabled: !r.enabled }"
                            @update:model-value="selectRegion(r)"
                        >
                            <span class="radio" />
                            <div class="r-body">
                                <div class="r-name">
                                    <span
                                        class="flag"
                                        :class="r.flag"
                                    />
                                    <span class="r-title">{{ r.name }}</span>
                                    <ArBadge
                                        v-if="r.badge"
                                        variant="primary"
                                        size="sm"
                                        pill
                                        :text="r.badge"
                                    />
                                </div>
                                <div class="r-zones">
                                    <span
                                        v-for="z in r.zones"
                                        :key="z"
                                        class="r-zone"
                                    >{{ z }}</span>
                                </div>
                            </div>
                        </ArCard>
                    </div>

                    <ArAlert
                        type="info"
                        class="margin-top-4"
                        description="Currently, only Iran Central is available for Kubernetes clusters."
                    />
                </ArSection>

                <!-- ================= CLUSTER TYPE (+ version) ================= -->
                <ArSection
                    title="Cluster Type"
                    description="Choose cluster type based on your requirement."
                >
                    <div
                        class="ar-field-label-like flex align-items-center"
                        style="margin-bottom: var(--space-3)"
                    >
                        <span class="text-body-2-strong">Cluster Size</span>
                        <ArIcon
                            name="info"
                            size="sm"
                            v-tippy="{ ...TIPPY_TOP, content: SPEC_TIPS.size }"
                            class="info-icon"
                        />
                    </div>
                    <div class="type-rows">
                        <ArCard
                            v-for="p in CP_PLANS"
                            :key="p.id"
                            :model-value="draft.cp.plan"
                            :value="p.id"
                            class="type-row"
                            :class="{ selected: draft.cp.plan === p.id }"
                            @update:model-value="selectType(p)"
                        >
                            <span class="radio" />
                            <div class="t-name text-body-1-strong">{{ p.name }}</div>
                            <div class="t-spec">
                                <span class="ts-k text-caption-1">
                                    Replica
                                    <ArIcon
                                        name="info"
                                        size="xs"
                                        v-tippy="{ ...TIPPY_TOP, content: SPEC_TIPS.replica }"
                                        class="info-icon"
                                    />
                                </span>
                                <span class="ts-v text-body-2-strong">{{ p.replicas }}</span>
                            </div>
                            <div class="t-spec">
                                <span class="ts-k text-caption-1">
                                    Max Nodes
                                    <ArIcon
                                        name="info"
                                        size="xs"
                                        v-tippy="{ ...TIPPY_TOP, content: SPEC_TIPS.maxNodes }"
                                        class="info-icon"
                                    />
                                </span>
                                <span class="ts-v text-body-2-strong">{{ p.maxNodes }}</span>
                            </div>
                            <div class="t-spec">
                                <span class="ts-k text-caption-1">
                                    Max etcd Size
                                    <ArIcon
                                        name="info"
                                        size="xs"
                                        v-tippy="{ ...TIPPY_TOP, content: SPEC_TIPS.etcd }"
                                        class="info-icon"
                                    />
                                </span>
                                <span class="ts-v text-body-2-strong">{{ p.etcdSize }}</span>
                            </div>
                            <div class="t-spec t-price">
                                <span class="ts-k text-caption-1">Price</span>
                                <span class="ts-v text-body-2-strong">{{ fmtIRR(p.pricePerDay * 30) }} IRR/Month</span>
                            </div>
                        </ArCard>
                    </div>

                    <!-- Control plane distribution -->
                    <div class="flex flex-column gap-2 margin-top-6">
                        <div class="flex align-items-center">
                            <span class="text-body-2-strong">Control Plane Distribution</span>
                            <ArIcon
                                name="info"
                                size="sm"
                                v-tippy="{ ...TIPPY_TOP, content: SPEC_TIPS.dist }"
                                class="info-icon"
                            />
                        </div>
                        <ArRadioGroup
                            v-model="masterDist"
                            inline
                        >
                            <ArRadio
                                value="automatic"
                                label="Multi AZ"
                            />
                            <ArRadio
                                value="custom"
                                label="Single AZ"
                            />
                        </ArRadioGroup>
                        <template v-if="masterDist === 'custom'">
                            <div class="flex align-items-center gap-4 flex-wrap">
                                <span class="text-body-2 muted">Select AZ</span>
                                <ArRadioGroup
                                    v-model="masterHostAz"
                                    inline
                                >
                                    <ArRadio
                                        v-for="z in REGION.zones"
                                        :key="z.id"
                                        :value="z.id"
                                        :label="z.name"
                                    />
                                </ArRadioGroup>
                            </div>
                        </template>
                    </div>

                    <div class="flex flex-column gap-2 margin-top-6" style="max-width: 520px">
                        <ArField
                            label="Kubernetes Version"
                            required
                            message="We generally recommend the latest version unless your team has a specific need."
                            icon="info"
                        >
                            <ArSelect
                                v-model="draft.version"
                                :options="VERSIONS.map((v) => ({ value: v.id, label: `${v.patch} (end of cycle: ${v.endOfCycle})` }))"
                                aria-label="Kubernetes Version"
                            />
                        </ArField>
                    </div>
                </ArSection>

                <!-- ================= NETWORK ================= -->
                <ArSection
                    title="Network"
                    description="Set up the network for your cluster."
                >
                    <!-- Cluster Network -->
                    <div class="net-block">
                        <div class="flex align-items-center net-title">
                            <span class="text-body-1">Cluster Network</span>
                            <ArIcon
                                name="info"
                                size="sm"
                                v-tippy="{ ...TIPPY_TOP, content: NETWORK_TIPS.cluster }"
                                class="info-icon"
                            />
                        </div>
                        <div class="flex flex-column gap-4">
                            <ArField label="VPC" required>
                                <ArSelect
                                    v-model="draft.vpcId"
                                    :options="[{ value: '', label: 'Select a VPC…' }, ...VPCS.map((v) => ({ value: v.id, label: `${v.name} (${v.cidr})` }))]"
                                    aria-label="VPC"
                                    @update:model-value="draft.subnetIds = []"
                                />
                            </ArField>

                            <ArField
                                label="Subnet"
                                required
                                :message="subnetError || subnetMessage"
                                :error="Boolean(subnetError)"
                                :icon="subnetError ? 'warning' : 'info'"
                            >
                                <ArTable
                                    :columns="SUBNET_COLUMNS"
                                    :items="vpc?.subnets || []"
                                >
                                    <template #row="sn">
                                        <ArTableRow
                                            :key="sn.id"
                                            class="subnet-row"
                                            :class="{
                                                selected: draft.subnetIds.includes(sn.id),
                                                'row-locked': subnetLocked(sn),
                                            }"
                                            @click="!subnetLocked(sn) && toggleSubnet(sn.id)"
                                        >
                                            <ArTableCell @click.stop>
                                                <ArRadioDot
                                                    v-if="masterDist === 'custom'"
                                                    :model-value="draft.subnetIds.includes(sn.id)"
                                                    :disabled="subnetLocked(sn)"
                                                    @update:model-value="toggleSubnet(sn.id)"
                                                />
                                                <ArCheckbox
                                                    v-else
                                                    :model-value="draft.subnetIds.includes(sn.id)"
                                                    @update:model-value="toggleSubnet(sn.id)"
                                                />
                                            </ArTableCell>
                                            <ArTableCell>
                                                <a
                                                    href="#"
                                                    class="text-body-2-strong"
                                                    @click.prevent.stop
                                                >{{ sn.name }}</a>
                                            </ArTableCell>
                                            <ArTableCell class="mono">
                                                {{ sn.cidr }}
                                            </ArTableCell>
                                            <ArTableCell>{{ REGION.zones.find((z) => z.id === sn.zone)?.name }}</ArTableCell>
                                            <ArTableCell>
                                                <ArBadge
                                                    variant="success"
                                                    pill
                                                    text="Available"
                                                />
                                            </ArTableCell>
                                        </ArTableRow>
                                    </template>
                                    <template #noContent>
                                        <span class="text-body-2 muted">Select a VPC to list its subnets.</span>
                                    </template>
                                </ArTable>
                            </ArField>
                        </div>
                    </div>

                    <!-- Pod Subnet -->
                    <div class="net-block">
                        <div class="flex align-items-center net-title">
                            <span class="text-body-1">Pod Subnet</span>
                            <ArIcon
                                name="info"
                                size="sm"
                                v-tippy="{ ...TIPPY_TOP, content: NETWORK_TIPS.pod }"
                                class="info-icon"
                            />
                        </div>
                        <div class="flex flex-column gap-2">
                            <ArField
                                :message="podCidrError"
                                :error="Boolean(podCidrError)"
                            >
                                <div class="cidr-octets">
                                    <ArInput
                                        class="cidr-octet"
                                        :model-value="draft.podCidrs[0].o1"
                                        inputmode="numeric"
                                        ltr
                                        autocomplete="off"
                                        aria-label="First octet"
                                        @update:model-value="draft.podCidrs[0].o1 = sanitizeOctet($event)"
                                    />
                                    <span class="dot-sep">.</span>
                                    <ArInput
                                        class="cidr-octet"
                                        :model-value="draft.podCidrs[0].o2"
                                        inputmode="numeric"
                                        ltr
                                        autocomplete="off"
                                        aria-label="Second octet"
                                        @update:model-value="draft.podCidrs[0].o2 = sanitizeOctet($event)"
                                    />
                                    <span class="dot-sep">.</span>
                                    <ArInput
                                        class="cidr-octet"
                                        :model-value="draft.podCidrs[0].o3"
                                        inputmode="numeric"
                                        ltr
                                        autocomplete="off"
                                        aria-label="Third octet"
                                        @update:model-value="draft.podCidrs[0].o3 = sanitizeOctet($event)"
                                    />
                                    <span class="dot-sep">.</span>
                                    <ArInput
                                        class="cidr-octet"
                                        :model-value="draft.podCidrs[0].o4"
                                        inputmode="numeric"
                                        ltr
                                        autocomplete="off"
                                        aria-label="Fourth octet"
                                        @update:model-value="draft.podCidrs[0].o4 = sanitizeOctet($event)"
                                    />
                                    <span class="slash">/</span>
                                    <ArSelect
                                        class="cidr-prefix"
                                        v-model="draft.podCidrs[0].prefix"
                                        :options="CIDR_PREFIXES"
                                        aria-label="Prefix"
                                    />
                                </div>
                            </ArField>
                            <p class="text-caption-1 muted m-0">
                                The pod CIDR block is the IP address range for Kubernetes Pods. The current CIDR block supports a maximum of
                                <strong class="cidr-cap">{{ cidrCapacity(draft.podCidrs[0]) }}</strong> Pods.
                            </p>
                            <ArAlert
                                type="warning"
                                description="CIDR block cannot be modified after the cluster is created. Ensure it does not overlap with the VPC and subnet CIDR blocks to prevent communication issues."
                            />
                            <ArAlert
                                v-for="(c, i) in podConflicts"
                                :key="i"
                                type="danger"
                                :description="c.text"
                            />
                        </div>
                    </div>

                    <!-- Service Subnet -->
                    <div class="net-block">
                        <div class="flex align-items-center net-title">
                            <span class="text-body-1">Service Subnet</span>
                            <ArIcon
                                name="info"
                                size="sm"
                                v-tippy="{ ...TIPPY_TOP, content: NETWORK_TIPS.service }"
                                class="info-icon"
                            />
                        </div>
                        <div class="flex flex-column gap-2">
                            <ArField
                                :message="svcCidrError"
                                :error="Boolean(svcCidrError)"
                            >
                                <div class="cidr-octets">
                                    <ArInput
                                        class="cidr-octet"
                                        :model-value="draft.svcCidrs[0].o1"
                                        inputmode="numeric"
                                        ltr
                                        autocomplete="off"
                                        aria-label="First octet"
                                        @update:model-value="draft.svcCidrs[0].o1 = sanitizeOctet($event)"
                                    />
                                    <span class="dot-sep">.</span>
                                    <ArInput
                                        class="cidr-octet"
                                        :model-value="draft.svcCidrs[0].o2"
                                        inputmode="numeric"
                                        ltr
                                        autocomplete="off"
                                        aria-label="Second octet"
                                        @update:model-value="draft.svcCidrs[0].o2 = sanitizeOctet($event)"
                                    />
                                    <span class="dot-sep">.</span>
                                    <ArInput
                                        class="cidr-octet"
                                        :model-value="draft.svcCidrs[0].o3"
                                        inputmode="numeric"
                                        ltr
                                        autocomplete="off"
                                        aria-label="Third octet"
                                        @update:model-value="draft.svcCidrs[0].o3 = sanitizeOctet($event)"
                                    />
                                    <span class="dot-sep">.</span>
                                    <ArInput
                                        class="cidr-octet"
                                        :model-value="draft.svcCidrs[0].o4"
                                        inputmode="numeric"
                                        ltr
                                        autocomplete="off"
                                        aria-label="Fourth octet"
                                        @update:model-value="draft.svcCidrs[0].o4 = sanitizeOctet($event)"
                                    />
                                    <span class="slash">/</span>
                                    <ArSelect
                                        class="cidr-prefix"
                                        v-model="draft.svcCidrs[0].prefix"
                                        :options="CIDR_PREFIXES"
                                        aria-label="Prefix"
                                    />
                                </div>
                            </ArField>
                            <p class="text-caption-1 muted m-0">
                                The service CIDR block is the IP address range for Kubernetes ClusterIP Services. The current CIDR block supports a maximum of
                                <strong class="cidr-cap">{{ cidrCapacity(draft.svcCidrs[0]) }}</strong> Services.
                            </p>
                            <ArAlert
                                type="warning"
                                description="CIDR block cannot be modified after the cluster is created. Ensure it does not overlap with the subnet CIDR blocks of dependent middleware (such as RDS and Redis) to prevent communication issues."
                            />
                            <ArAlert
                                v-for="(c, i) in svcConflicts"
                                :key="i"
                                type="danger"
                                :description="c.text"
                            />
                        </div>
                    </div>
                </ArSection>

                <!-- ================= NODE POOLS ================= -->
                <ArSection
                    title="Node Pools"
                    description="Configure up to 3 groups of nodes. Pools are optional — you can also add them after creation."
                >
                    <div class="pool-list">
                        <PoolCard
                            v-for="(p, i) in draft.pools"
                            :key="p.id"
                            :pool="p"
                            :index="i"
                            :open="openId === p.id"
                            :ok="poolStates[i]"
                            :allowed-zones="poolAllowedZones"
                            @toggle="togglePool(p.id)"
                            @remove="removePool(p.id)"
                        />

                        <ArAlert
                            v-if="!draft.pools.length"
                            type="info"
                            description="No node pools — the cluster will be created without worker nodes. You can add pools after creation from the cluster page."
                        />

                        <div class="flex align-items-center gap-4">
                            <ArButton
                                variant="secondary"
                                :disabled="draft.pools.length >= 3"
                                @click="addPool"
                            >
                                <ArIcon
                                    name="plus"
                                    size="xs"
                                    class="margin-end-2"
                                />
                                Add node pool
                            </ArButton>
                            <span
                                v-if="draft.pools.length >= 3"
                                class="text-caption-1 muted"
                            >Maximum of 3 node pools per cluster.</span>
                            <span
                                v-else-if="draft.pools.length > 1"
                                class="text-caption-1 muted"
                            >New pools start with the same credentials as node-pool-1.</span>
                        </div>
                    </div>
                </ArSection>

                <!-- ================= BASIC INFO ================= -->
                <ArSection title="Basic Info">
                    <div class="flex flex-column gap-4" style="max-width: 520px">
                        <ArField
                            label="Name"
                            required
                            :message="nameMessage"
                            :error="Boolean(draft.name) && !nameOk"
                        >
                            <ArInput
                                v-model="draft.name"
                                placeholder="Enter a name"
                                spellcheck="false"
                                autocomplete="off"
                                ltr
                                style="text-transform: lowercase"
                            />
                        </ArField>

                        <ArField
                            label="Labels"
                            :message="labelError"
                            :error="Boolean(labelError)"
                        >
                            <!-- panel's tag input pattern: input with a separate
                                 "+" button, hint below, then the added tags -->
                            <div class="label-input-row">
                                <ArInput
                                    v-model="labelInput"
                                    placeholder="Confirm labels with enter"
                                    spellcheck="false"
                                    @input="labelError = ''"
                                    @keydown="onLabelKeydown"
                                />
                                <ArButton variant="secondary" icon="plus" aria-label="Add label" @click="addLabel()" />
                            </div>
                            <span class="field-hint text-caption-1 muted">After typing each label, press the Enter key.</span>
                            <div v-if="draft.labels.length" class="label-tags">
                                <ArTag
                                    v-for="l in draft.labels"
                                    :key="l"
                                    class="mono"
                                    @click="removeLabel(l)"
                                >
                                    {{ l }}
                                </ArTag>
                            </div>
                        </ArField>
                    </div>
                </ArSection>

                <!-- included components note -->
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
                            <p>Control Plane Distribution: {{ masterDist === 'automatic' ? 'Multi AZ' : `Single AZ · ${REGION.zones.find((z) => z.id === masterHostAz)?.name}` }}</p>
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
                                <p
                                    v-for="(p, i) in draft.pools"
                                    :key="p.id"
                                >
                                    {{ poolNameOf(p, i) }} · {{ p.specs[0]?.flavorId || 'no flavor' }} × {{ p.count || '—' }}
                                    <span
                                        v-if="!poolStates[i]"
                                        class="rail-err"
                                    >· incomplete</span>
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
                    <ArButton
                        variant="primary"
                        class="block margin-top-3"
                        :loading="creating"
                        :disabled="!canCreate"
                        @click="create"
                    >
                        Create Kubernetes Cluster
                    </ArButton>
                    <p
                        v-if="!canCreate"
                        class="text-caption-1 muted margin-top-2 text-center"
                    >
                        Complete the cluster settings and every node pool card to enable creation.
                    </p>
                </div>
            </aside>
        </div>
    </main>
</template>

<style scoped>
.page-wide { max-width: 1280px; }
.create-sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}
.m-0 { margin: 0; }
.margin-top-2 { margin-top: var(--space-2); }
.margin-top-3 { margin-top: var(--space-3); }
.margin-top-4 { margin-top: var(--space-4); }
.margin-top-6 { margin-top: var(--space-6); }
.margin-end-2 { margin-inline-end: var(--space-2); }
.text-center { text-align: center; }
.block { width: 100%; }
.flex { display: flex; }
.flex-column { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.align-items-center { align-items: center; }
.gap-2 { gap: var(--space-2); }
.gap-4 { gap: var(--space-4); }
.gap-5 { gap: var(--space-5); }

.flow-link {
    margin-left: auto;
}
.info-icon {
    color: var(--fg-neutral-t1-3-default);
    cursor: help;
    margin-inline-start: 4px;
}
.info-icon:hover { color: var(--fg-neutral-t1-2-default); }

/* ArCard renders display:block — re-assert the card layouts from components.css
   (region-card / type-row expect flex, with the radio as a flex child) */
.region-card.ArCard {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
}
.type-row.ArCard {
    display: flex;
    align-items: center;
    padding: var(--space-4) var(--space-5);
}

/* Cluster Size label row (label + tooltip; the plan cards act as the input) */
.ar-field-label-like { gap: 4px; color: var(--fg-neutral-t1-1-default); }

.net-block {
    padding-top: var(--space-2);
    padding-bottom: var(--space-5);
}
.net-block + .net-block {
    border-top: 1px solid var(--st-neutral-t1-5-default);
}
.net-title { gap: 4px; margin-bottom: var(--space-4); }
.cidr-cap { color: var(--fg-error-t1-1-default); font-weight: 450; }

/* subnet table rows (ArTable) */
.subnet-row { cursor: pointer; }
.subnet-row:hover { background: var(--bg-neutral-t1-4-default); }
.subnet-row.selected { background: var(--bg-primary-t2-1-default); }
.subnet-row.row-locked,
.subnet-row.row-locked:hover { opacity: 0.45; cursor: not-allowed; background: transparent; }

/* pool accordion list — same as the stepper flow */
.pool-list { display: flex; flex-direction: column; gap: var(--space-4); }
.rail-err { color: var(--fg-error-t1-1-default); }
</style>
