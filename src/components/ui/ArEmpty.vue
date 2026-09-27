<script setup>
defineProps({ title: String, desc: String })
</script>

<template>
  <div class="ar-empty">
    <div class="glyph">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
        <path d="M8 1.8 14 5v6L8 14.2 2 11V5l6-3.2Z" />
        <path d="M2 5l6 3.2L14 5M8 8.2v6" />
      </svg>
    </div>
    <h3 class="text-title-3" style="margin: 0">{{ title }}</h3>
    <p class="text-body-2 muted" style="margin: 0; max-width: 44ch">{{ desc }}</p>
    <div style="margin-top: var(--space-2)"><slot /></div>
  </div>
</template>
