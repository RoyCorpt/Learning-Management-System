import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

type SWMessageEvent = Event & {
  data?: { type?: string };
};

type SWExtendableEvent = Event & {
  waitUntil: (promise: Promise<unknown>) => void;
};

type ServiceWorkerScopeLike = {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  skipWaiting: () => Promise<void>;
  clients: { claim: () => Promise<void> };
  addEventListener: {
    (type: 'message', listener: (event: SWMessageEvent) => void): void;
    (type: 'activate', listener: (event: SWExtendableEvent) => void): void;
    (type: 'install', listener: (event: SWExtendableEvent) => void): void;
  };
};

const sw = self as unknown as ServiceWorkerScopeLike;

// Precache Vite-built static assets (JS, CSS, KaTeX fonts, logos, icons)
precacheAndRoute((self as unknown as ServiceWorkerScopeLike).__WB_MANIFEST ?? []);
cleanupOutdatedCaches();

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void sw.skipWaiting();
  }
});

// NEVER cache API calls, auth routes, health probes, or password reset links
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/health' ||
    url.pathname === '/ready' ||
    url.searchParams.has('resetToken'),
  new NetworkOnly(),
);

// Static images (logos, hero backgrounds, PWA icons)
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' ||
    url.pathname.startsWith('/assets/') ||
    /\.(?:png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: 'sintaks-static-images-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// Scripts, stylesheets, and bundled KaTeX fonts
registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'worker',
  new StaleWhileRevalidate({
    cacheName: 'sintaks-static-assets-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 14 * 24 * 60 * 60 }),
    ],
  }),
);

// Google Fonts stylesheets & font files
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'sintaks-google-fonts-css-v1',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'sintaks-google-fonts-webfonts-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
);

// Navigation shell: try network first for fresh HTML, fallback to cached shell if offline
const navigationStrategy = new NetworkFirst({
  cacheName: 'sintaks-html-shell-v1',
  networkTimeoutSeconds: 4,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
});

registerRoute(
  new NavigationRoute(
    async (params) => {
      try {
        const response = await navigationStrategy.handle(params);
        if (response) return response;
      } catch {
        // Offline fallback below
      }
      const cachedIndex = await matchPrecache('/index.html');
      return (
        cachedIndex ??
        new Response(
          '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>SINTAKS (Luring)</title></head><body style="font-family:sans-serif;padding:2rem;background:#f7f5f0;color:#17211c;"><h1>Koneksi Terputus</h1><p>Anda sedang luring. Periksa koneksi internet lalu muat ulang halaman untuk melanjutkan aktivitas kelas di SINTAKS.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
      );
    },
    {
      denylist: [/^\/api\//, /^\/auth\//, /^\/health$/, /^\/ready$/],
    },
  ),
);
