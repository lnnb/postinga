/**
 * Postinga — service worker mínimo.
 *
 * No guarda nada en caché a propósito: la app es chica, se sirve siempre desde
 * la red y así nunca queda una versión vieja pegada. Su única función es que el
 * navegador la considere instalable como app.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Deja pasar todas las peticiones tal cual, sin interceptar nada.
self.addEventListener('fetch', () => {});
