<script setup>
import { computed, ref, watch } from 'vue'
import { useClassName } from '../../composables/className'
import ArIcon from './ArIcon.vue'

/*
 * Prototype stand-in for @panel/uikit ArStepper.
 * Same API: steps as strings or [{key, title, disabled, icon}], v-model
 * (number index or step key), clickable + disabled per step, and
 * step-<key> content slots.
 */
const props = defineProps({
    modelValue: { type: [String, Number], default: null },
    defaultValue: { type: [String, Number], default: 0 },
    steps: { type: Array, required: true },
    clickable: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const { blockClassName, className } = useClassName('ArStepper')

function findStepIndex(key) {
    if (typeof key === 'number' || Number.isFinite(parseFloat(key))) return Number(key)
    return props.steps.findIndex((step) => step.key === key)
}
const internalIndex = ref(
    props.modelValue !== null ? findStepIndex(props.modelValue) : findStepIndex(props.defaultValue)
)

const index = computed({
    get() {
        return props.modelValue !== null ? findStepIndex(props.modelValue) : internalIndex.value
    },
    set(newIndex) {
        internalIndex.value = newIndex
        emit('update:modelValue', props.steps[newIndex]?.key ?? newIndex)
    },
})

function stepIsActive(i) {
    return i === index.value
}
function stepIsPassed(i) {
    return i < index.value
}
function stepIsDisabled(i) {
    const step = props.steps[i]
    return typeof step === 'object' && 'disabled' in step && step.disabled
}
function stepStatus(i) {
    if (stepIsPassed(i) && stepIsDisabled(i)) return 'passed-disabled'
    if (stepIsDisabled(i)) return 'disabled'
    if (stepIsPassed(i)) return 'passed'
    if (stepIsActive(i)) return 'active'
    return 'default'
}
function stepNeedsIcon(i) {
    return stepIsPassed(i)
}
function stepTitle(i) {
    const step = props.steps[i]
    if (typeof step === 'string') return step
    return step.title || step.key
}
function stepKey(i) {
    const step = props.steps[i]
    return typeof step === 'object' && step.key ? step.key : i
}
function goTo(i) {
    if (!props.clickable || stepIsDisabled(i)) return
    index.value = i
}
watch(index, () => window.scrollTo({ top: 0 }))

const currentStepKey = computed(() => stepKey(index.value))
</script>

<template>
    <div
        :class="blockClassName"
        dir="ltr"
    >
        <ul :class="className('list')">
            <li
                v-for="(_, i) in steps"
                :key="i"
                :class="className('headerItem', [clickable && 'clickable', stepStatus(i)])"
                @click="goTo(i)"
            >
                <div :class="className('headerItemTop')">
                    <div :class="className('headerItemLine', [i <= 0 && 'transparent', stepIsPassed(i) && 'passed'])" />
                    <button
                        type="button"
                        :class="className('headerItemCircle', [clickable && 'clickable', stepStatus(i)])"
                        :tabindex="clickable && !stepIsDisabled(i) ? 0 : -1"
                        :disabled="stepIsDisabled(i)"
                        @keydown.enter.space.prevent="goTo(i)"
                        @click.stop="goTo(i)"
                    >
                        <ArIcon
                            v-if="stepNeedsIcon(i)"
                            name="check-circle"
                            size="sm"
                            :class="className('headerItemIcon')"
                        />
                        <span
                            v-else
                            :class="className('headerItemNumber')"
                        >{{ i + 1 }}</span>
                    </button>
                    <div :class="className('headerItemLine', [i >= steps.length - 1 && 'transparent', i < index && 'passed'])" />
                </div>
                <div
                    :class="className('headerItemTitle', stepStatus(i))"
                    :title="stepTitle(i)"
                >
                    {{ stepTitle(i) }}
                </div>
            </li>
        </ul>
        <div
            :key="index"
            :class="className('content')"
        >
            <slot :name="`step-${currentStepKey}`" />
        </div>
    </div>
</template>

<style scoped>
.ArStepper {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}
.ArStepper__list {
    display: flex;
    align-items: center;
    min-width: 100%;
    list-style: none;
    padding: 0;
    margin: 0;
}
.ArStepper__headerItem {
    flex: 1;
    min-width: 56px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-1);
}
.ArStepper__headerItem--clickable {
    cursor: pointer;
}
.ArStepper__headerItem--disabled,
.ArStepper__headerItem--passed-disabled {
    cursor: not-allowed;
    opacity: 0.55;
}
.ArStepper__headerItemTop {
    display: flex;
    align-items: center;
}
.ArStepper__headerItemLine {
    flex: 1;
    height: 1.5px;
    background: var(--st-neutral-t1-5-default);
}
.ArStepper__headerItemLine--transparent {
    background: transparent;
}
.ArStepper__headerItemLine--passed {
    background: var(--bg-primary-t3-1-default);
}
.ArStepper__headerItemCircle {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1.5px solid var(--st-neutral-t1-5-default);
    border-radius: var(--radius-circular);
    background: var(--bg-neutral-t1-1-default);
    font: inherit;
    font-size: 12px;
    font-weight: 450;
    line-height: 16px;
    letter-spacing: -0.24px;
    color: var(--fg-neutral-t1-3-default);
    cursor: default;
}
.ArStepper__headerItemCircle--clickable {
    cursor: pointer;
}
.ArStepper__headerItemCircle:disabled {
    cursor: not-allowed;
}
.ArStepper__headerItemCircle--active {
    border-color: var(--st-primary-t1-1-default);
    background: var(--bg-primary-t3-1-default);
    color: #fff;
}
.ArStepper__headerItemCircle--passed {
    border-color: var(--st-primary-t1-1-default);
    color: var(--fg-primary-t1-1-default);
}
.ArStepper__headerItemCircle--passed-disabled {
    border-color: var(--st-neutral-t1-5-default);
}
.ArStepper__headerItemIcon {
    flex: none;
}
.ArStepper__headerItemTitle {
    text-align: center;
    font-size: 12px;
    font-weight: 325;
    line-height: 16px;
    letter-spacing: -0.24px;
    color: var(--fg-neutral-t1-2-default);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ArStepper__headerItemTitle--active {
    color: var(--fg-neutral-t1-1-default);
    font-weight: 450;
}
.ArStepper__content {
    min-width: 0;
}
</style>
