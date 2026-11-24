import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPublicDir = path.resolve(__dirname, '../../public');

export default defineConfig({
  publicDir: rootPublicDir,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
      includeAssets: [
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
        'assets/Logo_Website_SINTAKS_fix_07745e85.png',
      ],
      manifest: {
        id: '/',
        name: 'SINTAKS: Portal Pembelajaran',
        short_name: 'SINTAKS',
        description:
          'SINTAKS, portal pembelajaran kampus untuk materi, tugas, kuis daring, diskusi, dan rekap nilai.',
        theme_color: '#277954',
        background_color: '#f7f5f0',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'id',
        categories: ['education'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,woff,woff2}'],
      },
    }),
  ],
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
});
