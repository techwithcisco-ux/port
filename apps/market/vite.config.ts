import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Default: served under /market/ when combined with the dashboard in a
  // single Vercel deployment. Override at build time with VITE_BASE=/ when
  // deploying the market app as its own standalone site (Render).
  const base = process.env.VITE_BASE || (mode === 'production' ? '/market/' : '/');
  return {
    base,
    plugins: [react()],
    server: {
      port: 5175,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
