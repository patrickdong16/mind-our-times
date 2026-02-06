import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        vote: resolve(__dirname, 'vote.html'),
        stats: resolve(__dirname, 'stats.html')
      }
    }
  },
  server: {
    port: 3000
  }
})
