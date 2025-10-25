/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// ============================================
// SERVICE WORKER - LAURA SAAS
// ============================================
// O Service Worker é um "proxy" que fica entre o app e a internet
// Ele intercenta todas as requisições e decide:
// - Usar cache?
// - Ir para rede?
// - Servir versão offline?
// Roda mesmo quando o app está fechado!

// ============================================
// 1. LIFECYCLE EVENTS
// ============================================

// "install" = SW foi baixado e instalado
// Usamos para fazer "pre-cache" (cachear assets essenciais)
self.addEventListener('install', (event: any) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    (async () => {
      // Abrir cache chamado 'laura-v1'
      const cache = await caches.open('laura-v1');
      
      // Pre-cachear arquivos essenciais (app shell)
      // Estes arquivos são baixados agora e nunca vão faltar
      await cache.addAll([
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/icon-192x192.png',
        '/icon-512x512.png',
      ]);
      
      // Força o SW ativar imediatamente (sem esperar abas fecharem)
      self.skipWaiting();
    })()
  );
});

// "activate" = SW anterior foi removido, este é novo
// Usamos para limpar caches antigos
self.addEventListener('activate', (event: any) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    (async () => {
      // Listar todos os caches
      const cacheNames = await caches.keys();
      
      // Deletar caches antigos (que não são 'laura-v1')
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== 'laura-v1') {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
      
      // Assume controle de todos os clientes abertos
      return self.clients.claim();
    })()
  );
});

// ============================================
// 2. FETCH EVENT - INTERCEPTA REQUISIÇÕES
// ============================================
// Cada vez que o app faz uma requisição (fetch), este evento dispara
// Aqui decidimos se usa cache, rede, ou offline

self.addEventListener('fetch', (event: any) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições não-HTTP (chrome-extension, etc)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // ============================================
  // ESTRATÉGIA 1: CACHE FIRST
  // ============================================
  // Para: ícones, fonts, CSS, JS
  // Lógica: Verificar cache PRIMEIRO, depois rede
  // Razão: Estes arquivos não mudam frequentemente
  
  if (
    url.pathname.includes('/icons/') ||
    url.pathname.includes('.woff') ||
    url.pathname.includes('.woff2') ||
    request.destination === 'style' ||
    request.destination === 'script'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        // Se tem no cache, retorna
        if (cached) {
          console.log(`[SW] Cache HIT: ${request.url}`);
          return cached;
        }
        
        // Se não tem, vai para rede
        return fetch(request).then((response) => {
          // Salvar resposta no cache
          if (response && response.status === 200) {
            const cache = caches.open('laura-v1');
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // ============================================
  // ESTRATÉGIA 2: NETWORK FIRST (com fallback cache)
  // ============================================
  // Para: /api/* (dados de agendamentos, clientes)
  // Lógica: Tenta rede PRIMEIRO, se falhar usa cache
  // Razão: Queremos dados frescos, mas offline funciona
  
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Sucesso! Cachear a resposta e retornar
          if (response && response.status === 200) {
            const cache = caches.open('laura-v1');
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(async () => {
          // Rede falhou, procurar no cache
          const cached = await caches.match(request);
          if (cached) {
            console.log(`[SW] Offline fallback: ${request.url}`);
            return cached;
          }
          
          // Nem cache tem, retornar resposta offline
          return new Response('Offline - dados não disponíveis', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain',
            }),
          });
        })
    );
    return;
  }

  // ============================================
  // ESTRATÉGIA 3: STALE WHILE REVALIDATE
  // ============================================
  // Para: /index.html (SPA)
  // Lógica: Retorna cache IMEDIATAMENTE, mas atualiza em background
  // Razão: App abre rápido, dados ficam atualizados
  
  if (request.destination === 'document') {
    event.respondWith(
      caches.match(request).then((cached) => {
        // Retornar cache (ou rede se não tiver)
        const fetchPromise = fetch(request).then((response) => {
          if (response && response.status === 200) {
            // Atualizar cache em background
            const cache = caches.open('laura-v1');
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        });
        
        return cached || fetchPromise;
      })
    );
    return;
  }

  // ============================================
  // DEFAULT: NETWORK ONLY
  // ============================================
  // Qualquer outra requisição vai direto para rede
});

// ============================================
// 3. PUSH EVENT - RECEBER NOTIFICAÇÕES
// ============================================
// Backend envia push → Navegador recebe → Este evento dispara
// Mostra notificação no dispositivo

self.addEventListener('push', (event: any) => {
  console.log('[SW] Push received:', event.data);
  
  const payload = event.data?.json() ?? {
    title: 'Laura SaaS',
    body: 'Nova notificação',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'laura-notification',
    data: {},
  };

  event.waitUntil(
    // Mostrar notificação
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: payload.data,
      requireInteraction: true,
    })
  );
});

// ============================================
// 4. NOTIFICATION CLICK - USUÁRIO CLICOU NA NOTIF
// ============================================
// Quando usuário clica numa notificação, este evento dispara

self.addEventListener('notificationclick', (event: any) => {
    console.log('[SW] Notification clicked:', event.notification);
  
  event.notification.close();

  event.waitUntil(
    // Procurar por aba aberta do Laura
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se aba já está aberta, focar nela
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Se não está aberta, abrir nova
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});

// ============================================
// 5. MESSAGE EVENT - SINCRONIZAR DADOS
// ============================================
// App envia mensagem para SW (ex: "sincronizar fila offline")

self.addEventListener('message', (event: any) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SYNC_QUEUE') {
    // App quer sincronizar fila offline
    // Backend vai processar em segundo plano
    event.waitUntil(
      (async () => {
        try {
          // Simular sync (em produção, fazer requisição real)
          console.log('[SW] Syncing queue...');
          // await fetch('/api/sync', { method: 'POST' })
        } catch (err) {
          console.error('[SW] Sync failed:', err);
        }
      })()
    );
  }

  if (event.data.type === 'SKIP_WAITING') {
    // App pediu para ativar novo SW imediatamente
    self.skipWaiting();
  }
});

export {};