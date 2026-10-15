import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/leaflet')) {
            return 'map-vendor';
          }
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/socket.io-client')) {
            return 'ui-vendor';
          }
        },
      },
    },
  },
})

