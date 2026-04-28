import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Exposes the server to the local network
    allowedHosts: ['https://aeration-cavalry-eloquence.ngrok-free.dev'] // Allows Ngrok URLs to connect without being dropped
  }
})
