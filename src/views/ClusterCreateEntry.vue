<script setup>
/* A/B dispatcher for /clusters/create — ?flow=stepper renders the two-step variant. */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ClusterCreate from './ClusterCreate.vue'
import ClusterCreateStepper from './ClusterCreateStepper.vue'

const route = useRoute()
const isStepper = computed(() => route.query.flow === 'stepper')
</script>

<template>
  <ClusterCreateStepper v-if="isStepper" />
  <ClusterCreate v-else />
</template>
