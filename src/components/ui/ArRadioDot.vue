<script setup>
const model = defineModel({ type: Boolean })
defineProps({ disabled: Boolean })
</script>

<template>
  <span class="ar-radio-dot" :class="{ disabled }">
    <input type="checkbox" v-model="model" :disabled="disabled" />
    <span class="ring"><span class="dot"></span></span>
  </span>
</template>

<style scoped>
.ar-radio-dot { position: relative; width: 18px; height: 18px; flex: none; display: inline-block; }
.ar-radio-dot input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.ar-radio-dot .ring {
  position: absolute; inset: 0; border-radius: 9999px;
  border: 1.5px solid var(--st-neutral-t1-2-default); background: var(--bg-neutral-t1-1-default);
  display: flex; align-items: center; justify-content: center; transition: border-color .15s;
  pointer-events: none;
}
.ar-radio-dot input:checked + .ring { border-color: var(--st-primary-t1-1-default); }
.ar-radio-dot .dot {
  width: 8px; height: 8px; border-radius: 9999px; background: var(--bg-primary-t3-1-default);
  transform: scale(0); transition: transform .15s;
}
.ar-radio-dot input:checked + .ring .dot { transform: scale(1); }
.ar-radio-dot.disabled { opacity: .45; }
.ar-radio-dot.disabled input { cursor: not-allowed; }
</style>
