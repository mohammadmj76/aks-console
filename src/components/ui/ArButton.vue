<script setup>
defineProps({
  variant: { type: String, default: 'secondary' }, // primary | secondary | tertiary | ghost | danger
  size: { type: String, default: 'md' },           // md | sm
  icon: Boolean,
  loading: Boolean,
  disabled: Boolean,
  type: { type: String, default: 'button' },
})
</script>

<template>
  <button
    :type="type"
    class="ar-btn"
    :class="[variant, { sm: size === 'sm', icon, loading }]"
    :disabled="disabled || loading"
  >
    <span class="spinner" />
    <slot />
  </button>
</template>
