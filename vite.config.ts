import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { VitePWA } from 'vite-plugin-pwa'
import { communityDevApi } from './server/vitePlugin'

// https://vite.dev/config/
export default defineConfig({
  // a port of its own: other GLIX apps' dev servers sit on Vite's default 5173
  server: { port: 5180, strictPort: true },
  // the WebP worker loads libwebp's WASM through dynamic imports, which need module workers
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@jsquash/webp'] },
  plugins: [
    // the community API on /api and /media, as the Worker serves it in production
    communityDevApi(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png'],
      workbox: {
        // API calls and uploaded media are never answered with the app shell
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
      },
      manifest: {
        name: 'GLIX Encoder',
        short_name: 'GLIX',
        description: 'Glitch Image Codec',
        theme_color: '#f4efe4',
        background_color: '#f4efe4',
        icons: [
          {
            src: 'favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'favicon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
