<script setup>
const model = defineModel({ type: Boolean })
defineProps({ disabled: Boolean })
</script>

<template>
  <label class="ar-toggle">
    <input type="checkbox" v-model="model" :disabled="disabled" />
    <span class="track"></span>
    <span class="thumb"></span>
  </label>
</template>
