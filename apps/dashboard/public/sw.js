// BranchPort PWA Service Worker
// Caches the app shell for offline support. Data always comes from Supabase (live).

const CACHE_NAME = 'branchport-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback for navigation/ASSETS
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET, skip Supabase API calls (always live)
  if (request.method !== 'GET') return;
  if (request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, serve the cached index.html
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
