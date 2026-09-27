<script setup>
import TopBar from './components/TopBar.vue'
import SideBar from './components/SideBar.vue'
import Toaster from './components/ui/Toaster.vue'
</script>

<template>
  <div class="shell">
    <SideBar />
    <div class="content">
      <TopBar />
      <router-view />
    </div>
  </div>
  <Toaster />
</template>
