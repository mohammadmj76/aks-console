<script setup>
import ArIcon from './ArIcon.vue'

/*
 * icon prop follows the real ArButton: a string icon name renders an
 * icon-only button; prependIcon/appendIcon render icons around the text.
 */
defineProps({
  variant: { type: String, default: 'secondary' }, // primary | secondary | tertiary | ghost | danger
  size: { type: String, default: 'md' },           // md | sm
  icon: { type: String, default: '' },
  prependIcon: { type: String, default: '' },
  appendIcon: { type: String, default: '' },
  loading: Boolean,
  disabled: Boolean,
  type: { type: String, default: 'button' },
})
</script>

<template>
  <button
    :type="type"
    class="ar-btn"
    :class="[variant, { sm: size === 'sm', icon: Boolean(icon), loading }]"
    :disabled="disabled || loading"
  >
    <span class="spinner" />
    <ArIcon
      v-if="icon"
      :name="icon"
      size="sm"
    />
    <template v-if="!icon">
      <ArIcon
        v-if="prependIcon"
        :name="prependIcon"
        size="sm"
        class="btn-prepend"
      />
      <slot />
      <ArIcon
        v-if="appendIcon"
        :name="appendIcon"
        size="sm"
        class="btn-append"
      />
    </template>
  </button>
</template>

<style scoped>
.btn-prepend { margin-inline-end: var(--space-2); }
.btn-append { margin-inline-start: var(--space-2); }
</style>
