<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  REGION, FLAVOR_CATALOG, FLAVOR_CATEGORIES, KEY_PAIRS, fmtIRR,
} from '../../data'
import ArCheckbox from '../ui/ArCheckbox.vue'
import ArSelectMenu from '../ui/ArSelectMenu.vue'
import ArRadioDot from '../ui/ArRadioDot.vue'

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
  if (p.loginMode === 'keypair') {
    if (!p.keyPairId) items.push('SSH key pair: select one from the list')
  } else {
    if (p.password.length < 8) items.push('SSH password: at least 8 characters')
    if (p.passwordConfirm !== p.password) items.push('Password confirmation: must match the password')
  }
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

const filteredFlavors = computed(() =>
  FLAVOR_CATALOG.filter((f) => {
    if (f.category !== fCat.value) return false
    if (fVcpu.value !== '' && f.vcpu !== +fVcpu.value) return false
    if (fMem.value !== '' && f.ram !== +fMem.value) return false
    if (fAz.value !== '' && !f.azs.some((z) => z.id === fAz.value && !z.soldOut)) return false
    return true
  })
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredFlavors.value.length / perPage.value)))
const pagedFlavors = computed(() =>
  filteredFlavors.value.slice((page.value - 1) * perPage.value, page.value * perPage.value)
)
const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, i) => i + 1))

const zoneName = (id) => REGION.zones.find((z) => z.id === id)?.name || id
const azCell = (f) =>
  f.azs.map((z) => (z.soldOut ? `${zoneName(z.id)} (Sold out)` : zoneName(z.id))).join(' | ')
const availableZones = (f) => f.azs.filter((z) => !z.soldOut).map((z) => z.id)
const allZonesSoldOut = (f) => f.azs.every((z) => z.soldOut)

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
  if (f.azs.find((z) => z.id === zoneId)?.soldOut) return
  const zones = props.pool.specs[0].zones
  const i = zones.indexOf(zoneId)
  i >= 0 ? zones.splice(i, 1) : zones.push(zoneId)
}

/* ---------------- login mode ---------------- */
const keyPairOptions = [
  { value: '', label: 'Select an SSH key pair…' },
  ...KEY_PAIRS.map((key) => ({ value: key.id, label: key.name })),
]
const selectedKeyPair = computed(() => KEY_PAIRS.find((key) => key.id === props.pool.keyPairId))
function setLoginMode(mode) {
  if (props.pool.loginMode === mode) return
  props.pool.loginMode = mode
  props.pool.password = ''
  props.pool.passwordConfirm = ''
  props.pool.keyPairId = ''
}

/* ---------------- advanced settings ---------------- */
const advOpen = ref(false)
const IMAGES = [
  { id: 'ubuntu-22.04', name: 'Ubuntu 22.04' },
  { id: 'debian-12', name: 'Debian 12' },
]

const K8S_KEY = /^[a-z0-9]([a-z0-9-.]*[a-z0-9])?(\/[a-z0-9]([a-z0-9-.]*[a-z0-9])?)?$/
const K8S_VAL = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/
const nodeLabelInput = ref('')
const nodeLabelOk = computed(() => props.pool.labels.every((l) => {
  const [k, v] = l.split('=')
  return K8S_KEY.test(k) && v !== undefined && K8S_VAL.test(v) && k.length <= 63 && v.length <= 63
}))
function addNodeLabel() {
  const v = nodeLabelInput.value.trim().replace(/\s+/g, '')
  if (v && v.includes('=') && !props.pool.labels.includes(v) && props.pool.labels.length < 20) props.pool.labels.push(v)
  nodeLabelInput.value = ''
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
      <svg class="pool-chev" :class="{ flip: open }" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 6.5 4 4 4-4"/></svg>
      <div class="pool-titles">
        <span class="pool-name text-body-1-strong">{{ displayName }}</span>
        <span v-if="!open" class="pool-sub text-caption-1" :class="{ 'err-sub': !ok }">
          {{ !ok ? `Missing: ${missingShort}` : summary }}
        </span>
      </div>
      <span v-if="!open && !ok" class="pool-badge" :title="`Missing: ${missingShort}`">
        <span class="dot"></span> Incomplete
      </span>
      <button
        class="pool-del"
        :class="{ confirm: confirmDelete }"
        :aria-label="confirmDelete ? 'Confirm delete' : 'Delete pool'"
        @click.stop="onDelete"
      >
        <template v-if="confirmDelete">Confirm delete?</template>
        <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2.5 4h11M6.5 4V2.8c0-.4.3-.8.8-.8h1.4c.5 0 .8.4.8.8V4M4 4l.6 9c0 .6.5 1 1 1h4.8c.5 0 1-.4 1-1L12 4M6.5 7v4M9.5 7v4" />
        </svg>
      </button>
    </div>

    <!-- ======== body (expanded) ======== -->
    <div v-show="open" class="pool-body">
      <div v-if="!ok" class="pool-missing">
        <svg style="flex: none; margin-top: 2px" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2 14.5 13.5H1.5L8 2Z"/><path d="M8 6.8v3M8 12.2v.2"/></svg>
        <div>
          <strong>Complete {{ missingItems.length === 1 ? 'this item' : `these ${missingItems.length} items` }} to create the cluster:</strong>
          <ul>
            <li v-for="m in missingItems" :key="m">{{ m }}</li>
          </ul>
        </div>
      </div>
      <div style="display: flex; gap: var(--space-4); flex-wrap: wrap">
        <div class="ar-field" style="flex: 1; min-width: 220px; max-width: 360px">
          <label>Pool Name</label>
          <div class="ar-input" :class="{ 'error-mode': pool.name && !nameOk }">
            <input v-model="pool.name" placeholder="Enter a name" spellcheck="false" style="text-transform: lowercase" />
          </div>
          <span v-if="pool.name && !nameOk" class="error-text">Lowercase letters, digits and dashes. 3–40 characters.</span>
        </div>
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

      <!-- selected specification (single) -->
      <div v-if="pool.specs.length" class="spec-box">
        <h4 class="text-body-1" style="margin: 0 0 var(--space-3)">Selected Specification</h4>
        <div class="table-scroll">
          <table class="ar-table">
            <thead>
              <tr><th>Specifications</th><th>Pricing</th><th style="width: 40%">AZ</th></tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-body-2-strong">
                  {{ FLAVOR_CATALOG.find((f) => f.id === pool.specs[0].flavorId)?.category }} /
                  <span class="mono">{{ pool.specs[0].flavorId }}</span> ·
                  {{ FLAVOR_CATALOG.find((f) => f.id === pool.specs[0].flavorId)?.vcpu }} vCPUs /
                  {{ FLAVOR_CATALOG.find((f) => f.id === pool.specs[0].flavorId)?.ram }} GiB
                </td>
                <td class="text-body-2">{{ fmtIRR(FLAVOR_CATALOG.find((f) => f.id === pool.specs[0].flavorId)?.pricePerHour) }} IRR/hour</td>
                <td>
                  <div class="chip-row">
                    <label
                      v-for="z in FLAVOR_CATALOG.find((f) => f.id === pool.specs[0].flavorId)?.azs"
                      :key="z.id"
                      class="check-line"
                      :style="z.soldOut ? 'opacity:.5' : ''"
                    >
                      <ArCheckbox
                        :model-value="pool.specs[0].zones.includes(z.id)"
                        :disabled="z.soldOut"
                        @update:model-value="specToggleZone(z.id, FLAVOR_CATALOG.find((f) => f.id === pool.specs[0].flavorId))"
                      />
                      {{ z.soldOut ? `${zoneName(z.id)} (Sold out)` : zoneName(z.id) }}
                    </label>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <span v-if="!pool.specs[0].zones.length" class="error-text">
          Select at least one availability zone for this flavor.
        </span>
      </div>

      <!-- login mode (required) -->
      <div class="ar-field" style="max-width: 640px">
        <span class="ar-field-label">Login Mode<span class="req">*</span></span>
        <div class="dist-rows">
          <div class="dist-row">
            <div class="seg dist-seg">
              <button :class="{ on: pool.loginMode === 'password' }" @click="setLoginMode('password')">Password</button>
              <button :class="{ on: pool.loginMode === 'keypair' }" @click="setLoginMode('keypair')">Key Pair</button>
            </div>
          </div>
          <template v-if="pool.loginMode === 'password'">
            <div class="dist-row" style="flex-wrap: nowrap">
              <span class="dist-k" style="width: 90px">Username</span>
              <span class="text-body-2-strong">root</span>
            </div>
            <div class="dist-row" style="flex-wrap: nowrap">
              <span class="dist-k" style="width: 90px">Password</span>
              <div class="ar-input" style="flex: 1; max-width: 250px" :class="{ 'error-mode': pool.password && pool.password.length < 8 }">
                <input v-model="pool.password" type="password" placeholder="Enter a password." autocomplete="new-password" />
              </div>
              <div class="ar-input" style="flex: 1; max-width: 250px" :class="{ 'error-mode': pool.passwordConfirm && pool.passwordConfirm !== pool.password }">
                <input v-model="pool.passwordConfirm" type="password" placeholder="Confirm the password." autocomplete="new-password" />
              </div>
            </div>
            <span v-if="pool.password && pool.password.length < 8" class="error-text">Password must be at least 8 characters.</span>
            <span v-else-if="pool.passwordConfirm && pool.passwordConfirm !== pool.password" class="error-text">Passwords do not match.</span>
            <p class="scale-note muted">The password is used to log in to the nodes of this pool over SSH.</p>
          </template>
          <div v-else class="key-pair-panel">
            <span class="ar-field-label">Key Pair<span class="req">*</span></span>
            <ArSelectMenu
              v-model="pool.keyPairId"
              :options="keyPairOptions"
              searchable
              search-placeholder="Search key pairs…"
              empty-text="No key pairs found"
              aria-label="SSH key pair"
              style="width: 100%; max-width: 380px"
            />
            <p class="scale-note muted">Select a project SSH key to access the nodes in this pool. Keep the matching private key on your device.</p>
            <span v-if="pool.specs.length && !selectedKeyPair" class="error-text">Select an SSH key pair to continue.</span>
          </div>
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
          <span class="dist-k" style="margin-top: 6px">Node Labels</span>
          <div style="flex: 1; display: flex; flex-direction: column; gap: var(--space-2); max-width: 560px">
            <div class="tagbox">
              <span v-for="l in pool.labels" :key="l" class="ar-tag mono">
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
            <div v-for="(t, i) in pool.taints" :key="i" class="dist-row" style="flex-wrap: nowrap; gap: var(--space-2)">
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
            <span v-if="pool.taints.length && !taintsOk" class="error-text">Taint keys must be lowercase (letters, digits, -, .). Value is optional.</span>
            <span v-else class="hint">Tainted nodes repel pods that do not tolerate the taint. Value is optional.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pool-card {
  border: 1px solid var(--st-neutral-t1-1-default);
  border-radius: var(--radius-lg, var(--radius-md));
  background: var(--bg-neutral-t1-1-default);
  overflow: hidden;
}
.pool-card.invalid { border-color: var(--bg-error-t1-1-default); }
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
  color: var(--fg-neutral-t1-3-default); font-size: 12px; line-height: 16px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pool-sub.err-sub { color: var(--fg-error-t1-1-default); }
.pool-badge {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  font-size: 12px; color: var(--fg-error-t1-1-default);
  background: var(--bg-error-t3-1-default);
  border-radius: var(--radius-circular); padding: 3px 10px;
}
.pool-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bg-error-t1-1-default); }
.pool-missing {
  display: flex; gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--bg-error-t3-1-default);
  border: 1px solid var(--bg-error-t1-1-default);
  border-radius: var(--radius-md);
  color: var(--fg-error-t1-1-default);
  font-size: 13px;
}
.pool-missing ul { margin: var(--space-2) 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; }
.pool-missing li { line-height: 20px; }
.pool-del {
  flex: none; display: inline-flex; align-items: center; gap: 4px;
  border: 0; background: none; cursor: pointer; font: inherit; font-size: 12.5px;
  color: var(--fg-neutral-t1-3-default);
  padding: 6px; border-radius: var(--radius-md);
}
.pool-del:hover { color: var(--fg-error-t1-1-default); background: var(--bg-error-t3-1-default); }
.pool-del.confirm { color: var(--fg-error-t1-1-default); background: var(--bg-error-t3-1-default); font-weight: 450; }
.pool-body {
  display: flex; flex-direction: column; gap: var(--space-5);
  padding: var(--space-2) var(--space-5) var(--space-6);
  border-top: 1px solid var(--st-neutral-t1-1-default);
}
.count-ctl {
  display: inline-flex; align-items: center; width: fit-content;
  border: 1px solid var(--st-neutral-t1-5-default); border-radius: var(--radius-md);
  background: var(--bg-neutral-t1-1-default); overflow: hidden;
}
.count-ctl.error-mode { border-color: var(--bg-error-t1-1-default); }
.count-ctl button {
  width: 34px; height: 36px; border: 0; background: none; cursor: pointer;
  font-size: 16px; color: var(--fg-neutral-t1-2-default);
}
.count-ctl button:hover:not(:disabled) { background: var(--bg-neutral-t1-4-default); color: var(--fg-neutral-t1-1-default); }
.count-ctl button:disabled { opacity: .4; cursor: not-allowed; }
.count-ctl input {
  width: 44px; height: 36px; text-align: center; border: 0; outline: 0;
  background: transparent; font: inherit; font-size: 13.5px; color: var(--fg-neutral-t1-1-default);
}
.spec-box {
  border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-6) var(--space-6);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.key-pair-panel {
  display: flex; flex-direction: column; gap: var(--space-3); min-width: 0;
  padding: var(--space-5); margin-top: var(--space-2);
  border: 1px solid var(--st-neutral-t1-1-default); border-radius: var(--radius-md);
}
.key-pair-panel > .ar-field-label { font-size: 12px; font-weight: 450; }
.key-pair-panel .scale-note { margin: 0; }
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
.flavor-table tbody tr.sold-out td { color: var(--fg-neutral-t1-3-default); }
</style>
