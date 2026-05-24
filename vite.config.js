import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',

      // Extra files to include in the precache (not auto-detected by glob)
      includeAssets: ['icon.svg', 'apple-touch-icon-180x180.png'],

      workbox: {
        // Pre-cache the full app shell
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],

        runtimeCaching: [
          {
            // Kartverket WMTS tiles — cache-first so the map works offline.
            // crossOrigin: 'anonymous' on the Leaflet layer ensures the SW
            // receives CORS-enabled (non-opaque) status-200 responses.
            urlPattern: /^https:\/\/cache\.kartverket\.no\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'kartverket-tiles-v1',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },

      manifest: {
        name: 'Artsfunn',
        short_name: 'Artsfunn',
        description: 'Registrer og eksporter artsobservasjoner i felt',
        lang: 'nb',
        theme_color: '#2d7d46',
        background_color: '#f7f9f7',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      // Keep the service worker disabled in dev to avoid stale-cache confusion.
      // Run `npm run build && npm run preview` to test the full PWA locally.
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
