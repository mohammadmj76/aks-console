<script setup>
import { store } from '../../store'
</script>

<template>
  <Teleport to="body">
    <div class="toast-host">
      <div v-for="t in store.toasts" :key="t.id" class="toast" :class="[t.type, { open: t.open }]" role="status">
        <span class="t-icon">
          <svg v-if="t.type === 'success'" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3.5 8.5 3 3 6-7"/></svg>
          <svg v-else width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.4M8 5.2v.2"/></svg>
        </span>
        <div style="flex: 1">
          <div class="text-body-2-strong">{{ t.title }}</div>
          <div class="text-body-2 muted">{{ t.msg }}</div>
        </div>
        <button class="ar-btn ghost icon sm" aria-label="Dismiss" @click="store.dismiss(t.id)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 4 8 8M12 4l-8 8"/></svg>
        </button>
      </div>
    </div>
  </Teleport>
</template>
