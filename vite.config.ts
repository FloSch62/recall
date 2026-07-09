import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // served from https://<user>.github.io/recall/
  base: '/recall/',
  plugins: [react()],
})
