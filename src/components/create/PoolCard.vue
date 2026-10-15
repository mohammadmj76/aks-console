<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  REGION, FLAVOR_CATALOG, FLAVOR_CATEGORIES, fmtIRR,
} from '../../data'
import ArCheckbox from '../ui/ArCheckbox.vue'
import ArSelect from '../ui/ArSelect.vue'
import ArRadioDot from '../ui/ArRadioDot.vue'
import ArInput from '../ui/ArInput.vue'
import ArField from '../ui/ArField.vue'
import ArTag from '../ui/ArTag.vue'
import ArBadge from '../ui/ArBadge.vue'
import ArLinkButton from '../ui/ArLinkButton.vue'
import ArTable from '../ui/ArTable.vue'
import ArTableRow from '../ui/ArTableRow.vue'
import ArTableCell from '../ui/ArTableCell.vue'
import ArPagination from '../ui/ArPagination.vue'
import ArTab from '../ui/ArTab.vue'
import ArIcon from '../ui/ArIcon.vue'

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
  /* zones the pool may use — non-empty when master distribution is Single AZ */
  allowedZones: { type: Array, default: () => [] },
})
const emit = defineEmits(['toggle', 'remove'])

const displayName = computed(() => props.pool.name || `node-pool-${props.index + 1}`)

/* exactly what still needs completing — mirrors the parent's poolOk() checks */
const missingItems = computed(() => {
  const p = props.pool
  const items = []
  if (p.name && !POOL_NAME.test(p.name)) items.push('Pool name: use lowercase letters, digits and dashes (3–40 characters)')
  if (!p.specs.length) items.push('Flavor: pick one from the flavor table')
  else if (!p.specs[0].zones.length) items.push('Availability zone: select at least one zone for the chosen flavor')
  if (!(Number.isInteger(p.count) && p.count >= 1 && p.count <= 20)) items.push('Node count: between 1 and 20')
  if (p.labels.length && !p.labels.every((l) => {
    const [k, v] = l.split('=')
    return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v) && k.length <= 63 && v.length <= 63
  })) items.push('Node labels: fix the invalid key=value entries')
  if (p.taints.length && !p.taints.every((t) => K8S_KEY.test(t.key) && (t.value === '' || K8S_VAL.test(t.value))))
    items.push('Taints: fix the invalid entries')
  return items
})
const missingShort = computed(() =>
  missingItems.value.map((m) => m.split(':')[0]).join(' · ')
)

/* collapsed-header summary: flavor · node count · zones */
const summary = computed(() => {
  const bits = []
  const spec = props.pool.specs[0]
  if (spec) {
    bits.push(spec.flavorId)
    const zs = [...new Set(spec.zones)].map((z) => REGION.zones.find((zz) => zz.id === z)?.name || z)
    if (zs.length) bits.push(zs.join(', '))
  } else {
    bits.push('No flavor selected')
  }
  bits.push(`${props.pool.count} node${props.pool.count === 1 ? '' : 's'}`)
  return bits.join(' · ')
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

const FLAVOR_COLUMNS = [
  { label: '', name: 'pick' },
  { label: 'Flavor', name: 'flavor' },
  { label: 'AZ', name: 'az' },
  { label: 'vCPUs', name: 'vcpu' },
  { label: 'Memory', name: 'ram' },
  { label: 'Disk', name: 'disk' },
  { label: 'Port Speed', name: 'bandwidth' },
  { label: 'Pricing', name: 'pricing' },
]

/* single flavor per pool — picking another replaces the current one */
function toggleFlavor(f) {
  const spec = props.pool.specs[0]
  if (spec && spec.flavorId === f.id) props.pool.specs = []
  else props.pool.specs = [{ flavorId: f.id, zones: availableZones(f) }]
}
function specSelected(f) {
  return props.pool.specs[0]?.flavorId === f.id
}
function specToggleZone(zoneId, f) {
  if (!poolZones.value.includes(zoneId)) return
  if (f.azs.find((z) => z.id === zoneId)?.soldOut) return
  const zones = props.pool.specs[0].zones
  const i = zones.indexOf(zoneId)
  i >= 0 ? zones.splice(i, 1) : zones.push(zoneId)
}
const selectedFlavor = computed(() =>
  props.pool.specs.length ? FLAVOR_CATALOG.find((f) => f.id === props.pool.specs[0].flavorId) : null
)

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
  <div class="pool-card" :class="{ open, invalid: !ok }">
    <!-- ======== header (always visible) ======== -->
    <div class="pool-head" role="button" :aria-expanded="open" tabindex="0"
      @click="emit('toggle')"
      @keydown.enter.prevent="emit('toggle')"
    >
      <ArIcon
        name="chevron-down"
        size="sm"
        class="pool-chev"
        :class="{ flip: open }"
      />
      <div class="pool-titles">
        <span class="pool-name text-body-1-strong">{{ displayName }}</span>
        <span
          v-if="!open"
          class="pool-sub text-caption-1"
          :class="{ 'err-sub': !ok }"
        >{{ !ok ? `Missing: ${missingShort}` : summary }}</span>
      </div>
      <ArBadge
        v-if="!open && !ok"
        variant="danger"
        size="sm"
        pill
        text="Incomplete"
      />
      <ArBadge
        v-else-if="!open && ok"
        variant="success"
        size="sm"
        pill
        text="Complete"
      />
      <button
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
      <div class="flex gap-4 flex-wrap">
        <ArField
          label="Pool Name"
          class="pool-name-field"
          :error="Boolean(pool.name) && !nameOk"
          :message="pool.name && !nameOk ? 'Lowercase letters, digits and dashes. 3–40 characters.' : ''"
        >
          <ArInput
            v-model="pool.name"
            placeholder="Enter a name"
            spellcheck="false"
            ltr
            style="text-transform: lowercase"
          />
        </ArField>
        <div class="ar-field" style="width: 170px">
          <label>Node Count<span class="req">*</span></label>
          <div class="count-ctl" :class="{ 'error-mode': pool.count === '' || pool.count < 1 || pool.count > 20 }">
            <button type="button" aria-label="Decrease node count" :disabled="pool.count <= 1" @click="bumpCount(-1)">−</button>
            <input :value="pool.count" inputmode="numeric" aria-label="Node count" @input="countInput" @blur="bumpCount(0)" />
            <button type="button" aria-label="Increase node count" :disabled="pool.count >= 20" @click="bumpCount(1)">+</button>
          </div>
          <span class="hint">1–20 nodes per pool.</span>
        </div>
      </div>

      <!-- flavor filters -->
      <div class="flavor-filter">
        <div class="ar-field" style="width: 130px">
          <label>vCPUs</label>
          <ArSelect
            v-model="fVcpu"
            :options="[{ value: '', label: 'All' }, ...vcpuOptions.map((v) => ({ value: String(v), label: String(v) }))]"
            aria-label="vCPUs"
          />
        </div>
        <div class="ar-field" style="width: 130px">
          <label>Memory</label>
          <ArSelect
            v-model="fMem"
            :options="[{ value: '', label: 'All' }, ...memOptions.map((m) => ({ value: String(m), label: String(m) }))]"
            aria-label="Memory"
          />
        </div>
        <div class="ar-field" style="width: 150px">
          <label>AZ</label>
          <ArSelect
            v-model="fAz"
            :options="[{ value: '', label: 'All' }, ...poolZones.map((z) => ({ value: z, label: zoneName(z) }))]"
            aria-label="AZ"
          />
        </div>
      </div>

      <ArTab
        v-model="fCat"
        flat
        :items="FLAVOR_CATEGORIES"
      />

      <!-- flavor table -->
      <ArTable
        :columns="FLAVOR_COLUMNS"
        :items="pagedFlavors"
        key-field="id"
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
              <ArRadioDot
                :model-value="specSelected(f)"
                :disabled="allZonesSoldOut(f)"
                @update:model-value="toggleFlavor(f)"
              />
            </ArTableCell>
            <ArTableCell class="mono cell-main">{{ f.id }}</ArTableCell>
            <ArTableCell :class="{ muted: f.azs.some((z) => z.soldOut) }">{{ azCell(f) }}</ArTableCell>
            <ArTableCell>{{ f.vcpu }}</ArTableCell>
            <ArTableCell>{{ f.ram }} GiB</ArTableCell>
            <ArTableCell>25 GB</ArTableCell>
            <ArTableCell class="muted">{{ f.bandwidth.split(' / ').pop() }}</ArTableCell>
            <ArTableCell class="text-body-2-strong">{{ fmtIRR(Math.round(f.pricePerHour * 730)) }} IRR/month</ArTableCell>
          </ArTableRow>
        </template>
        <template #noContent>
          <span class="text-body-2 muted">No flavors match the current filters.</span>
        </template>
      </ArTable>

      <div class="flex space-between align-items-center">
        <span class="text-caption-1 muted">
          Showing {{ filteredFlavors.length ? (page - 1) * perPage + 1 : 0 }}–{{ Math.min(page * perPage, filteredFlavors.length) }} of {{ filteredFlavors.length }}
        </span>
        <ArPagination
          :current="page"
          :total="totalPages"
          @page-change="page = $event"
        />
      </div>

      <!-- selected specification (single) — Multi AZ only: in Single AZ the
           pool follows the master's AZ, so the AZ checkbox row is redundant -->
      <div
        v-if="pool.specs.length && !allowedZones.length"
        class="spec-box"
      >
        <h4 class="text-body-1 spec-title">Selected Specification</h4>
        <ArTable
          :columns="[
            { label: 'Specifications', name: 'spec' },
            { label: 'Pricing', name: 'price' },
            { label: 'AZ', name: 'az' },
          ]"
          :items="[{ id: 'spec' }]"
          key-field="id"
        >
          <template #row>
            <ArTableRow>
              <ArTableCell class="text-body-2-strong">
                {{ selectedFlavor?.category }} /
                <span class="mono">{{ pool.specs[0].flavorId }}</span> ·
                {{ selectedFlavor?.vcpu }} vCPUs /
                {{ selectedFlavor?.ram }} GiB
              </ArTableCell>
              <ArTableCell>{{ fmtIRR(Math.round(selectedFlavor?.pricePerHour * 730 || 0)) }} IRR/month</ArTableCell>
              <ArTableCell>
                <div class="chip-row">
                  <label
                    v-for="z in flavorZones(selectedFlavor)"
                    :key="z.id"
                    class="check-line text-body-2"
                    :style="z.soldOut ? 'opacity:.5' : ''"
                  >
                    <ArCheckbox
                      :model-value="pool.specs[0].zones.includes(z.id)"
                      :disabled="z.soldOut"
                      @update:model-value="specToggleZone(z.id, selectedFlavor)"
                    />
                    {{ z.soldOut ? `${zoneName(z.id)} (Sold out)` : zoneName(z.id) }}
                  </label>
                </div>
              </ArTableCell>
            </ArTableRow>
          </template>
        </ArTable>
        <span
          v-if="!pool.specs[0].zones.length"
          class="spec-err text-caption-1-strong"
        >
          Select at least one availability zone for this flavor.
        </span>
      </div>

      <!-- advanced settings (optional) -->
      <button
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
            <div class="tagbox">
              <ArTag
                v-for="l in pool.labels"
                :key="l"
                class="mono"
                @click="removeNodeLabel(l)"
              >
                {{ l }}
              </ArTag>
              <input
                v-model="nodeLabelInput"
                placeholder="key=value"
                spellcheck="false"
                @input="nodeLabelError = ''"
                @keydown="onNodeLabelKeydown"
              />
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
            >Applied as Kubernetes labels to every node of this pool. Press Enter after each label. Up to 20.</span>
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
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
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
.spec-err { color: var(--fg-error-t1-1-default); }
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
