// Service Worker Dummy para ambiente de desenvolvimento
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
