# 🏗️ ARQUITETURA PWA - LAURA SAAS v2

## Visão Geral

┌─────────────────────────────────────────────────────────┐
│ React + Vite + TypeScript │
├─────────────────────────────────────────────────────────┤
│ ✅ manifest.json (app metadata + ícones) │
│ ✅ service-worker.ts (offline cache + sync) │
│ ✅ notificationService.ts (Web Push) │
│ ✅ offlineService.ts (IndexedDB queue) │
└─────────────────────────────────────────────────────────┘
↓
┌────────────────────────────────┐
│ Browser APIs │
├────────────────────────────────┤
│ • Service Worker API │
│ • IndexedDB (offline queue) │
│ • Push API │
│ • Notification API │
└────────────────────────────────┘
↓
┌─────────────────────────────────────────────────────────┐
│ Backend (Node.js + Express) │
├─────────────────────────────────────────────────────────┤
│ POST /api/notifications/subscribe (salva subscription) │
│ POST /api/notifications/send (envia push) │
│ GET /api/agendamentos (cached offline) │
└─────────────────────────────────────────────────────────┘
↓
┌────────────────────────────────┐
│ Web Push Service │
│ (Google/Mozilla/Apple) │
└────────────────────────────────┘
↓
📱 Notificação no Device

## Estrutura de Pastas

laura-saas-frontend/
│
├── src/
│ ├── types/
│ │ └── pwa.ts
│ │ ├── PushSubscriptionJSON
│ │ ├── NotificationPayload
│ │ ├── SyncQueueItem
│ │ └── CacheConfig
│ │
│ ├── services/
│ │ ├── notificationService.ts
│ │ │ ├── subscribeToPush()
│ │ │ ├── unsubscribeFromPush()
│ │ │ └── handlePushNotification()
│ │ │
│ │ ├── serviceWorkerService.ts
│ │ │ ├── registerSW()
│ │ │ └── checkUpdates()
│ │ │
│ │ └── offlineService.ts
│ │ ├── queueBooking()
│ │ ├── syncQueue()
│ │ └── getOfflineData()
│ │
│ ├── workers/
│ │ └── service-worker.ts
│ │ ├── install event
│ │ ├── activate event
│ │ ├── fetch event (cache)
│ │ └── push event (notificações)
│ │
│ ├── pages/
│ │ └── Agenda.tsx (integração offline)
│ │
│ └── App.tsx (registra SW + subscreve push)
│
├── public/
│ ├── icons/
│ │ ├── favicon.ico
│ │ ├── icon-192x192.png
│ │ ├── icon-512x512.png
│ │ ├── icon-maskable-192.png
│ │ └── icon-maskable-512.png
│ │
│ └── manifest.json
│
├── vite.config.ts (PWA plugin)
├── tsconfig.json (Web Workers)
└── .env (VAPID keys)

Backend (src/)
│
├── routes/
│ └── notificationRoutes.ts
│
├── models/
│ └── UserSubscription.ts
│ ├── userId
│ ├── endpoint
│ ├── p256dh
│ ├── auth
│ └── createdAt
│
└── services/
└── pushService.ts
├── sendPushNotification()
└── broadcastNotification()

## Tipos TypeScript (src/types/pwa.ts)

```typescript
// Web Push Subscription
export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Payload da Notificação
export interface NotificationPayload {
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  data?: {
    url: string;
    bookingId?: string;
    clientId?: string;
  };
}

// Item da Fila de Sync (offline)
export interface SyncQueueItem {
  id: string;
  type: 'booking' | 'update';
  payload: Record<string, any>;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'failed';
}

// Cache Strategy
export type CacheStrategy = 'cache-first' | 'stale-while-revalidate' | 'network-first';

export interface CacheConfig {
  name: string;
  strategy: CacheStrategy;
  ttl?: number;
}

Fluxo: Lembretes 24h Antes
1. Agendamento criado → DB
2. CRON dispara (19h diariamente, TZ: Europe/Lisbon)
3. Busca agendamentos para amanhã
4. Para cada agendamento:
   - Valida se cliente tem subscription
   - Prepara payload NotificationPayload
   - Envia via pushService.broadcastNotification()
5. Web Push Server notifica device
6. Service Worker interceta "push" event
7. Exibe notificação ao utilizador

Offline-First Strategy
Modo Online:
  - Carrega agenda do backend
  - Cria booking diretamente via API
  - Notificação instantânea

Modo Offline:
  - Carrega agenda do cache (IndexedDB)
  - Cria booking no IndexedDB (sync queue)
  - UI mostra badge "Sincronizando..."
  - Quando voltar online → synca automático

  Integração com Backend Existente

  Novo no Backend:
  ✅ Model UserSubscription (MongoDB)
  ✅ POST /api/notifications/subscribe
  ✅ Service pushService.ts (web-push lib)
  ✅ Integração CRON (server.js)

Sem alterações:
  ✅ Rotas de agendamento/clientes (reutilizadas)
  ✅ Modelos existentes (Cliente, Agendamento)
  ✅ Estrutura Express (compatível)

  Dependências
  {
  "devDependencies": {
    "vite-plugin-pwa": "^0.17.5",
    "@vite-pwa/assets-generator": "^0.2.4"
  },
  "dependencies": {
    "web-push": "^3.6.7"
  }
}
Segurança
✅ VAPID Keys: .env (rotação regular)
✅ HTTPS obrigatório: Web Push requer HTTPS
✅ Validation: Pydantic no Backend
✅ Rate limit: Slowapi (futuro)
✅ PII: Sem dados sensíveis nas notificações

Performance

✅ Cache Strategy: Stale-While-Revalidate (agenda)
✅ Service Worker: ~50KB (minificado)
✅ IndexedDB: Apenas bookings pending (~1MB)
✅ VAPID Keys: Geradas 1x (renovação anual)
✅ Lighthouse PWA: Target 90+

