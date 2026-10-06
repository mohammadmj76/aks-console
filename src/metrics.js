/* ============================================================
   Deterministic mock metric series for the Monitoring tab.
   Same key always yields the same curve — stable across re-renders.
   ============================================================ */

export function seedHash(s) {
  let h = 2166136261
  for (const c of s) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* noisy, lightly smoothed walk around `base` with optional spike bursts */
export function genPoints(key, { n = 40, base = 10, variance = 3, spikes = 0, spikeAmp = 10, min = 0 } = {}) {
  const rnd = mulberry32(seedHash(key))
  const raw = Array.from({ length: n }, () => base + (rnd() - 0.5) * 2 * variance)
  for (let s = 0; s < spikes; s++) {
    const at = Math.floor(rnd() * n)
    const amp = spikeAmp * (0.5 + rnd())
    for (let k = 0; k < 3; k++) if (at + k < n) raw[at + k] += amp * (1 - k / 3)
  }
  const out = raw.map((_, i) => {
    let sum = 0, cnt = 0
    for (let k = -2; k <= 0; k++) {
      const j = i + k
      if (j >= 0 && j < n) { sum += raw[j]; cnt++ }
    }
    return sum / cnt
  })
  return out.map((v) => Math.max(min, Math.round(v * 100) / 100))
}

/* timestamps spanning the last `hours` up to now */
export function genTimes(hours, n = 40) {
  const now = Date.now()
  const span = hours * 3600e3
  return Array.from({ length: n }, (_, i) => now - span + (span * i) / (n - 1))
}
