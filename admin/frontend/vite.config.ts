import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8002,
    proxy: {
      '/admin': {
        target: 'http://localhost:8009',
        changeOrigin: true,
      },
    },
  },
})
