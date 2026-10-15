import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { tippy } from './directives/tippy'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/shell.css'

createApp(App).use(router).directive('tippy', tippy).mount('#app')
