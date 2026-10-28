import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // UIKIT_PATH may point to an authorized local installation of the private package.
  // With the package installed normally, Vite uses normal package resolution.
  const { UIKIT_PATH } = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    resolve: {
      dedupe: ['vue', 'vue-router'],
      alias: UIKIT_PATH ? {
        '@panel/uikit/styles.css': resolve(UIKIT_PATH, 'styles.css'),
        '@panel/uikit': resolve(UIKIT_PATH, 'index.js'),
      } : {},
    },
    server: {
      port: 5175,
      strictPort: true,
      fs: UIKIT_PATH ? { allow: [process.cwd(), resolve(UIKIT_PATH)] } : undefined,
    },
  }
})
