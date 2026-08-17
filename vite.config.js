import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Control Remoto Clientes',
        short_name: 'Clientes',
        description: 'Control remoto de la planilla de clientes',
        theme_color: '#2563eb',
        background_color: '#f5f5f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          // TODO: reemplazar por íconos reales (192x192 y 512x512) antes
          // de publicar. Sin esto la app igual funciona e instala, pero
          // con un ícono genérico.
        ],
      },
    }),
  ],
})
