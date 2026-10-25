<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TopBar from './components/TopBar.vue'
import SideBar from './components/SideBar.vue'
import Toaster from './components/ui/Toaster.vue'

/* routes with meta.bareChrome drop the console chrome (icon rail + product
   sidebar) and bring their own section nav — cluster detail variant B */
const route = useRoute()
const bare = computed(() => !!route.meta.bareChrome)
</script>

<template>
  <div class="shell">
    <SideBar v-if="!bare" />
    <div class="content">
      <TopBar />
      <router-view />
    </div>
  </div>
  <Toaster />
</template>
