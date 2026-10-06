<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/* Multi-series SVG line/area chart with hover crosshair + tooltip (DO-style). */
const props = defineProps({
  title: String,
  unit: { type: String, default: '%' }, // '%' | 'kB/s' | '' (raw, 3 decimals)
  series: { type: Array, required: true }, // [{ label, color, points: number[] }]
  times: { type: Array, required: true }, // ms timestamps, one per point
})

const wrap = ref(null)
const width = ref(760)
let ro
onMounted(() => {
  ro = new ResizeObserver((entries) => {
    const w = entries[0].contentRect.width
    if (w > 100) width.value = w
  })
  ro.observe(wrap.value)
})
onBeforeUnmount(() => ro?.disconnect())

const H = 230, PADL = 48, PADR = 14, PADT = 14, PADB = 28
const innerW = computed(() => Math.max(80, width.value - PADL - PADR))
const innerH = H - PADT - PADB
const n = computed(() => props.times.length)

const yMax = computed(() => {
  const raw = Math.max(...props.series.flatMap((s) => s.points), 0.001)
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  return Math.ceil(raw / (p / 2)) * (p / 2)
})

const x = (i) => PADL + (innerW.value * i) / (n.value - 1)
const y = (v) => PADT + innerH * (1 - v / yMax.value)

const linePath = (pts) => pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
const areaPath = (pts) =>
  `${linePath(pts)} L${x(n.value - 1).toFixed(1)} ${(PADT + innerH).toFixed(1)} L${PADL} ${(PADT + innerH).toFixed(1)} Z`

const gridlines = computed(() => [0, 1, 2, 3, 4].map((k) => (yMax.value * k) / 4))
const fmtAxis = (v) =>
  props.unit === '%' ? Math.round(v) + '%' : props.unit === 'kB/s' ? String(Math.round(v)) : v.toFixed(3)
const fmtVal = (v) =>
  props.unit === '%' ? v.toFixed(2) + '%' : props.unit === 'kB/s' ? v.toFixed(2) + ' kB/s' : v.toFixed(3)

/* x tick labels: HH:MM, ~8 of them */
const xTicks = computed(() => {
  const every = Math.max(1, Math.round(n.value / 8))
  const out = []
  for (let i = 0; i < n.value; i += every) out.push({ i, label: fmtClock(props.times[i]) })
  return out
})
const fmtClock = (t) => {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const fmtFull = (t) => {
  const d = new Date(t)
  const p = (x2) => String(x2).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/* hover */
const hoverIdx = ref(-1)
const tipFlip = ref(false)
function onMove(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const px = e.clientX - rect.left
  const idx = Math.round(((px - PADL) / innerW.value) * (n.value - 1))
  hoverIdx.value = Math.max(0, Math.min(n.value - 1, idx))
  tipFlip.value = x(hoverIdx.value) > width.value - 190
}
function onLeave() {
  hoverIdx.value = -1
}
const tipX = computed(() => x(hoverIdx.value) + (tipFlip.value ? -12 : 12))
</script>

<template>
  <div class="mon-chart" ref="wrap">
    <h3 class="mon-chart-title">{{ title }}</h3>
    <div class="mon-chart-body" style="position: relative" @mousemove="onMove" @mouseleave="onLeave">
      <svg :width="width" :height="H" class="mon-svg">
        <defs>
          <clipPath :id="'clip-' + (title || 'c').replace(/\W/g, '')">
            <rect :x="PADL" :y="PADT" :width="innerW" :height="innerH" />
          </clipPath>
        </defs>
        <!-- grid -->
        <g v-for="(gv, k) in gridlines" :key="'g' + k">
          <line :x1="PADL" :x2="PADL + innerW" :y1="y(gv)" :y2="y(gv)" class="grid-line" />
          <text :x="PADL - 8" :y="y(gv) + 3.5" class="axis-text end">{{ fmtAxis(gv) }}</text>
        </g>
        <!-- x tick labels -->
        <text v-for="t in xTicks" :key="'x' + t.i" :x="x(t.i)" :y="H - 8" class="axis-text mid">{{ t.label }}</text>
        <!-- series -->
        <g :clip-path="`url(#clip-${(title || 'c').replace(/\W/g, '')})`">
          <template v-for="s in series" :key="s.label">
            <path :d="areaPath(s.points)" :fill="s.color" fill-opacity="0.09" />
            <path :d="linePath(s.points)" fill="none" :stroke="s.color" stroke-width="1.6" />
          </template>
        </g>
        <!-- hover crosshair -->
        <g v-if="hoverIdx >= 0">
          <line :x1="x(hoverIdx)" :x2="x(hoverIdx)" :y1="PADT" :y2="PADT + innerH" class="cross-line" />
          <circle
            v-for="s in series"
            :key="'h' + s.label"
            :cx="x(hoverIdx)"
            :cy="y(s.points[hoverIdx])"
            r="3.4"
            :fill="s.color"
            stroke="#fff"
            stroke-width="1.4"
          />
        </g>
      </svg>
      <!-- tooltip -->
      <div
        v-if="hoverIdx >= 0"
        class="mon-tip"
        :class="{ flip: tipFlip }"
        :style="{ left: tipX + 'px', top: '18px' }"
      >
        <div class="mon-tip-time">{{ fmtFull(times[hoverIdx]) }}</div>
        <div v-for="s in series" :key="'t' + s.label" class="mon-tip-row">
          <span class="dot" :style="{ background: s.color }"></span>
          {{ s.label }}: <strong>{{ fmtVal(s.points[hoverIdx]) }}</strong>
        </div>
      </div>
    </div>
    <!-- legend -->
    <div class="mon-legend">
      <span v-for="s in series" :key="'l' + s.label" class="mon-legend-item">
        <span class="dash" :style="{ background: s.color }"></span>{{ s.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.mon-chart-title { margin: 0 0 var(--space-2); font-size: 13px; font-weight: 600; color: var(--fg-neutral-t1-1-default); }
.mon-svg { display: block; max-width: 100%; }
.grid-line { stroke: var(--st-neutral-t1-2-default); stroke-width: 1; }
.axis-text { font-size: 10.5px; fill: var(--fg-neutral-t1-3-default); font-family: inherit; }
.axis-text.end { text-anchor: end; }
.axis-text.mid { text-anchor: middle; }
.cross-line { stroke: var(--st-neutral-t1-5-default); stroke-width: 1; stroke-dasharray: 3 3; }
.mon-legend { display: flex; justify-content: center; gap: var(--space-4); margin-top: var(--space-2); }
.mon-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--fg-neutral-t1-2-default); }
.mon-legend-item .dash { width: 14px; height: 2px; border-radius: 1px; }
.mon-tip {
  position: absolute; z-index: 5; pointer-events: none; min-width: 150px;
  background: rgba(16, 24, 40, 0.92); color: #fff; border-radius: 8px; padding: 8px 10px;
  font-size: 11px; line-height: 1.7; box-shadow: 0 8px 20px -6px rgba(16, 24, 40, 0.4);
}
.mon-tip.flip { transform: translateX(-100%); }
.mon-tip-time { color: rgba(255, 255, 255, 0.75); margin-bottom: 2px; }
.mon-tip-row { display: flex; align-items: center; gap: 6px; }
.mon-tip-row .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
</style>
