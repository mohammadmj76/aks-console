<script setup>
import { store } from '../store'

const groups = [
  {
    title: 'General',
    items: [{ label: 'Dashboard', icon: 'grid' }],
  },
  {
    title: 'Compute',
    items: [{ label: 'Instances', icon: 'vm' }, { label: 'Images', icon: 'disc' }],
  },
  {
    title: 'Containers',
    items: [{ label: 'Kubernetes', icon: 'k8s', active: true, count: () => store.clusters.length }],
  },
  {
    title: 'Network',
    items: [{ label: 'VPC', icon: 'net' }, { label: 'Elastic IP', icon: 'ip' }, { label: 'NAT Gateway', icon: 'nat' }, { label: 'Load Balancer', icon: 'lb' }],
  },
  {
    title: 'Storage',
    items: [{ label: 'Block Storage', icon: 'disc' }, { label: 'Object Storage', icon: 'bucket' }],
  },
  {
    title: 'Observability',
    items: [{ label: 'Monitoring', icon: 'chart' }, { label: 'Cloud Logs', icon: 'log' }],
  },
]
</script>

<template>
  <aside class="sidebar">
    <div v-for="g in groups" :key="g.title" class="side-group">
      <div class="g-title">{{ g.title }}</div>
      <a
        v-for="item in g.items"
        :key="item.label"
        class="side-item"
        :class="{ active: item.active }"
        href="#"
        @click.prevent
      >
        <span class="ico" aria-hidden="true">
          <!-- tiny inline icon set -->
          <svg v-if="item.icon === 'grid'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
          <svg v-else-if="item.icon === 'vm'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="8" rx="1.5"/><path d="M5.5 14h5M8 11v3"/></svg>
          <svg v-else-if="item.icon === 'k8s'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 1.8 14 5v6L8 14.2 2 11V5l6-3.2Z"/><circle cx="8" cy="8" r="2"/></svg>
          <svg v-else-if="item.icon === 'net'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-3.5 3.5-3.5 8.5 0 12M8 2c3.5 3.5 3.5 8.5 0 12"/></svg>
          <svg v-else-if="item.icon === 'ip'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9.5 2.5h4v4M13.5 2.5 8 8M6.5 13.5h-4v-4M2.5 13.5 8 8"/></svg>
          <svg v-else-if="item.icon === 'nat'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 6h9a3 3 0 1 1 0 6H8"/><path d="m4.5 3.5 3 2.5-3 2.5"/></svg>
          <svg v-else-if="item.icon === 'lb'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="3" r="1.6"/><circle cx="3" cy="12" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="13" cy="12" r="1.6"/><path d="M8 5v3M8 8 3.6 10.7M8 8l4.4 2.7"/></svg>
          <svg v-else-if="item.icon === 'disc'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><ellipse cx="8" cy="4" rx="5.5" ry="2.2"/><path d="M2.5 4v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4M2.5 8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2"/></svg>
          <svg v-else-if="item.icon === 'bucket'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.5 3h11l-1 10.5h-9L2.5 3Z"/><path d="M5.5 6.5v4M8 6.5v4M10.5 6.5v4"/></svg>
          <svg v-else-if="item.icon === 'chart'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.5 2v11.5H14"/><path d="m4.5 10 2.5-3 2.5 2 3.5-4.5"/></svg>
          <svg v-else-if="item.icon === 'log'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/></svg>
        </span>
        {{ item.label }}
        <span v-if="item.count" class="sub-count">{{ item.count() }}</span>
      </a>
    </div>
  </aside>
</template>
