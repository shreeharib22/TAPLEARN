
const CACHE_NAME = 'taplearn-app-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      const response = await fetch('/', { cache: 'reload' });

      if (response.ok) {
        await cache.put('/', response.clone());

        const html = await response.text();
        const matches = [
          ...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)
        ];

        const assets = matches
          .map(match => new URL(match[1], self.location.origin))
          .filter(url =>
            url.origin === self.location.origin &&
            !url.pathname.startsWith('/api/')
          );

        await Promise.all(assets.map(async url => {
          try {
            const assetResponse = await fetch(url.href);

            if (assetResponse.ok) {
              await cache.put(url.href, assetResponse);
            }
          } catch {
            // An optional asset may not be available.
          }
        }));
      }
    } catch (error) {
      console.error('TAPLEARN cache installation failed:', error);
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key.startsWith('taplearn-app-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }

        return response;
      } catch {
        return (
          await caches.match(request) ||
          await caches.match('/') ||
          new Response('TAPLEARN is offline. Please reconnect.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          })
        );
      }
    })());

    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);

    if (cached) return cached;

    try {
      const response = await fetch(request);

      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;
    } catch {
      return new Response('This resource is not available offline.', {
        status: 503
      });
    }
  })());
});
