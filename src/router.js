import { createRouter, createWebHistory } from 'vue-router'
import ClusterList from './views/ClusterList.vue'
import ClusterCreate from './views/ClusterCreate.vue'
import ClusterDetails from './views/ClusterDetails.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/clusters' },
    { path: '/clusters', name: 'clusters', component: ClusterList },
    { path: '/clusters/create', name: 'cluster-create', component: ClusterCreate },
    { path: '/clusters/:id', name: 'cluster-details', component: ClusterDetails },
    { path: '/:pathMatch(.*)*', redirect: '/clusters' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})
