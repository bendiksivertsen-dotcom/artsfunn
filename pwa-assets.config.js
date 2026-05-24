import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  // minimal2023Preset generates:
  //   pwa-64x64.png, pwa-192x192.png, pwa-512x512.png,
  //   maskable-icon-512x512.png, apple-touch-icon-180x180.png
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      // Add a little padding so the pin stays inside the safe zone on crop
      padding: 0.15,
    },
  },
  images: ['public/icon.svg'],
});
