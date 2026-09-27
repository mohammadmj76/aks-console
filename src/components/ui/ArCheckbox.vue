<script setup>
const model = defineModel({ type: Boolean })
</script>

<template>
  <span class="ar-checkbox">
    <input type="checkbox" v-model="model" />
    <span class="box">
      <svg class="check" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3.5 8.5 3 3 6-7"/></svg>
    </span>
  </span>
</template>
