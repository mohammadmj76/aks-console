<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import * as UIKit from '../../uikit'
import {
  REGION, FLAVOR_CATALOG, FLAVOR_CATEGORIES, fmtIRR,
} from '../../data'
import LegacyArCheckbox from '../ui/ArCheckbox.vue'
import LegacyArButton from '../ui/ArButton.vue'
import LegacyArSelect from '../ui/ArSelect.vue'
import ArRadioDot from '../ui/ArRadioDot.vue'
import LegacyArInput from '../ui/ArInput.vue'
import ArRangeSliderInput from '../ui/ArRangeSliderInput.vue'
import LegacyArField from '../ui/ArField.vue'
import LegacyArTag from '../ui/ArTag.vue'
import LegacyArBadge from '../ui/ArBadge.vue'
import LegacyArLinkButton from '../ui/ArLinkButton.vue'
import LegacyArTable from '../ui/ArTable.vue'
import LegacyArTableRow from '../ui/ArTableRow.vue'
import LegacyArTableCell from '../ui/ArTableCell.vue'
import LegacyArPagination from '../ui/ArPagination.vue'
import LegacyArTab from '../ui/ArTab.vue'
import LegacyArIcon from '../ui/ArIcon.vue'

/*
 * One node pool inside the stepper's accordion list.
 * Mutates the `pool` object from the parent's draft.pools array directly
 * (prototype mock store — no persistence of secrets).
 */
const props = defineProps({
  pool: { type: Object, required: true },
  index: { type: Number, required: true },
  open: { type: Boolean, default: false },
  ok: { type: Boolean, default: true },
  duplicateName: { type: Boolean, default: false },
  /* zones the pool may use — non-empty when master distribution is Single AZ */
  allowedZones: { type: Array, default: () => [] },
  designRefresh: { type: Boolean, default: false },
  configurationOnly: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle', 'remove'])
const ArCheckbox = computed(() => props.designRefresh ? UIKit.ArCheckbox : LegacyArCheckbox)
const ArButton = computed(() => props.designRefresh ? UIKit.ArButton : LegacyArButton)
const ArSelect = computed(() => props.designRefresh ? UIKit.ArSelect : LegacyArSelect)
const ArInput = computed(() => props.designRefresh ? UIKit.ArInput : LegacyArInput)
const ArField = computed(() => props.designRefresh ? UIKit.ArField : LegacyArField)
const ArTag = computed(() => props.designRefresh ? UIKit.ArTag : LegacyArTag)
const ArBadge = computed(() => props.designRefresh ? UIKit.ArBadge : LegacyArBadge)
const ArLinkButton = computed(() => props.designRefresh ? UIKit.ArLinkButton : LegacyArLinkButton)
const ArTable = computed(() => props.designRefresh ? UIKit.ArTable : LegacyArTable)
const ArTableRow = computed(() => props.designRefresh ? UIKit.ArTableRow : LegacyArTableRow)
const ArTableCell = computed(() => props.designRefresh ? UIKit.ArTableCell : LegacyArTableCell)
const ArTab = computed(() => props.designRefresh ? UIKit.ArTab : LegacyArTab)
const ArIcon = computed(() => props.designRefresh ? UIKit.ArIcon : LegacyArIcon)
const ArPagination = computed(() => props.designRefresh ? UIKit.ArPagination : LegacyArPagination)

const displayName = computed(() => props.pool.name || `node-pool-${props.index + 1}`)

/* exactly what still needs completing — mirrors the parent's poolOk() checks */
const missingItems = computed(() => {
  const p = props.pool
  const items = []
  if (p.name && !POOL_NAME.test(p.name)) items.push('Pool name: use lowercase letters, digits and dashes (3–40 characters)')
  if (props.duplicateName) items.push('Pool name: choose a unique name')
  if (p.specs.length !== 1) items.push('Flavor: pick one flavor from the table')
  else if (!p.specs[0].zones.length) items.push('Availability zone: select at least one zone for the chosen flavor')
  if (!(Number.isInteger(p.count) && p.count >= 1 && p.count <= 20)) items.push('Node count: between 1 and 20')
  if (props.designRefresh && !(Number.isInteger(p.rootDisk) && p.rootDisk >= 25 && p.rootDisk <= 1000)) items.push('Root volume: between 25 and 1000 GB')
  if (p.labels.length && !p.labels.every((l) => {
    const [k, v] = l.split('=')
    return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v) && k.length <= 63 && v.length <= 63
  })) items.push('Node labels: fix the invalid key=value entries')
  if (p.taints.length && !p.taints.every((t) => K8S_KEY.test(t.key) && (t.value === '' || K8S_VAL.test(t.value))))
    items.push('Taints: fix the invalid entries')
  return items
})
const review = computed(() => {
  const spec = props.pool.specs[0]
  const flavor = spec ? FLAVOR_CATALOG.find((f) => f.id === spec.flavorId) : null
  const zones = spec?.zones?.map((z) => {
    const name = REGION.zones.find((zz) => zz.id === z)?.name || z
    /* per-AZ counts when the refreshed table set them */
    return spec.zoneCounts ? `${name} ×${spec.zoneCounts[z] || 1}` : name
  }) || []
  const bits = [
    `${displayName.value}`,
    flavor?.id || 'No flavor selected',
    flavor ? `${flavor.vcpu} vCPU · ${flavor.ram} GiB RAM` : '',
    `${props.pool.count} node${props.pool.count === 1 ? '' : 's'}`,
    zones.length ? zones.join(', ') : 'No AZ selected',
    `${props.pool.rootDisk} GB root volume`,
    IMAGES.find((image) => image.id === props.pool.image)?.name || props.pool.image,
    props.pool.labels.length ? `${props.pool.labels.length} label${props.pool.labels.length === 1 ? '' : 's'}` : '',
    props.pool.taints.length ? `${props.pool.taints.length} taint${props.pool.taints.length === 1 ? '' : 's'}` : '',
  ]
  return bits.filter(Boolean).join(' · ')
})

/* ---------------- pool name / node count ---------------- */
const POOL_NAME = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/
const nameOk = computed(() => !props.pool.name || POOL_NAME.test(props.pool.name))
function countInput(e) {
  const v = e.target.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 2)
  props.pool.count = v === '' ? '' : +v
  e.target.value = props.pool.count
}
function bumpCount(d) {
  const cur = +props.pool.count || 0
  props.pool.count = Math.min(20, Math.max(1, cur + d))
}

/* ---------------- flavor catalog (per-card filters) ---------------- */
const fCat = ref('Basic')
const fVcpu = ref('')
const fMem = ref('')
const fAz = ref('')
const page = ref(1)
const perPage = ref(5)

const vcpuOptions = [...new Set(FLAVOR_CATALOG.map((f) => f.vcpu))].sort((a, b) => a - b)
const memOptions = [...new Set(FLAVOR_CATALOG.map((f) => f.ram))].sort((a, b) => a - b)

/* zones this pool may use (empty = all); flavors need an available zone inside it */
const poolZones = computed(() => (props.allowedZones.length ? props.allowedZones : REGION.zones.map((z) => z.id)))
const flavorZones = (f) => f.azs.filter((z) => poolZones.value.includes(z.id))

const filteredFlavors = computed(() =>
  FLAVOR_CATALOG.filter((f) => {
    if (f.category !== fCat.value) return false
    if (fVcpu.value !== '' && f.vcpu !== +fVcpu.value) return false
    if (fMem.value !== '' && f.ram !== +fMem.value) return false
    if (!flavorZones(f).some((z) => !z.soldOut)) return false
    if (fAz.value !== '' && !f.azs.some((z) => z.id === fAz.value && !z.soldOut)) return false
    return true
  })
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredFlavors.value.length / perPage.value)))
const pagedFlavors = computed(() =>
  filteredFlavors.value.slice((page.value - 1) * perPage.value, page.value * perPage.value)
)

/* reset to the first page whenever the filters change the result set */
watch([fCat, fVcpu, fMem, fAz], () => { page.value = 1 })

const zoneName = (id) => REGION.zones.find((z) => z.id === id)?.name || id
const azCell = (f) =>
  flavorZones(f).map((z) => (z.soldOut ? `${zoneName(z.id)} (Sold out)` : zoneName(z.id))).join(' | ')
const availableZones = (f) => flavorZones(f).filter((z) => !z.soldOut).map((z) => z.id)
const allZonesSoldOut = (f) => !availableZones(f).length

const ALL_FLAVOR_COLUMNS = [
  { label: '', name: 'pick' },
  { label: 'Flavor', name: 'flavor' },
  { label: 'AZ', name: 'az' },
  { label: 'vCPUs', name: 'vcpu' },
  { label: 'Memory', name: 'ram' },
  { label: 'Disk', name: 'disk' },
  { label: 'Port Speed', name: 'bandwidth' },
  { label: 'Pricing', name: 'pricing' },
]

const FLAVOR_COLUMNS = computed(() => ALL_FLAVOR_COLUMNS
  .filter(c => !props.designRefresh || !props.allowedZones.length || c.name !== 'az')
  .map(c => props.configurationOnly ? { ...c, label: ({ vcpu: 'vCPU', ram: 'RAM', disk: 'Volume', pricing: 'Price' })[c.name] || c.label } : c))
const filterOptions = (values, label) => [{ value: '', label }, ...values.map(v => ({ value: String(v), label: String(v) }))]
const vcpuFilterOptions = computed(() => filterOptions(vcpuOptions, props.configurationOnly ? 'All' : 'vCPU: All'))
const memoryFilterOptions = computed(() => filterOptions(memOptions, props.configurationOnly ? 'All' : 'RAM: All'))
function bumpRoot(amount) {
  props.pool.rootDisk = Math.min(ROOT_DISK_MAX, Math.max(ROOT_DISK_MIN, (+props.pool.rootDisk || ROOT_DISK_MIN) + amount))
}
/* single flavor per pool — picking another replaces the current one */
function toggleFlavor(f) {
  const spec = props.pool.specs[0]
  if (spec && spec.flavorId === f.id) {
    if (!props.designRefresh) props.pool.specs = []
  }
  else {
    props.pool.specs = [{ flavorId: f.id, zones: availableZones(f) }]
    if (props.designRefresh) {
      /* per-AZ node counts default to 1; the pool total follows the table */
      props.pool.specs[0].zoneCounts = Object.fromEntries(availableZones(f).map((z) => [z, 1]))
      syncTotalCount()
    }
  }
}
function specSelected(f) {
  return props.pool.specs[0]?.flavorId === f.id
}
function specToggleZone(zoneId, f) {
  if (!poolZones.value.includes(zoneId)) return
  if (f.azs.find((z) => z.id === zoneId)?.soldOut) return
  const spec = props.pool.specs[0]
  const zones = spec.zones
  const i = zones.indexOf(zoneId)
  if (i >= 0) {
    zones.splice(i, 1)
    if (props.designRefresh) delete spec.zoneCounts[zoneId]
  } else {
    zones.push(zoneId)
    if (props.designRefresh) spec.zoneCounts[zoneId] = 1
  }
  if (props.designRefresh) syncTotalCount()
}

/* ---------------- per-AZ node counts (design refresh, Multi AZ) ---------------- */
const AZ_COUNT_COLUMNS = [
  { label: 'AZ', name: 'az' },
  { label: 'Count', name: 'count' },
]
const creationAzRows = computed(() => REGION.zones.map((z) => {
  const available = Boolean(selectedFlavor.value?.azs.some((a) => a.id === z.id && !a.soldOut))
  const spec = props.pool.specs[0]
  return {
    id: z.id,
    name: z.name,
    checked: Boolean(spec?.zones.includes(z.id)),
    enabled: available && Boolean(spec),
    count: spec?.zoneCounts?.[z.id] ?? 1,
  }
}))
const azTotal = computed(() => {
  const spec = props.pool.specs[0]
  if (!spec) return 0
  return spec.zones.reduce((sum, z) => {
    const v = +spec.zoneCounts?.[z]
    return sum + (Number.isFinite(v) ? v : 0)
  }, 0)
})
function syncTotalCount() {
  const spec = props.pool.specs[0]
  if (!spec) return
  props.pool.count = azTotal.value
}
function setZoneCount(zoneId, value) {
  const spec = props.pool.specs[0]
  if (!spec || !spec.zones.includes(zoneId)) return
  spec.zoneCounts[zoneId] = value
  syncTotalCount()
}
function bumpZoneCount(zoneId, delta) {
  const spec = props.pool.specs[0]
  if (!spec || !spec.zones.includes(zoneId)) return
  const cur = +spec.zoneCounts[zoneId] || 1
  setZoneCount(zoneId, Math.min(20, Math.max(1, cur + delta)))
}
const selectedFlavor = computed(() =>
  props.pool.specs.length ? FLAVOR_CATALOG.find((f) => f.id === props.pool.specs[0].flavorId) : null
)

/* root disk (GB) — same bounds as the panel's root volume control */
const ROOT_DISK_MIN = 25
const ROOT_DISK_MAX = 1000

/* ---------------- advanced settings ---------------- */
const advOpen = ref(false)
const IMAGES = [
  { id: 'ubuntu-22.04', name: 'Ubuntu 22.04' },
  { id: 'debian-12', name: 'Debian 12' },
]

/* tooltip contents (v-tippy on info icons), matching the team convention */
const TIPPY_TOP = { placement: 'top', arrow: true }
const TIPS = {
  os: 'The operating system installed on every node of this pool. It cannot be changed after the pool is created.',
  labels: 'Key=value pairs added to every node of this pool. Workloads can use them to schedule pods on specific nodes.',
  taints: 'Keeps regular pods off this pool. A pod runs here only if it declares a matching toleration. Effect controls how strict the repel is: NoSchedule blocks new pods, PreferNoSchedule tries to avoid them, NoExecute evicts pods already running.',
}

const K8S_KEY = /^[a-z0-9]([a-z0-9-.]*[a-z0-9])?(\/[a-z0-9]([a-z0-9-.]*[a-z0-9])?)?$/
const K8S_VAL = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/
const nodeLabelInput = ref('')
const nodeLabelError = ref('')
/* live check on the text being typed, so a bad label is visible before Enter */
const nodeLabelPendingOk = computed(() => {
  const v = nodeLabelInput.value.trim().replace(/\s+/g, '')
  if (!v) return true
  const [k, val] = v.split('=')
  return v.includes('=') && K8S_KEY.test(k) && val !== undefined && K8S_VAL.test(val) && k.length <= 63 && val.length <= 63
})
function addNodeLabel(e) {
  /* read the DOM value at Enter time: the ref can lag behind while an IME
     composition is still open (Persian keyboards, mobile keyboards) */
  const raw = e && e.target ? e.target.value : nodeLabelInput.value
  const v = raw.trim().replace(/\s+/g, '')
  nodeLabelError.value = ''
  if (!v) {
    /* nothing typed */
  } else if (!v.includes('=')) {
    nodeLabelError.value = 'Use the key=value format. Example: team=backend.'
  } else if (props.pool.labels.includes(v)) {
    nodeLabelError.value = 'This label is already added.'
  } else if (props.pool.labels.length >= 20) {
    nodeLabelError.value = 'You can add up to 20 labels per pool.'
  } else {
    props.pool.labels.push(v)
  }
  nodeLabelInput.value = ''
  if (e && e.target) e.target.value = ''
}
/* plain keydown handler: ignore the Enter that commits an IME composition,
   so the text stays in the box and the next Enter adds the label */
function onNodeLabelKeydown(e) {
  if (e.key !== 'Enter') return
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  addNodeLabel(e)
}
function removeNodeLabel(l) {
  props.pool.labels = props.pool.labels.filter((x) => x !== l)
}
function addTaint() {
  props.pool.taints.push({ key: '', value: '', effect: 'NoSchedule' })
}
function removeTaint(t) {
  props.pool.taints = props.pool.taints.filter((x) => x !== t)
}
const taintsOk = computed(() =>
  props.pool.taints.every((t) => K8S_KEY.test(t.key) && (t.value === '' || K8S_VAL.test(t.value)))
)

/* ---------------- two-click delete ---------------- */
const confirmDelete = ref(false)
let confirmTimer = null
function onDelete() {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    confirmTimer = setTimeout(() => (confirmDelete.value = false), 3000)
  } else {
    clearTimeout(confirmTimer)
    emit('remove')
  }
}
onBeforeUnmount(() => clearTimeout(confirmTimer))
</script>

<template>
  <div class="pool-card" :class="{ open, invalid: !ok && !configurationOnly, 'design-refresh': designRefresh, 'configuration-only': configurationOnly }">
    <!-- ======== header (always visible) ======== -->
    <div v-if="!configurationOnly" class="pool-head" role="button" :aria-expanded="open" tabindex="0"
      @click="emit('toggle')"
      @keydown.enter.self.prevent="emit('toggle')"
      @keydown.space.self.prevent="emit('toggle')"
    >
      <ArIcon
        name="chevron-down"
        size="sm"
        class="pool-chev"
        :class="{ flip: open }"
      />
      <div class="pool-titles">
        <span class="pool-name text-body-1-strong">{{ designRefresh ? `Node Pool ${index + 1}` : displayName }}</span>
        <span v-if="!open && !ok" class="pool-sub err-sub text-caption-1">
          <span v-for="item in missingItems" :key="item">{{ item }}</span>
          <span v-if="!missingItems.length">Complete the required settings.</span>
        </span>
        <span v-else-if="!open" class="pool-sub text-caption-1">{{ review }}</span>
      </div>
      <ArBadge
        v-if="!open && !ok"
        class="pool-status"
        :variant="designRefresh ? 'warning' : 'danger'"
        prepend-icon="warning"
        size="sm"
        pill
        text="Incomplete"
      />
      <ArBadge
        v-else-if="!open && ok"
        class="pool-status"
        variant="success"
        size="sm"
        pill
        text="Complete"
      />
      <ArLinkButton v-if="designRefresh" class="delete-pool-link" prepend-icon="trash" @click.stop="onDelete">{{ confirmDelete ? 'Confirm delete?' : 'Delete' }}</ArLinkButton>
      <button
        v-else
        class="pool-del"
        :class="{ confirm: confirmDelete }"
        :aria-label="confirmDelete ? 'Confirm delete' : 'Delete pool'"
        @click.stop="onDelete"
      >
        <template v-if="confirmDelete">Confirm delete?</template>
        <ArIcon
          v-else
          name="trash"
          size="sm"
        />
      </button>
    </div>

    <!-- ======== body (expanded) ======== -->
    <div
      v-show="open"
      class="pool-body"
    >
      <div v-if="!configurationOnly" class="flex gap-4 flex-wrap">
        <ArField
          :label="designRefresh ? 'Node Pool Name' : 'Pool Name'"
          class="pool-name-field"
          :error="(Boolean(pool.name) && !nameOk) || duplicateName"
          :message="pool.name && !nameOk ? 'Lowercase letters, digits and dashes. 3–40 characters.' : duplicateName ? 'A node pool with this name already exists.' : `Leave blank to use node-pool-${index + 1}.`"
        >
          <ArInput
            v-model="pool.name"
            placeholder="Enter a name"
            spellcheck="false"
            ltr
            style="text-transform: lowercase"
          />
        </ArField>
        <div v-if="!designRefresh" class="ar-field" style="width: 170px">
          <label>Node Count<span class="req">*</span></label>
          <div class="count-ctl" :class="{ 'error-mode': pool.count === '' || pool.count < 1 || pool.count > 20 }">
            <button type="button" aria-label="Decrease node count" :disabled="pool.count <= 1" @click="bumpCount(-1)">−</button>
            <input :value="pool.count" inputmode="numeric" aria-label="Node count" @input="countInput" @blur="bumpCount(0)" />
            <button type="button" aria-label="Increase node count" :disabled="pool.count >= 20" @click="bumpCount(1)">+</button>
          </div>
          <span class="hint">1–20 nodes per pool.</span>
        </div>
      </div>

      <!-- category and filters share the same catalog in both variants -->
      <ArTab v-if="designRefresh" v-model="fCat" :items="FLAVOR_CATEGORIES" />
      <span v-if="designRefresh" class="text-body-2">Filters</span>
      <div class="flavor-filter" :class="{ 'design-filters': designRefresh }">
        <ArField :label="designRefresh ? '' : 'vCPUs'">
          <ArSelect
            :model-value="designRefresh ? vcpuFilterOptions.find(v => v.value === fVcpu) : fVcpu"
            :options="designRefresh ? vcpuFilterOptions : filterOptions(vcpuOptions, 'All')"
            track-by="value"
            :allow-empty="false"
            aria-label="vCPU"
            @update:model-value="fVcpu = designRefresh ? $event.value : $event"
          />
        </ArField>
        <ArField :label="designRefresh ? '' : 'Memory'">
          <ArSelect
            :model-value="designRefresh ? memoryFilterOptions.find(v => v.value === fMem) : fMem"
            :options="designRefresh ? memoryFilterOptions : filterOptions(memOptions, 'All')"
            track-by="value"
            :allow-empty="false"
            aria-label="RAM"
            @update:model-value="fMem = designRefresh ? $event.value : $event"
          />
        </ArField>
        <ArField v-if="!designRefresh" label="AZ">
          <ArSelect v-model="fAz" :options="[{ value: '', label: 'All' }, ...poolZones.map(z => ({ value: z, label: zoneName(z) }))]" aria-label="AZ" />
        </ArField>
      </div>
      <ArTab v-if="!designRefresh" v-model="fCat" flat :items="FLAVOR_CATEGORIES" />
      <span v-if="designRefresh && !configurationOnly" class="text-body-2">Flavor</span>

      <!-- flavor table -->
      <ArTable
        :columns="FLAVOR_COLUMNS"
        :items="pagedFlavors"
        class="flavor-table"
      >
        <template #row="f">
          <ArTableRow
            :key="f.id"
            class="flavor-row"
            :class="{ selected: specSelected(f), 'sold-out': allZonesSoldOut(f) }"
            @click="!allZonesSoldOut(f) && toggleFlavor(f)"
          >
            <ArTableCell @click.stop>
              <UIKit.ArRadio v-if="designRefresh" :model-value="pool.specs[0]?.flavorId || ''" :value="f.id" :disabled="allZonesSoldOut(f)" @update:model-value="toggleFlavor(f)" />
              <ArRadioDot
                v-else
                :model-value="specSelected(f)"
                :disabled="allZonesSoldOut(f)"
                @update:model-value="toggleFlavor(f)"
              />
            </ArTableCell>
            <ArTableCell class="mono cell-main">{{ f.id }}</ArTableCell>
            <ArTableCell v-if="!designRefresh || !allowedZones.length" :class="{ muted: f.azs.some(z => z.soldOut) }">
              <template v-if="designRefresh"><span v-for="z in flavorZones(f)" :key="z.id" class="az-cell-label">{{ zoneName(z.id) }}</span></template>
              <template v-else>{{ azCell(f) }}</template>
            </ArTableCell>
            <ArTableCell>{{ f.vcpu }}{{ configurationOnly ? ' Core' : '' }}</ArTableCell>
            <ArTableCell>{{ f.ram }} {{ configurationOnly ? 'GB' : 'GiB' }}</ArTableCell>
            <ArTableCell>25 GB</ArTableCell>
            <ArTableCell class="muted">{{ f.bandwidth.split(' / ').pop() }}</ArTableCell>
            <ArTableCell class="text-body-2-strong">{{ fmtIRR(Math.round(f.pricePerHour * (designRefresh ? 24 : 730))) }} IRR/{{ designRefresh ? 'Day' : 'month' }}</ArTableCell>
          </ArTableRow>
        </template>
        <template #noContent>
          <span class="text-body-2 muted">No flavors match the current filters.</span>
        </template>
      </ArTable>

      <div v-if="!designRefresh || totalPages > 1" class="flex space-between align-items-center">
        <span class="text-caption-1 muted">
          Showing {{ filteredFlavors.length ? (page - 1) * perPage + 1 : 0 }}–{{ Math.min(page * perPage, filteredFlavors.length) }} of {{ filteredFlavors.length }}
        </span>
        <ArPagination
          :current="page"
          :total="totalPages"
          @page-change="page = $event"
        />
      </div>

      <!-- selected specification — zone chips instead of the old nested table
           (user testing: the table-based AZ selection was confusing) -->
      <div
        v-if="pool.specs.length && !designRefresh"
        class="spec-box"
      >
        <h4 class="text-body-1 spec-title">Selected Specification</h4>
        <p class="spec-line text-body-2">
          {{ selectedFlavor?.category }} ·
          <span class="mono">{{ pool.specs[0].flavorId }}</span> ·
          {{ selectedFlavor?.vcpu }} vCPUs ·
          {{ selectedFlavor?.ram }} GiB ·
          {{ fmtIRR(Math.round(selectedFlavor?.pricePerHour * 730 || 0)) }} IRR/month
        </p>
        <template v-if="!allowedZones.length">
          <span class="text-caption-1 muted">Availability Zones — the nodes run only in the zones you select.</span>
          <div class="chip-row">
            <label
              v-for="z in flavorZones(selectedFlavor)"
              :key="z.id"
              class="zone-chip text-body-2"
              :class="{
                on: pool.specs[0].zones.includes(z.id),
                off: z.soldOut,
              }"
            >
              <ArCheckbox
                :model-value="pool.specs[0].zones.includes(z.id)"
                :disabled="z.soldOut"
                @update:model-value="specToggleZone(z.id, selectedFlavor)"
              />
              {{ zoneName(z.id) }}
              <ArBadge
                v-if="z.soldOut"
                variant="danger"
                size="sm"
                text="Sold out"
              />
            </label>
          </div>
          <span
            v-if="!pool.specs[0].zones.length"
            class="spec-err text-caption-1-strong"
          >
            Select at least one availability zone for this flavor.
          </span>
        </template>
        <p
          v-else
          class="spec-line text-caption-1 muted"
        >
          Single AZ — the nodes run in {{ zoneName(allowedZones[0]) }}, the same availability zone as the control plane.
        </p>
      </div>

      <template v-if="designRefresh">
        <div v-if="!allowedZones.length" class="creation-azs">
          <span class="text-body-2">{{ configurationOnly ? 'Node Creation AZs' : 'AZs for Node Creation' }}<span v-if="configurationOnly" class="required-mark">*</span></span>
          <ArTable :columns="AZ_COUNT_COLUMNS" :items="creationAzRows" class="creation-az-table">
            <template #row="row">
              <ArTableRow :key="row.id">
                <ArTableCell>
                  <div class="creation-az-cell">
                    <ArCheckbox :model-value="row.checked" :disabled="!row.enabled" :aria-label="`Select ${row.name} for node creation`" @update:model-value="specToggleZone(row.id, selectedFlavor)" />
                    <span>{{ row.name }}</span>
                  </div>
                </ArTableCell>
                <ArTableCell>
                  <div class="number-stepper creation-az-count" :class="{ 'is-disabled': !row.checked }">
                    <ArButton variant="ghost" icon="minus" :disabled="!row.checked || (+row.count || 1) <= 1" :aria-label="`Decrease node count in ${row.name}`" @click="bumpZoneCount(row.id, -1)" />
                    <ArInput :model-value="row.checked ? row.count : ''" :disabled="!row.checked" inputmode="numeric" :aria-label="`Node count in ${row.name}`" @update:model-value="setZoneCount(row.id, /^\d+$/.test($event) ? +$event : '')" @focusout="bumpZoneCount(row.id, 0)" />
                    <ArButton variant="ghost" icon="plus" :disabled="!row.checked || pool.count >= 20" :aria-label="`Increase node count in ${row.name}`" @click="bumpZoneCount(row.id, 1)" />
                  </div>
                </ArTableCell>
              </ArTableRow>
            </template>
          </ArTable>
          <div class="creation-az-total text-body-2">Total Node Count: {{ azTotal }}</div>
          <UIKit.ArAlert type="info" icon="info" description="Select one or more availability zones for worker nodes. You can select all three." />
        </div>
        <ArField label="Root Volume" :error="!Number.isInteger(pool.rootDisk) || pool.rootDisk < ROOT_DISK_MIN || pool.rootDisk > ROOT_DISK_MAX">
          <div class="volume-row">
            <div class="number-stepper">
              <ArButton variant="ghost" icon="minus" :disabled="pool.rootDisk <= ROOT_DISK_MIN" aria-label="Decrease root volume" @click="bumpRoot(-1)" />
              <ArInput :model-value="pool.rootDisk" inputmode="numeric" aria-label="Root volume" @update:model-value="pool.rootDisk = /^\d+$/.test($event) ? +$event : ''" @focusout="bumpRoot(0)" />
              <ArButton variant="ghost" icon="plus" :disabled="pool.rootDisk >= ROOT_DISK_MAX" aria-label="Increase root volume" @click="bumpRoot(1)" />
            </div>
            <span class="volume-spec">IOPS: 1000</span><span class="volume-spec">Bandwidth: 15 MB/S</span>
          </div>
        </ArField>
        <ArField v-if="allowedZones.length" label="Node Count" message="1–20 nodes per pool." :error="!Number.isInteger(pool.count) || pool.count < 1 || pool.count > 20">
          <div class="number-stepper">
            <ArButton variant="ghost" icon="minus" :disabled="pool.count <= 1" aria-label="Decrease node count" @click="bumpCount(-1)" />
            <ArInput :model-value="pool.count" inputmode="numeric" aria-label="Node count" @update:model-value="pool.count = /^\d+$/.test($event) ? +$event : ''" @focusout="bumpCount(0)" />
            <ArButton variant="ghost" icon="plus" :disabled="pool.count >= 20" aria-label="Increase node count" @click="bumpCount(1)" />
          </div>
        </ArField>
      </template>
      <div v-else class="root-disk-box">
        <h4 class="text-body-1 root-disk-title">Root Disk</h4>
        <ArRangeSliderInput v-model="pool.rootDisk" :min="ROOT_DISK_MIN" :max="ROOT_DISK_MAX" class="root-disk-ctl" />
      </div>

      <!-- advanced settings (optional) -->
      <button
        v-if="!designRefresh"
        class="adv-toggle"
        @click="advOpen = !advOpen"
      >
        Advanced Settings (Optional)
        <ArIcon
          name="chevron-down"
          size="sm"
          class="chev"
          :style="{ transform: advOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }"
        />
      </button>

      <div
        v-if="advOpen"
        class="adv-box"
      >
        <!-- OS -->
        <div class="dist-row" style="align-items: flex-start">
          <span class="dist-k" style="margin-top: 6px">
            <span class="k-tip">
              OS
              <ArIcon
                name="info"
                size="xs"
                v-tippy="{ ...TIPPY_TOP, content: TIPS.os }"
                class="info-icon"
              />
            </span>
          </span>
          <div style="display: flex; flex-direction: column; gap: var(--space-3)">
            <div class="chip-row">
              <button
                v-for="img in IMAGES"
                :key="img.id"
                class="os-card"
                :class="{ on: pool.image === img.id }"
                @click="pool.image = img.id"
              >
                <span class="os-logo" :class="img.id.startsWith('ubuntu') ? 'os-ubuntu' : 'os-debian'">
                  <svg v-if="img.id.startsWith('ubuntu')" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="12" r="1.6"/><circle cx="14" cy="7.5" r="1.6"/><circle cx="14" cy="16.5" r="1.6"/></svg>
                  <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 9 9c0-.6 0-1.2-.2-1.8A5 5 0 0 1 13 4.2 9 9 0 0 0 12 3Z"/><path d="M8 12.5c1.8 0 3.2-1.4 3.2-3.2"/></svg>
                </span>
                {{ img.name }}
              </button>
            </div>
          </div>
        </div>

        <!-- Node labels -->
        <div class="dist-row" style="align-items: flex-start">
          <span class="dist-k" style="margin-top: 6px">
            <span class="k-tip">
              Node Labels
              <ArIcon
                name="info"
                size="xs"
                v-tippy="{ ...TIPPY_TOP, content: TIPS.labels }"
                class="info-icon"
              />
            </span>
          </span>
          <div class="adv-col">
            <!-- panel's tag input pattern: input with a separate "+" button,
                 hint below, then the added tags -->
            <div class="label-input-row">
              <ArInput
                v-model="nodeLabelInput"
                placeholder="Confirm labels with enter"
                spellcheck="false"
                @input="nodeLabelError = ''"
                @keydown="onNodeLabelKeydown"
              />
              <ArButton variant="secondary" icon="plus" aria-label="Add label" @click="addNodeLabel()" />
            </div>
            <span
              v-if="nodeLabelError"
              class="field-msg text-caption-1-strong"
            >{{ nodeLabelError }}</span>
            <span
              v-else-if="nodeLabelInput && !nodeLabelPendingOk"
              class="field-msg text-caption-1-strong"
            >Use the key=value format: lowercase keys with letters, digits, - and . Values up to 63 characters.</span>
            <span
              v-else
              class="field-msg text-caption-1 muted"
            >After typing each label, press the Enter key.</span>
            <div v-if="pool.labels.length" class="label-tags">
              <ArTag
                v-for="l in pool.labels"
                :key="l"
                class="mono"
                @click="removeNodeLabel(l)"
              >
                {{ l }}
              </ArTag>
            </div>
          </div>
        </div>

        <!-- Taints -->
        <div class="dist-row" style="align-items: flex-start">
          <span class="dist-k" style="margin-top: 6px">
            <span class="k-tip">
              Taints
              <ArIcon
                name="info"
                size="xs"
                v-tippy="{ ...TIPPY_TOP, content: TIPS.taints }"
                class="info-icon"
              />
            </span>
          </span>
          <div class="adv-col gap-3">
            <div
              v-for="(t, i) in pool.taints"
              :key="i"
              class="dist-row taint-row"
            >
              <ArInput
                v-model="t.key"
                class="taint-key"
                placeholder="Key"
                spellcheck="false"
                ltr
                style="text-transform: lowercase"
                :error="Boolean(t.key) && !K8S_KEY.test(t.key)"
              />
              <ArInput
                v-model="t.value"
                class="taint-key"
                placeholder="Value"
                spellcheck="false"
                :error="Boolean(t.value) && !K8S_VAL.test(t.value)"
              />
              <ArSelect
                class="taint-effect"
                v-model="t.effect"
                :options="['NoSchedule', 'PreferNoSchedule', 'NoExecute']"
                aria-label="Taint effect"
              />
              <button
                class="taint-x"
                aria-label="Remove taint"
                @click="removeTaint(t)"
              >
                <ArIcon
                  name="cross"
                  size="xs"
                />
              </button>
            </div>
            <ArLinkButton
              prepend-icon="plus"
              @click="addTaint"
            >
              Add taint
            </ArLinkButton>
            <span
              v-if="pool.taints.length && !taintsOk"
              class="field-msg text-caption-1-strong"
            >Taint keys must be lowercase (letters, digits, -, .). Value is optional.</span>
            <span
              v-else
              class="field-msg text-caption-1 muted"
            >Tainted nodes repel pods that do not tolerate the taint. Value is optional.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.configuration-only.pool-card { border: 0; border-radius: 0; overflow: visible; }
.configuration-only.design-refresh .pool-body { padding: 0; border-top: 0; }
.configuration-only .az-cell-label { background: var(--bg-neutral-t1-3-default); padding: 0 2px; margin-bottom: 2px; }
.configuration-only .flavor-table { border: 1px solid var(--st-neutral-t1-5-default); border-radius: 8px; padding: 16px; }
.configuration-only .flavor-row.selected { background: transparent; }
.configuration-only .flavor-row > :last-child { white-space: nowrap; text-decoration: underline; }
@media (max-width: 540px) { .configuration-only.design-refresh .design-filters { grid-template-columns: minmax(0, 1fr); } .configuration-only .flavor-table { padding: 8px; } }
.required-mark { color: var(--fg-error-t1-1-default); margin-left: 2px; }
.design-refresh .pool-name-field { width: 100%; max-width: none; min-width: 0; }
.design-refresh .pool-head { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; padding: 24px; }
.design-refresh .pool-titles { display: contents; }
.design-refresh .pool-chev { grid-column: 1; grid-row: 1; }
.design-refresh .pool-name { grid-column: 2; grid-row: 1; }
.design-refresh .pool-head > .pool-status { grid-column: 3; grid-row: 1; }
.design-refresh .delete-pool-link { grid-column: 4; grid-row: 1; }
.design-refresh .pool-sub { grid-column: 2 / -1; grid-row: 2; }
@media (max-width: 540px) {
  .design-refresh .pool-head { grid-template-columns: 16px minmax(0, 1fr) auto; gap: 8px; padding: 16px; }
  .design-refresh .delete-pool-link { grid-column: 3; }
  .design-refresh .pool-head > .pool-status { grid-column: 2; grid-row: 2; justify-self: start; }
  .design-refresh .pool-sub { grid-row: 3; }
}
.delete-pool-link { color: var(--fg-error-t1-1-default); }
.design-refresh .pool-body { padding: 24px; gap: 16px; }
.design-refresh .design-filters { display: grid; grid-template-columns: 1fr 1fr; width: 100%; gap: 16px; }
.design-refresh .design-filters > * { min-width: 0; width: auto; }
.creation-azs { display: flex; flex-direction: column; gap: 12px; }
.creation-az-cell { display: flex; align-items: center; gap: 12px; }
.creation-az-table :deep(.number-stepper) { width: 140px; }
.creation-az-count.is-disabled { opacity: 0.45; }
.creation-az-total { text-align: right; color: var(--fg-neutral-t1-2-default); }
.az-cell-label { display: block; width: max-content; font-size: 12px; }
.number-stepper { display: flex; align-items: center; width: 200px; border: 1px solid var(--st-neutral-t1-4-default); border-radius: 8px; }
.number-stepper :deep([class$="-ArInput"]) { min-width: 0; flex: 1; --inputBorder: transparent; }
.number-stepper :deep(input) { text-align: center; padding: 0; }
.volume-row { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.volume-spec { background: var(--bg-neutral-t1-3-default); color: var(--fg-neutral-t1-3-default); font-size: 12px; padding: 2px 4px; }

.pool-card {
  border: 1px solid var(--st-neutral-t1-5-default);
  border-radius: var(--radius-lg, var(--radius-md));
  background: var(--bg-neutral-t1-1-default);
  overflow: hidden;
}
.pool-card.invalid { border-color: var(--bg-error-t2-1-default); }
.pool-head {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  cursor: pointer; user-select: none;
}
.pool-head:hover { background: var(--bg-neutral-t1-4-default); }
.pool-chev { flex: none; color: var(--fg-neutral-t1-2-default); transition: transform .2s; }
.pool-chev.flip { transform: rotate(180deg); }
.pool-titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pool-name { color: var(--fg-neutral-t1-1-default); }
.pool-sub {
  color: var(--fg-neutral-t1-3-default);
  white-space: normal; overflow-wrap: anywhere;
}
.pool-sub > span { display: block; }
.pool-sub.err-sub { color: var(--fg-error-t1-1-default); }
.pool-del {
  flex: none; display: inline-flex; align-items: center; gap: 4px;
  border: 0; background: none; cursor: pointer; font: inherit;
  font-size: 12px; font-weight: 450; line-height: 16px; letter-spacing: -0.24px;
  color: var(--fg-neutral-t1-3-default);
  padding: 6px; border-radius: var(--radius-sm);
}
.pool-del:hover { color: var(--fg-error-t1-1-default); background: var(--bg-error-t2-1-default); }
.pool-del.confirm { color: var(--fg-error-t1-1-default); background: var(--bg-error-t2-1-default); font-weight: 450; }
.pool-body {
  display: flex; flex-direction: column; gap: var(--space-5);
  padding: var(--space-2) var(--space-5) var(--space-6);
  border-top: 1px solid var(--st-neutral-t1-5-default);
}
.count-ctl {
  display: inline-flex; align-items: center; width: fit-content;
  border: 1px solid var(--st-neutral-t1-5-default); border-radius: var(--radius-sm);
  background: var(--bg-neutral-t1-1-default); overflow: hidden;
}
.count-ctl.error-mode { border-color: var(--bg-error-t2-1-default); }
.count-ctl button {
  width: 34px; height: 36px; border: 0; background: none; cursor: pointer;
  font-size: 16px; color: var(--fg-neutral-t1-2-default);
}
.count-ctl button:hover:not(:disabled) { background: var(--bg-neutral-t1-4-default); color: var(--fg-neutral-t1-1-default); }
.count-ctl button:disabled { opacity: .4; cursor: not-allowed; }
.count-ctl input {
  width: 44px; height: 36px; text-align: center; border: 0; outline: 0;
  background: transparent; font: inherit; font-size: 14px; line-height: 20px;
  letter-spacing: -0.28px; color: var(--fg-neutral-t1-1-default);
}
.spec-box {
  border: 1px solid var(--st-neutral-t1-5-default); border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-6) var(--space-6);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.spec-title { margin: 0 0 var(--space-3); }
.spec-line { margin: 0; color: var(--fg-neutral-t1-2-default); }
.spec-line .mono { color: var(--fg-neutral-t1-1-default); }
.spec-err { color: var(--fg-error-t1-1-default); }
.zone-chip {
  display: inline-flex; align-items: center; gap: var(--space-2);
  border: 1px solid var(--st-neutral-t1-5-default); border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3); cursor: pointer;
  color: var(--fg-neutral-t1-2-default); background: var(--bg-neutral-t1-1-default);
}
.zone-chip:hover:not(.off) { border-color: var(--st-primary-t1-1-default); }
.zone-chip.on {
  border-color: var(--st-primary-t1-1-default);
  background: var(--bg-primary-t2-1-default);
  color: var(--fg-neutral-t1-1-default);
}
.zone-chip.off { opacity: .55; cursor: not-allowed; }
.root-disk-box {
  display: flex; align-items: center; gap: var(--space-4);
}
.root-disk-title { margin: 0; }
.root-disk-ctl { width: 266px; }
.check-line {
  display: inline-flex; align-items: center; gap: var(--space-2);
  color: var(--fg-neutral-t1-2-default); cursor: pointer;
}
.flavor-filter { display: flex; gap: var(--space-4); flex-wrap: wrap; align-items: flex-end; }
.flavor-row { cursor: pointer; }
.flavor-row:hover { background: var(--bg-neutral-t1-4-default); }
.flavor-row.selected { background: var(--bg-primary-t2-1-default); }
.flavor-row.sold-out { color: var(--fg-neutral-t1-3-default); }
.flex { display: flex; }
.flex-wrap { flex-wrap: wrap; }
.gap-3 { gap: var(--space-3); }
.gap-4 { gap: var(--space-4); }
.space-between { justify-content: space-between; }
.align-items-center { align-items: center; }
.pool-name-field { flex: 1; min-width: 220px; max-width: 360px; }
.adv-box {
  border: 1px solid var(--st-neutral-t1-5-default); border-radius: var(--radius-md);
  padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-5);
}
.adv-col { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); max-width: 560px; }
.adv-col.gap-3 { gap: var(--space-3); }
.taint-row { flex-wrap: nowrap; gap: var(--space-2); }
.taint-key { flex: 2; }
.field-msg { line-height: 16px; }
/* label + info tooltip (same pattern as the views' .info-icon) */
.k-tip { display: inline-flex; align-items: center; gap: 4px; }
.info-icon { color: var(--fg-neutral-t1-3-default); cursor: help; }
.info-icon:hover { color: var(--fg-neutral-t1-2-default); }
</style>
