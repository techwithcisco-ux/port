import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
    resolve: {
      alias: {
        '@branchport/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
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
