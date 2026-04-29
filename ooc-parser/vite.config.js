import { defineConfig } from 'vite'

export default defineConfig({
  base: './',   // 🔥 THIS fixes wrong asset paths
})
