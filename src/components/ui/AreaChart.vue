<script setup>
import { computed } from 'vue'

const props = defineProps({
  series: { type: Array, required: true }, // [{ label, values: number[], color }]
  labels: { type: Array, required: true },
  max: { type: Number, default: 100 },
})

const W = 560, H = 210, padL = 30, padB = 22, padT = 10

function y(v) {
  return padT + (1 - v / props.max) * (H - padT - padB)
}

const paths = computed(() =>
  props.series.map((s) => {
    const stepX = (W - padL - 10) / (s.values.length - 1)
    const pts = s.values.map((v, i) => [padL + i * stepX, y(v)])
    const d = pts.map((p, i) => (i ? `L${p[0].toFixed(1)},${p[1].toFixed(1)}` : `M${p[0]},${p[1]}`)).join(' ')
    const area = `${d} L${pts[pts.length - 1][0]},${H - padB} L${padL},${H - padB} Z`
    return { d, area, color: s.color }
  })
)

const grid = [0, 25, 50, 75, 100].map((gv) => ({ gv, y: y((gv / 100) * props.max) }))
const xlabels = computed(() => {
  const every = Math.ceil(props.labels.length / 7)
  const stepX = (W - padL - 10) / (props.labels.length - 1)
  return props.labels
    .map((l, i) => (i % every === 0 ? { x: padL + i * stepX, l } : null))
    .filter(Boolean)
})
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" style="display: block; width: 100%" role="img" aria-label="Usage chart">
    <defs>
      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--bg-primary-t1-1-default)" stop-opacity=".16" />
        <stop offset="1" stop-color="var(--bg-primary-t1-1-default)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <g v-for="g in grid" :key="g.gv">
      <line :x1="padL" :x2="W - 10" :y1="g.y" :y2="g.y" stroke="var(--st-neutral-t1-1-default)" stroke-width="1" />
      <text :x="padL - 6" :y="g.y + 3" text-anchor="end" font-size="9" fill="var(--fg-neutral-t1-3-default)">{{ g.gv }}{{ max === 100 ? '%' : '' }}</text>
    </g>
    <text v-for="(xl, i) in xlabels" :key="i" :x="xl.x" :y="H - 6" text-anchor="middle" font-size="9" fill="var(--fg-neutral-t1-3-default)">{{ xl.l }}</text>
    <template v-for="(p, i) in paths" :key="i">
      <path v-if="i === 0" :d="p.area" fill="url(#areaFill)" />
      <path :d="p.d" fill="none" :stroke="p.color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </template>
  </svg>
</template>
