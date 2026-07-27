import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Proxy target: override with VITE_API_PROXY env var for local dev (e.g. http://localhost:8000)
const API_PROXY_TARGET = process.env.VITE_API_PROXY || 'http://backend:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
})
