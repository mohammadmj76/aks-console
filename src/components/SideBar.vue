<script setup>
import { store } from '../store'

const productNav = [
  { label: 'Kubernetes Cluster', active: true },
  { label: 'Servers' },
  { label: 'Network' },
  { label: 'Security' },
  { label: 'Disk Management' },
  { label: 'Reports' },
]
</script>

<template>
  <!-- far-left icon rail -->
  <nav class="icon-rail" aria-label="Console">
    <div class="mark">A</div>
    <div class="rail-gap"></div>
    <button class="rail-btn" aria-label="Apps">
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
    </button>
    <button class="rail-btn" aria-label="Instances">
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="8" rx="1.5"/><path d="M5.5 14h5M8 11v3"/></svg>
    </button>
    <button class="rail-btn" aria-label="Containers">
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 1.8 14 5v6L8 14.2 2 11V5l6-3.2Z"/><circle cx="8" cy="8" r="2"/></svg>
    </button>
    <button class="rail-btn" aria-label="Network">
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-3.5 3.5-3.5 8.5 0 12M8 2c3.5 3.5 3.5 8.5 0 12"/></svg>
    </button>
    <button class="rail-btn" aria-label="Storage">
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><ellipse cx="8" cy="4" rx="5.5" ry="2.2"/><path d="M2.5 4v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4M2.5 8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2"/></svg>
    </button>
    <button class="rail-btn" aria-label="Observability">
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.5 2v11.5H14"/><path d="m4.5 10 2.5-3 2.5 2 3.5-4.5"/></svg>
    </button>
    <div class="rail-spacer"></div>
    <button class="rail-btn" aria-label="Settings">
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4"/></svg>
    </button>
  </nav>

  <!-- product sidebar -->
  <aside class="sidebar">
    <div class="product-head">
      <span class="p-ico">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 1.8 14 5v6L8 14.2 2 11V5l6-3.2Z"/><path d="M2 5l6 3.2L14 5M8 8.2v6"/></svg>
      </span>
      <span>Container</span>
    </div>
    <div class="side-group">
      <a
        v-for="item in productNav"
        :key="item.label"
        class="side-item"
        :class="{ active: item.active }"
        href="#"
        @click.prevent
      >
        {{ item.label }}
        <svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>
      </a>
    </div>
    <div class="side-foot">
      <span class="text-caption-1 muted">{{ store.clusters.length }} clusters · ir-central-1</span>
    </div>
  </aside>
</template>
