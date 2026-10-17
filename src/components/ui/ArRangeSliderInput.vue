<script setup>
import { computed, ref, watch } from 'vue'
import ArButton from './ArButton.vue'

/*
 * Number stepper control, mirroring the real panel's ecc RangeSliderInput
 * (v2:ar-rangeSliderInput): minus button, centered number input, plus button.
 * The value clamps to [min, max] on blur/Enter and the buttons disable at
 * the bounds, exactly like the panel component.
 */
const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, required: true },
  step: { type: Number, default: 1 },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])

const model = ref(props.modelValue)
watch(() => props.modelValue, (val) => { model.value = val })

function onUpdateModel() {
  const value = +model.value
  if (typeof props.min === 'number' && value < props.min) {
    model.value = props.min
  } else if (typeof props.max === 'number' && value > props.max) {
    model.value = props.max
  }
  emit('update:modelValue', +model.value)
}

const minimumDisabled = computed(() => model.value - props.step < props.min)
const maximumDisabled = computed(() => model.value + props.step > props.max)

function onClickPlus() {
  model.value = props.modelValue + props.step
  onUpdateModel()
}
function onClickMinus() {
  model.value = props.modelValue - props.step
  onUpdateModel()
}
</script>

<template>
  <div
    class="ar-range-slider-input"
    :class="{ disabled }"
  >
    <div class="ctl-btn">
      <ArButton
        variant="ghost"
        size="sm"
        icon="minus"
        :disabled="disabled || minimumDisabled"
        aria-label="Decrease"
        @click="onClickMinus"
      />
    </div>
    <input
      v-model="model"
      class="ctl-input"
      type="number"
      :disabled="disabled"
      @blur="onUpdateModel"
      @keyup.enter="onUpdateModel"
    >
    <div class="ctl-btn">
      <ArButton
        variant="ghost"
        size="sm"
        icon="plus"
        :disabled="disabled || maximumDisabled"
        aria-label="Increase"
        @click="onClickPlus"
      />
    </div>
  </div>
</template>

<style scoped>
/* mirrors the panel's v2:ar-rangeSliderInput styles */
.ar-range-slider-input {
  display: inline-flex;
  align-items: center;
  height: 40px;
  background-color: var(--bg-neutral-t1-1-default);
  border: 1px solid var(--st-neutral-t1-2-disabled);
  border-radius: var(--radius-md);
}
.ar-range-slider-input:focus-within {
  border: 1px solid var(--st-neutral-t1-2-disabled);
  box-shadow: var(--shadow-md);
}
.ar-range-slider-input.disabled {
  background: var(--bg-neutral-t1-4-default);
}
.ctl-input {
  margin: 0 var(--space-2);
  width: 100%;
  text-align: center;
  border: none;
  -moz-appearance: textfield;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: -0.24px;
  font-weight: 325;
  font-variant-numeric: tabular-nums;
  color: var(--fg-neutral-t1-2-default);
  background-color: transparent;
}
/* hide the number spinners — the side buttons do the stepping */
.ctl-input::-webkit-outer-spin-button,
.ctl-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.ctl-input:focus {
  color: var(--fg-neutral-t1-2-default);
  outline: none;
}
.ctl-input:disabled {
  color: var(--fg-neutral-t1-2-disabled);
}
.ctl-btn {
  padding-inline: var(--space-1);
  display: flex;
  align-items: center;
}
</style>
