import { createRouter, createWebHistory } from 'vue-router'
import ClusterList from './views/ClusterList.vue'
import ClusterCreateEntry from './views/ClusterCreateEntry.vue'
import ClusterDetails from './views/ClusterDetails.vue'
import ClusterDetailsV2 from './views/ClusterDetailsV2.vue'
import PoolDetails from './views/PoolDetails.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/clusters' },
    { path: '/clusters', name: 'clusters', component: ClusterList },
    { path: '/clusters/create', name: 'cluster-create', component: ClusterCreateEntry },
    { path: '/clusters/:id', name: 'cluster-details', component: ClusterDetails },
    /* A/B test: same cluster page reorganized around an Overview + left section
       nav (variant B). Reachable from the cluster list row menu. The section
       nav replaces the console chrome here (meta read in App.vue). */
    { path: '/clusters/:id/v2', name: 'cluster-details-v2', component: ClusterDetailsV2, meta: { bareChrome: true } },
    { path: '/clusters/:id/pools/:poolId', name: 'pool-details', component: PoolDetails },
    { path: '/:pathMatch(.*)*', redirect: '/clusters' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})
