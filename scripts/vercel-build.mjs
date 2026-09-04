// Vercel single-project build (Build Output API v3).
//
// One Vercel deployment serves TWO apps from one domain:
//   /     → apps/dashboard  (management dashboard)
//   /pos/ → apps/pos        (branch POS, built with base '/pos/')
//
// Market Analytics is deployed as a SEPARATE Vercel project.
// See apps/market/vercel.json for its config.

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, '.vercel', 'output');

console.log('▶ Cleaning .vercel/output');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'static'), { recursive: true });

console.log('▶ Building dashboard (npm run build:dashboard)');
execSync('npm run build:dashboard', { cwd: root, stdio: 'inherit' });

console.log('▶ Building POS (npm run build:pos)');
execSync('npm run build:pos', { cwd: root, stdio: 'inherit' });

console.log('▶ Copying dashboard dist → static/');
cpSync(join(root, 'apps', 'dashboard', 'dist'), join(out, 'static'), { recursive: true });

console.log('▶ Copying POS dist → static/pos/');
cpSync(join(root, 'apps', 'pos', 'dist'), join(out, 'static', 'pos'), { recursive: true });

writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Serve real files first (assets, manifest, sw.js…), then the
        // two SPA fallbacks.
        { handle: 'filesystem' },
        { src: '^/pos(?:/.*)?$', dest: '/pos/index.html' },
        { src: '^/.*$', dest: '/index.html' },
      ],
    },
    null,
    2
  )
);

console.log('✅ Build Output API files written to .vercel/output');
