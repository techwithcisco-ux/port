import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Default: served under /shop/ when combined in a single deployment.
  // Override at build time with VITE_BASE=/ when deploying the shop as
  // its own standalone site (Render).
  const base = process.env.VITE_BASE || (mode === 'production' ? '/shop/' : '/');
  return {
    base,
    plugins: [react()],
    server: {
      port: 5176,
    },
    resolve: {
      alias: {
        '@branchport/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
  };
});
