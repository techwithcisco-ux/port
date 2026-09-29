import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// PWA config makes the POS installable on a branch's Android phone via
// "Add to Home Screen" (requirements.txt Section 2.2) and precaches the
// app shell so it opens with no network at all. This does NOT by itself
// handle data sync — that's the Dexie queue in src/lib/db.ts and
// src/lib/sync.ts (requirements Section 5).
//
// The production build defaults to /pos/ (one Vercel project serving the
// dashboard at / and the POS at /pos/ — see scripts/vercel-build.mjs).
// Deploying the POS as its own standalone site (Render) overrides the base
// at build time with VITE_BASE=/ so it serves from the root. Local dev
// stays at the root of :5174 as before.
export default defineConfig(({ mode }) => {
  const base = process.env.VITE_BASE || (mode === 'production' ? '/pos/' : '/');
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'BranchPort POS',
          short_name: 'BranchPort',
          start_url: base,
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#111827',
          icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        },
        workbox: {
          // App shell precache only — data goes through the Dexie queue,
          // not through the service worker cache.
          globPatterns: ['**/*.{js,css,html}'],
        },
      }),
    ],
    server: {
      port: 5174,
    },
    resolve: {
      alias: {
        '@branchport/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
  };
});
