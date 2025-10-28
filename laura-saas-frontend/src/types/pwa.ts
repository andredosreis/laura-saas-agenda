// ============================================
// 1. TIPOS DE WEB PUSH
// ============================================
// Web Push é o sistema que envia notificações do servidor para o dispositivo
// Quando o usuário se "subscreve", o browser gera uma "subscription"
// Esta subscription tem dados criptografados que o servidor precisa guardar

export interface PushSubscriptionJSON {
  endpoint: string;        // URL única do servidor de push (Google, Mozilla, etc)
   expirationTime?: number
  keys: {
    auth: string;          // Chave de autenticação (base64)
    p256dh: string;        // Chave de criptografia ECDH (base64)
  };
}

// ============================================
// 2. TIPOS DE NOTIFICAÇÕES
// ============================================
// Quando o servidor quer enviar uma notificação, prepara um "payload"
// Este é o conteúdo que vai aparecer no dispositivo do usuário

export interface NotificationPayload {
  title: string;           // Título da notificação
  body: string;            // Corpo/mensagem da notificação
  icon: string;            // URL do ícone (ex: /icon-192x192.png)
  badge: string;           // URL do badge (ícone pequeno)
  tag: string;             // ID único (evita duplicatas)
  requireInteraction: boolean; // Notif fica até usuário clicar?
  data?: {
    [key: string]: any;    // Dados customizados (ex: ID do agendamento)
  };
  actions?: NotificationAction[];  // Botões na notificação
}

export interface NotificationAction {
  action: string;          // ID da ação (ex: "confirm", "cancel")
  title: string;           // Texto do botão
  icon?: string;           // Ícone do botão
}

// ============================================
// 3. TIPOS DE FILA OFFLINE
// ============================================
// Quando o app está offline, o usuário pode fazer ações (criar agendamento)
// Estas ações ficam na fila esperando conexão para sincronizar

export interface SyncQueueItem {
  id: string;              // ID único da requisição
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';  // Tipo de requisição HTTP
  endpoint: string;        // Ex: /api/agendamentos
  data: any;               // Dados a enviar
  timestamp: number;       // Quando foi criada (Date.now())
  retries: number;         // Quantas vezes já tentou sincronizar
}

// ============================================
// 4. TIPOS DE CACHE
// ============================================
// O Service Worker precisa saber como cachear diferentes tipos de dados

export interface CacheConfig {
  name: string;            // Nome do cache (ex: 'laura-v1')
  version: number;         // Versão para atualizar cache
  maxAge: number;          // Tempo máximo em segundos (ex: 24 horas = 86400)
}

export interface CachedResponse {
  status: number;          // Status HTTP (200, 404, etc)
  headers: Record<string, string>;  // Headers da resposta
  body: any;               // Dados em cache
  timestamp: number;       // Quando foi cacheado
}

// ============================================
// 5. TIPOS DE BANCO DE DADOS OFFLINE
// ============================================
// IndexedDB é o banco de dados que funciona no navegador (sem conexão)

export interface IndexedDBConfig {
  dbName: string;          // Nome do banco (ex: 'laura-offline')
  version: number;         // Versão do schema
  stores: DBStore[];       // Tabelas do banco
}

export interface DBStore {
  name: string;            // Nome da tabela (ex: 'agendamentos')
  keyPath: string;         // Campo ID (ex: 'id')
  indexes?: DBIndex[];     // Índices de busca rápida
}

export interface DBIndex {
  name: string;            // Nome do índice
  keyPath: string;         // Campo a indexar
  unique: boolean;         // Deve ser único?
}

// ============================================
// 6. TIPOS DE AGENDAMENTO (OFFLINE)
// ============================================
// Dados que sincronizamos offline

export interface BookingOffline {
  id?: string;             // ID (gerado localmente se offline)
  clientId: string;
  clientName: string;
  date: string;            // ISO: '2025-01-15'
  time: string;            // ISO: '14:30'
  service: string;         // Ex: 'Manicure'
  duration: number;        // Minutos
  status: 'pending' | 'confirmed' | 'cancelled';
  syncStatus: 'synced' | 'pending' | 'failed';  // Status no servidor
}

// ============================================
// 7. TIPOS DE ERRO/STATUS
// ============================================

export interface PWAError {
  code: string;            // Ex: 'NOTIFICATION_BLOCKED'
  message: string;
  timestamp: number;
}

export interface PWAStatus {
  serviceWorkerReady: boolean;  // SW foi registrado?
  pushSubscribed: boolean;      // Notificações ativadas?
  offlineReady: boolean;        // App funciona offline?
  isOnline: boolean;            // Tem conexão agora?
}