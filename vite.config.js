import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // lo servimos desde public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        runtimeCaching: [
          // Las lecturas REST NO se cachean: el SW servía listados viejos que
          // incluían filas ya borradas, resucitándolas tras un delete. El
          // soporte offline lo da IndexedDB, no el cache del SW.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|auth)\/.*/,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
});
