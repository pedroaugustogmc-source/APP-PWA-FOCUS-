/* Focus · Treino — Service Worker
   - Precache do app shell (offline-first)
   - Runtime cache das fontes do Google (Oswald/Inter) para funcionar offline
   Bump CACHE_VERSION a cada alteração de assets para forçar atualização. */
const CACHE_VERSION = 'focus-v4';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const FONT_CACHE  = CACHE_VERSION + '-fonts';

// Caminhos RELATIVOS ao escopo (o site é servido em /app-pwa-focus-/)
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL_CACHE && k !== FONT_CACHE)
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fontes do Google → cache-first, guarda para uso offline.
  // Nunca resolve pra undefined: sem hit e sem rede, deixa a falha se propagar
  // (senão o navegador fica esperando pra sempre uma resposta que não vem).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(hit => {
          if (hit) return hit;
          return fetch(req).then(res => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Navegações → cache primeiro (abre instantâneo), atualiza em segundo plano.
  // A troca de versão do SW (CACHE_VERSION) já recarrega a página quando há
  // atualização de fato — então servir do cache aqui nunca deixa o app "preso"
  // numa versão velha, só evita esperar a rede toda vez que o app abre.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached => {
        if (cached) {
          // atualiza o cache em segundo plano; nunca deixa a rejeição escapar
          fetch(req).then(res => {
            if (res && res.status === 200) caches.open(SHELL_CACHE).then(c => c.put('./index.html', res.clone()));
          }).catch(() => {});
          return cached;
        }
        // nada em cache ainda (1ª visita offline) — só a rede pode responder
        return fetch(req);
      })
    );
    return;
  }

  // Mesma origem (assets) → cache-first com atualização em background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put(req, copy));
          }
          return res;
        });
      })
    );
  }
});
