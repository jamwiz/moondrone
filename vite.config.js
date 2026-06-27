import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Tone.js + drone engine ship as one bundle by design; not a packaging defect.
    chunkSizeWarningLimit: 800,
  },
})
