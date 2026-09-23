import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { zooPwa } from './scripts/pwa-config'
export default defineConfig({ base: './', plugins: [react(), zooPwa()], build: { rollupOptions: { output: { manualChunks: { map: ['leaflet'], validation: ['zod'] } } } } })
