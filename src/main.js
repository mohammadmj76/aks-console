import { createApp } from 'vue'
import App from './App.vue'
import { installUIKit } from './uikit'
import { router } from './router'
import { tippy } from './directives/tippy'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/shell.css'

const app = createApp(App).use(router).directive('tippy', tippy)
installUIKit(app)
app.mount('#app')
