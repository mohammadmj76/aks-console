<script setup>
/* Small hover tooltip: an info icon that shows helper text on hover or focus. */
defineProps({ text: { type: String, required: true } })
</script>

<template>
  <span class="info-tip" tabindex="0" @click.stop>
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.2v3.4M8 5.2v.2" />
    </svg>
    <span class="info-tip-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.info-tip {
  position: relative; display: inline-flex; align-items: center;
  margin-left: 5px; color: var(--fg-neutral-t1-3-default); cursor: help; vertical-align: middle;
}
.info-tip:hover, .info-tip:focus, .info-tip:focus-within { color: var(--fg-neutral-t1-2-default); outline: none; }
.info-tip-bubble {
  position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%) translateY(2px);
  width: 264px; padding: 10px 12px; border-radius: var(--radius-md);
  /* no inverse token exists — reuse the darkest foreground token as the bubble fill */
  background: var(--fg-neutral-t1-1-default); color: var(--fg-neutral-t2-1-default);
  font-size: 12px; font-weight: 400; letter-spacing: normal; line-height: 1.55; text-align: left;
  white-space: normal; opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity .12s ease, transform .12s ease; z-index: 60;
  box-shadow: 0 4px 16px rgba(23, 27, 33, 0.18);
}
.info-tip:hover .info-tip-bubble,
.info-tip:focus .info-tip-bubble,
.info-tip:focus-within .info-tip-bubble { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
.info-tip-bubble::after {
  content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 6px solid transparent; border-top-color: var(--fg-neutral-t1-1-default);
}
</style>
