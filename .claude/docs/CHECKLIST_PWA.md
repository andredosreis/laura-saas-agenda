# ✅ CHECKLIST PWA - LAURA SAAS v2

## PHASE 1: Setup Base + TypeScript (Dia 1)

### T1: Instalar Dependências
- [ ] Frontend: Instalar vite-plugin-pwa
- [ ] Frontend: Instalar web-push (types)
- [ ] Backend: Instalar web-push
- [ ] Verificar package.json atualizado
- [ ] npm install (ambos diretórios)

**Comandos:**
```bash
# Frontend
cd laura-saas-frontend
npm install vite-plugin-pwa web-push --save
npm install --save-dev @vite-pwa/assets-generator

# Backend
cd ../
npm install web-push --save

T2: Atualizar vite.config.ts
<input disabled="" type="checkbox"> Adicionar VitePWA plugin
<input disabled="" type="checkbox"> Configurar manifest path
<input disabled="" type="checkbox"> Definir estratégia de cache
<input disabled="" type="checkbox"> Configurar service worker
T3: Atualizar tsconfig.json
<input disabled="" type="checkbox"> Adicionar "lib": ["webworker"]
<input disabled="" type="checkbox"> Verificar "module": "esnext"
<input disabled="" type="checkbox"> Verificar strict mode ativo
T4: Criar src/types/pwa.ts
<input disabled="" type="checkbox"> Definir PushSubscriptionJSON
<input disabled="" type="checkbox"> Definir NotificationPayload
<input disabled="" type="checkbox"> Definir SyncQueueItem
<input disabled="" type="checkbox"> Definir CacheConfig
T5: Criar public/manifest.json
<input disabled="" type="checkbox"> Nome, description, theme_color
<input disabled="" type="checkbox"> Icons (192x192, 512x512)
<input disabled="" type="checkbox"> Start URL: /
<input disabled="" type="checkbox"> Display: standalone

PHASE 3: Service Worker + Offline (Dia 3-4)
T10: Criar public/service-worker.ts
<input disabled="" type="checkbox"> Install event (cache assets)
<input disabled="" type="checkbox"> Activate event (cleanup old cache)
<input disabled="" type="checkbox"> Fetch event (serve from cache)
<input disabled="" type="checkbox"> Push event (exibe notificação)
<input disabled="" type="checkbox"> Message event (sync queue)
T11: Implementar Cache Strategy
<input disabled="" type="checkbox"> Cache name: 'laura-v1'
<input disabled="" type="checkbox"> Precache: /index.html, /icons/*
<input disabled="" type="checkbox"> Stale-While-Revalidate: /api/agendamentos
<input disabled="" type="checkbox"> Network-First: /api/* (bookings)
T12: Criar offlineService.ts
<input disabled="" type="checkbox"> initIndexedDB()
<input disabled="" type="checkbox"> queueBooking(bookingData)
<input disabled="" type="checkbox"> syncQueue()
<input disabled="" type="checkbox"> getOfflineData()
T13: Integrar SW em App.tsx
<input disabled="" type="checkbox"> Registar service worker
<input disabled="" type="checkbox"> Check updates periodicamente
<input disabled="" type="checkbox"> Mostrar toast "Updates available"
PHASE 4: Web Push + Notificações (Dia 5)
T14: Criar notificationService.ts
<input disabled="" type="checkbox"> subscribeToPush()
<input disabled="" type="checkbox"> unsubscribeFromPush()
<input disabled="" type="checkbox"> sendSubscriptionToBackend()
<input disabled="" type="checkbox"> handlePushNotification()
T15: Integrar em Agenda.tsx
<input disabled="" type="checkbox"> On component mount: subscribeToPush()
<input disabled="" type="checkbox"> Mostrar status subscription
<input disabled="" type="checkbox"> Catch errors gracefully
T16: Integrar no CRON Backend
<input disabled="" type="checkbox"> server.js: chamar pushService.broadcastNotification()
<input disabled="" type="checkbox"> Buscar agendamentos 24h depois
<input disabled="" type="checkbox"> Enviar via Web Push
  const bookings = await getBookingsForTomorrow();
  for (const booking of bookings) {
    await pushService.broadcastNotification(booking.client, payload);
  }
});


T17: Testar Web Push Localmente
<input disabled="" type="checkbox"> Instalar ngrok (expor localhost em HTTPS)
<input disabled="" type="checkbox"> Registar service worker
<input disabled="" type="checkbox"> Subscribe para push
<input disabled="" type="checkbox"> Enviar notificação do backend
<input disabled="" type="checkbox"> Verificar no device
Comandos:
ngrok http 5000
# Usar URL ngrok no .env FRONTEND_URL

PHASE 5: Polish + Deploy (Dia 6-7)
T18: Criar Ícones iOS
<input disabled="" type="checkbox"> 180x180 (iPhone)
<input disabled="" type="checkbox"> 167x167 (iPad)
<input disabled="" type="checkbox"> 152x152 (iPad mini)
<input disabled="" type="checkbox"> Adicionar ao manifest.json
T19: Testar em Mobile Real
<input disabled="" type="checkbox"> iPhone: Safari → Share → Add to Home Screen
<input disabled="" type="checkbox"> Android: Chrome → Menu → Install app
<input disabled="" type="checkbox"> Testar offline (desabilitar Wi-Fi)
<input disabled="" type="checkbox"> Testar notificações
T20: Lighthouse PWA Audit
<input disabled="" type="checkbox"> npm run build
<input disabled="" type="checkbox"> Abrir lighthouse (DevTools)
<input disabled="" type="checkbox"> Target: 90+ em PWA
<input disabled="" type="checkbox"> Corrigir red flags

☐ Manifest valid
☐ HTTPS (ou localhost)
☐ Service Worker respondendo
☐ Responsivo
☐ Ícones presentes
☐ Display standalone

T21: Documentar Processo
<input disabled="" type="checkbox"> Atualizar ARQUITETURA_PWA.md
<input disabled="" type="checkbox"> Criar DEPLOYMENT.md (instruções PWA)
<input disabled="" type="checkbox"> Testar 1x em cada browser

Status Atual
Fase: 1 (Setup)
Tarefas Completas: 0/21
Data Início: 2025-01-XX
Data Fim Estimada: 2025-01-XX

Comandos Úteis
# Gerar VAPID
npx web-push generate-vapid-keys

# Build com PWA
npm run build

# Testar Build
npm run preview

# Lighthouse
npx lighthouse https://localhost:5000

# Inspecionar Service Worker
chrome://serviceworker-internals/
chrome://service-worker-internals/

# DevTools
Chrome DevTools → Application → Service Workers

Blockers + Soluções
Blocker	Solução
Web Push precisa HTTPS	Usar ngrok ou deploy staging
IndexedDB sincronização	Event listener "online/offline"
Service Worker não atualiza	Usar skipWaiting + clientsClaim
Ícones não aparecem	Verificar public/icons/ path
VAPID keys expiradas	Gerar novas anualmente

Referências

Web Push MDN (https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
PWA Checklist (https://web.dev/articles/pwa-checklist?hl=pt-br)
Service Worker(https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
Vite PWA Plugin (https://vite-pwa-org.netlify.app/)


