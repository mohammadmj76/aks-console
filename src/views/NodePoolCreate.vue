<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store } from '../store'
import { REGION, VPCS, FLAVOR_CATALOG, VOLUME_PRICE_PER_GB, fmtIRR } from '../data'
import {
  ArAlert, ArBadge, ArButton, ArCheckbox, ArContainer, ArField, ArInput, ArLinkButton,
  ArRadio, ArSection, ArSubHeader, ArTable, ArTableCell, ArTableRow, ArTag,
} from '../uikit'
import PoolCard from '../components/create/PoolCard.vue'

const route = useRoute()
const router = useRouter()
const cluster = computed(() => store.getCluster(route.params.id))
const vpc = computed(() => VPCS.find(v => v.id === cluster.value?.vpcId))
const returnRoute = computed(() => ({
  name: route.query.view === 'v2' ? 'cluster-details-v2' : 'cluster-details-v3',
  params: { id: route.params.id },
  query: { tab: route.query.view === 'v3' ? 'overview' : 'pools' },
}))
const pool = reactive({ name: '', count: 1, specs: [], rootDisk: 25, labels: [], taints: [], image: 'ubuntu-22.04' })
const subnetIds = ref([])
const singleAz = computed(() => cluster.value?.cp.distribution === 'single-az')
const allowedZones = computed(() => singleAz.value ? [cluster.value.cp.zone].filter(Boolean) : [])
const visibleSubnets = computed(() => (vpc.value?.subnets || []).filter(s => !singleAz.value || allowedZones.value.includes(s.zone)))
const selectedFlavor = computed(() => FLAVOR_CATALOG.find(f => f.id === pool.specs[0]?.flavorId))
const nodeZones = computed(() => pool.specs[0]?.zones || [])
const zoneName = id => REGION.zones.find(z => z.id === id)?.name || id
const selectedSubnets = computed(() => visibleSubnets.value.filter(s => subnetIds.value.includes(s.id)))
const missingZones = computed(() => nodeZones.value.filter(z => !selectedSubnets.value.some(s => s.zone === z)))
const subnetMessage = computed(() => {
  if (!nodeZones.value.length) return 'Select a flavor and its node creation AZs first.'
  if (missingZones.value.length) return `${singleAz.value ? 'Single AZ' : 'Multi AZ'} requires a subnet in every node creation availability zone. Missing: ${missingZones.value.map(zoneName).join(', ')}.`
  return ''
})
watch(() => route.params.id, () => {
  pool.name = ''
  pool.specs = []
  pool.labels = []
  pool.count = 1
  pool.rootDisk = 25
  subnetIds.value = []
})
function toggleSubnet(s) {
  if (singleAz.value) subnetIds.value = [s.id]
  else subnetIds.value = subnetIds.value.includes(s.id) ? subnetIds.value.filter(id => id !== s.id) : [...subnetIds.value, s.id]
}
const nameValid = computed(() => /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(pool.name))
const duplicateName = computed(() => cluster.value?.pools.some(p => p.name === pool.name))
const nameMessage = computed(() => duplicateName.value ? 'A node pool with this name already exists in this cluster.' : 'Lowercase letters, digits and dashes. 3–40 characters.')
const labelInput = ref('')
const labelError = ref('')
function addLabel(e) {
  if (e?.isComposing || e?.keyCode === 229) return
  const label = (e?.target?.value ?? labelInput.value).trim()
  labelError.value = ''
  if (!label) return
  if (pool.labels.includes(label)) labelError.value = 'This label is already added.'
  else if (pool.labels.length >= 20) labelError.value = 'You can add up to 20 labels.'
  else pool.labels.push(label)
  labelInput.value = ''
}
const validFlavor = computed(() => pool.specs.length === 1 && nodeZones.value.length > 0 && nodeZones.value.every(z =>
  selectedFlavor.value?.azs.some(a => a.id === z && !a.soldOut) && (!singleAz.value || allowedZones.value.includes(z))
))
const canCreate = computed(() => Boolean(cluster.value && vpc.value && nameValid.value && !duplicateName.value && validFlavor.value &&
  Number.isInteger(pool.count) && pool.count >= 1 && pool.count <= 20 &&
  Number.isInteger(pool.rootDisk) && pool.rootDisk >= 25 && pool.rootDisk <= 1000 &&
  !missingZones.value.length && selectedSubnets.value.length))
const hourlyPrice = computed(() => selectedFlavor.value ?
  (selectedFlavor.value.pricePerHour + pool.rootDisk * VOLUME_PRICE_PER_GB / 730) * pool.count : 0)
const SUBNET_COLUMNS = [
  { name: 'check', label: '' }, { name: 'name', label: 'Name' },
  { name: 'cidr', label: 'IPv4 CIDR' }, { name: 'zone', label: 'AZ' },
  { name: 'gateway', label: 'Network Gateway' }, { name: 'status', label: 'Status' },
]
const submitting = ref(false)
function create() {
  if (!canCreate.value || submitting.value) return
  submitting.value = true
  const spec = pool.specs[0]
  store.addPool(cluster.value, {
    name: pool.name,
    count: pool.count,
    specs: [{
      flavorId: selectedFlavor.value.id,
      zones: [...nodeZones.value],
      /* per-AZ node counts chosen in the Multi AZ table (undefined in Single AZ) */
      ...(spec.zoneCounts ? { zoneCounts: { ...spec.zoneCounts } } : {}),
    }],
    zones: [...nodeZones.value],
    subnets: selectedSubnets.value.filter(s => nodeZones.value.includes(s.zone)).map(s => s.id),
    volumeGb: pool.rootDisk,
    labels: [...pool.labels],
    taints: [],
    image: pool.image,
  })
  router.push(returnRoute.value)
}
function refreshSubnets() {
  store.toast('info', 'Subnets refreshed', 'Showing the current prototype network catalog.')
}
function createSubnet() {
  store.toast('info', 'Create Subnet', 'Subnet creation is not connected in this prototype.')
}
</script>

<template>
  <main class="node-pool-create">
    <ArSubHeader class="node-pool-create__header" title="Create Node Pool" :tabs-props="{ items: [] }" :back="returnRoute" />
    <ArContainer class="node-pool-create__container">
    <div v-if="cluster" class="node-pool-create__layout">
      <div class="node-pool-create__form">
        <ArSection title="Basic Info">
          <div class="node-pool-create__fields">
            <ArField label="Node Pool Name" required :error="Boolean(pool.name) && (!nameValid || duplicateName)" :message="pool.name ? nameMessage : ''">
              <ArInput v-model="pool.name" placeholder="Enter a name" aria-label="Node Pool Name" autocomplete="off" spellcheck="false" ltr />
            </ArField>
            <ArField label="Labels" :error="Boolean(labelError)" :message="labelError || 'After typing each label, press the Enter key.'">
              <div class="node-pool-create__label-input">
                <ArInput v-model="labelInput" aria-label="Pool label" spellcheck="false" @keydown.enter.prevent="addLabel" @input="labelError = ''" />
                <ArButton variant="secondary" icon="plus" aria-label="Add pool label" @click="addLabel()" />
              </div>
              <div v-if="pool.labels.length" class="node-pool-create__tags">
                <ArTag v-for="label in pool.labels" :key="label" :aria-label="`Remove label ${label}`" @click="pool.labels = pool.labels.filter(l => l !== label)">{{ label }}</ArTag>
              </div>
            </ArField>
          </div>
        </ArSection>
        <ArSection title="Node Pool Configuration">
          <PoolCard :pool="pool" :index="0" :open="true" :allowed-zones="allowedZones" design-refresh configuration-only />
        </ArSection>
        <ArSection title="Network">
          <div class="node-pool-create__fields">
            <ArField label="VPC">
              <ArInput :model-value="vpc ? `${vpc.name} (${vpc.cidr})` : 'VPC unavailable'" disabled aria-label="Cluster VPC" />
            </ArField>
            <ArField label="Subnet" required>
              <div class="node-pool-create__subnets">
                <div class="node-pool-create__subnet-actions">
                  <ArButton variant="tertiary" icon="refresh" aria-label="Refresh subnets" @click="refreshSubnets" />
                  <ArButton variant="secondary" prepend-icon="plus" @click="createSubnet">Create Subnet</ArButton>
                </div>
                <ArTable :columns="SUBNET_COLUMNS" :items="visibleSubnets">
                  <template #row="s">
                    <ArTableRow class="node-pool-create__subnet-row" @click="toggleSubnet(s)">
                      <ArTableCell @click.stop>
                        <ArRadio v-if="singleAz" :model-value="subnetIds[0] || ''" :value="s.id" @update:model-value="toggleSubnet(s)" />
                        <ArCheckbox v-else :model-value="subnetIds.includes(s.id)" :aria-label="`Select ${s.name}`" @update:model-value="toggleSubnet(s)" />
                      </ArTableCell>
                      <ArTableCell><ArLinkButton @click.stop="toggleSubnet(s)">{{ s.name }}</ArLinkButton></ArTableCell>
                      <ArTableCell>{{ s.cidr }}</ArTableCell>
                      <ArTableCell>{{ zoneName(s.zone) }}</ArTableCell>
                      <ArTableCell>
                        <ArBadge v-if="s.zone !== 'simin'" variant="success" text="Attached" />
                        <ArLinkButton v-else @click.stop="store.toast('info', 'Network Gateway', 'Gateway configuration is not connected in this prototype.')">Enable</ArLinkButton>
                      </ArTableCell>
                      <ArTableCell><ArBadge variant="success" text="Available" /></ArTableCell>
                    </ArTableRow>
                  </template>
                  <template #noContent>No subnets are available in the cluster VPC for this availability zone.</template>
                </ArTable>
                <p v-if="subnetMessage" class="node-pool-create__subnet-message" role="status">{{ subnetMessage }}</p>
              </div>
            </ArField>
          </div>
        </ArSection>
      </div>
      <aside class="node-pool-create__summary" aria-label="Node pool summary">
        <ArSection content-class="node-pool-create__summary-content">
          <div class="node-pool-create__summary-details">
          <section class="node-pool-create__summary-group">
            <h2>Basic Info</h2>
            <p>Node Pool Name: <span>{{ pool.name || '—' }}</span></p>
            <p>Labels: <span>{{ pool.labels.join(', ') || '—' }}</span></p>
          </section>
          <section class="node-pool-create__summary-group">
            <h2>Node Pool Configuration</h2>
            <p>Flavor: <span>{{ selectedFlavor ? `${selectedFlavor.id} | ${selectedFlavor.vcpu} vCPU | ${selectedFlavor.ram} GB RAM` : '—' }}</span></p>
            <p>Node Creation AZs: <span>{{ nodeZones.map(zoneName).join(', ') || '—' }}</span></p>
            <p>Node Count: <span>{{ pool.count || '—' }}</span></p>
            <p>Root Volume: <span>{{ pool.rootDisk || '—' }} GB</span></p>
          </section>
          <section class="node-pool-create__summary-group">
            <h2>Network</h2>
            <p>VPC: <span>{{ vpc?.name || '—' }}</span></p>
            <p>Subnet: <span>{{ selectedSubnets.filter(s => nodeZones.includes(s.zone)).map(s => s.name).join(', ') || '—' }}</span></p>
            <p>Pod Subnet: <span>{{ cluster.podCidr }}</span></p>
            <p>Service Subnet: <span>{{ cluster.svcCidr }}</span></p>
          </section>
          </div>
          <footer class="node-pool-create__checkout">
            <div class="node-pool-create__price">
              <span>{{ fmtIRR(Math.round(hourlyPrice)) }} IRR/hour</span>
              <strong>{{ fmtIRR(Math.round(hourlyPrice * 24)) }} IRR/Day</strong>
            </div>
            <ArButton variant="primary" :disabled="!canCreate || submitting" :loading="submitting" @click="create">Create Node Pool</ArButton>
          </footer>
        </ArSection>
      </aside>
    </div>
    <ArAlert v-else type="danger" icon="warning" description="This cluster could not be found. Return to the cluster list to choose a cluster." />
    </ArContainer>
  </main>
</template>

<style scoped>
.node-pool-create { --header-height: 56px; padding-bottom: 24px; }
.node-pool-create__header { margin-bottom: 24px; }
.node-pool-create__layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.node-pool-create__form { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.node-pool-create__fields { display: flex; flex-direction: column; gap: 20px; }
.node-pool-create__label-input { display: flex; gap: 16px; align-items: center; }
.node-pool-create__label-input > :first-child { flex: 1; min-width: 0; }
.node-pool-create__tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.node-pool-create__subnets { border: 1px solid var(--st-neutral-t1-5-default); border-radius: 8px; padding: 20px; min-width: 0; }
.node-pool-create__subnet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 16px; }
.node-pool-create__subnet-row { cursor: pointer; }
.node-pool-create__subnet-message { font-size: 12px; line-height: 20px; margin: 16px 0 0; color: var(--fg-neutral-t1-3-default); }
.node-pool-create__summary { min-width: 0; }
:deep(.node-pool-create__summary-content) { display: flex; flex-direction: column; padding: 24px; }
.node-pool-create__summary-details { min-height: 0; flex: 1 1 auto; }
.node-pool-create__summary-group + .node-pool-create__summary-group { margin-top: 16px; }
.node-pool-create__summary-group h2 { margin: 0 0 12px; font-size: 14px; line-height: 20px; font-weight: 450; }
.node-pool-create__summary-group p { margin: 0 0 8px; font-size: 12px; line-height: 16px; color: var(--fg-neutral-t1-3-default); overflow-wrap: anywhere; }
.node-pool-create__summary-group p span { color: var(--fg-neutral-t1-2-default); }
.node-pool-create__checkout { flex: none; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--st-neutral-t1-5-default); }
.node-pool-create__checkout > :last-child { width: 100%; }
.node-pool-create__price { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 16px; font-size: 12px; line-height: 16px; color: var(--fg-neutral-t1-3-default); }
.node-pool-create__price strong { color: var(--fg-neutral-t2-2-default); text-decoration: underline; text-underline-offset: 3px; font-size: 16px; line-height: 24px; font-weight: 450; }
@media (min-width: 901px) {
  .node-pool-create__summary { position: sticky; top: calc(var(--header-height) + 56px + 24px); }
  :deep(.node-pool-create__summary-content) { max-height: calc(100dvh - var(--header-height) - 56px - 48px); }
  .node-pool-create__summary-details { overflow-y: auto; scrollbar-gutter: stable; }
}
@media (max-width: 900px) {
  .node-pool-create__layout { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 540px) {
  .node-pool-create { padding-bottom: 16px; }
  .node-pool-create__header { margin-bottom: 16px; }
  .node-pool-create__container { padding-inline: 12px; }
  .node-pool-create__header :deep(.v11-1-0-ArContainer) { padding-inline: 12px; }
  .node-pool-create__subnets { padding: 12px; }
}
</style>
