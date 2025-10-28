/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================
// NOTIFICATION SERVICE - LAURA SAAS
// ============================================
// Responsável por:
// 1. Inscrever/desinscrever user em Web Push
// 2. Enviar subscription ao backend
// 3. Processar notificações recebidas
// 4. Gerenciar permissões de notificação
// ============================================

import type { PushSubscriptionJSON, NotificationPayload } from '../types/pwa';
import api from './api.js';

// ============================================
// 1️⃣ TIPOS E CONSTANTES
// ============================================

interface NotificationPermission {
  status: 'granted' | 'denied' | 'default';
  timestamp: number;
}

const STORAGE_KEYS = {
  SUBSCRIPTION: 'laura-push-subscription',
  PERMISSION: 'laura-push-permission',
  DISABLED_REASON: 'laura-push-disabled-reason',
} as const;

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// ============================================
// 2️⃣ VERIFICAR SUPORTE A WEB PUSH
// ============================================

function isPushNotificationSupported(): boolean {
  // Verificar: navegador suporta SW + Notification API + Push API
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasNotificationAPI = 'Notification' in window;
  const hasPushAPI = 'PushManager' in window;

  if (!hasServiceWorker || !hasNotificationAPI || !hasPushAPI) {
    console.warn('[NotifService] ❌ Web Push não suportado neste navegador');
    return false;
  }

  return true;
}

// ============================================
// 3️⃣ VERIFICAR PERMISSÃO DE NOTIFICAÇÃO
// ============================================

function getNotificationPermission(): NotificationPermission {
  const permission = (Notification.permission || 'default') as
    | 'granted'
    | 'denied'
    | 'default';

  return {
    status: permission,
    timestamp: Date.now(),
  };
}

// ============================================
// 4️⃣ PEDIR PERMISSÃO AO UTILIZADOR
// ============================================

async function requestNotificationPermission(): Promise<boolean> {
  try {
    console.log('[NotifService] 📢 Pedindo permissão de notificações...');

    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      console.log('[NotifService] ✅ Permissão concedida');
      localStorage.setItem(
        STORAGE_KEYS.PERMISSION,
        JSON.stringify(getNotificationPermission())
      );
      localStorage.removeItem(STORAGE_KEYS.DISABLED_REASON);
      return true;
    }

    if (permission === 'denied') {
      console.warn('[NotifService] ❌ Permissão negada pelo utilizador');
      localStorage.setItem(STORAGE_KEYS.DISABLED_REASON, 'user_denied');
      return false;
    }

    console.log('[NotifService] ⏳ Permissão pendente');
    return false;
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao pedir permissão:', error);
    localStorage.setItem(
      STORAGE_KEYS.DISABLED_REASON,
      'permission_error'
    );
    return false;
  }
}

// ============================================
// 5️⃣ FUNÇÃO PRINCIPAL: SUBSCREVER EM PUSH
// ============================================

export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  try {
    // 1️⃣ Verificar suporte
    if (!isPushNotificationSupported()) {
      console.warn('[NotifService] ⚠️ Web Push não suportado');
      return null;
    }

    // 2️⃣ Verificar SE já está subscrito
    const existingSubscription = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTION);
    if (existingSubscription) {
      console.log('[NotifService] ✅ Já subscrito, retornando subscription existente');
      return JSON.parse(existingSubscription) as PushSubscriptionJSON;
    }

    // 3️⃣ Pedir permissão se ainda não foi concedida
    if (Notification.permission === 'default') {
      const permissionGranted = await requestNotificationPermission();
      if (!permissionGranted) {
        console.warn('[NotifService] ⚠️ Utilizador não concedeu permissão');
        return null;
      }
    }

    if (Notification.permission === 'denied') {
      console.warn('[NotifService] ⚠️ Notificações negadas para este site');
      return null;
    }

    // 4️⃣ Obter SW registration
    const swRegistration = await navigator.serviceWorker.ready;
    if (!swRegistration) {
      console.error('[NotifService] ❌ Service Worker não está ativo');
      return null;
    }

    // 5️⃣ Verificar se VAPID key está configurada
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[NotifService] ⚠️ VITE_VAPID_PUBLIC_KEY não configurada em .env');
      return null;
    }

    // 6️⃣ Subscrever em push
    console.log('[NotifService] 🔔 Subscrevendo em push notifications...');

    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    });

    // 7️⃣ Converter para JSON serializable
    const subscriptionJSON: PushSubscriptionJSON = subscription.toJSON() as PushSubscriptionJSON;

    // 8️⃣ Guardar localmente
    localStorage.setItem(
      STORAGE_KEYS.SUBSCRIPTION,
      JSON.stringify(subscriptionJSON)
    );

    console.log('[NotifService] ✅ Subscrito com sucesso');

    // 9️⃣ Enviar ao backend
    await sendSubscriptionToBackend(subscriptionJSON);

    return subscriptionJSON;
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao subscrever:', error);
    localStorage.setItem(
      STORAGE_KEYS.DISABLED_REASON,
      `subscribe_error: ${error instanceof Error ? error.message : 'unknown'}`
    );
    return null;
  }
}

// ============================================
// 6️⃣ FUNÇÃO: DESINSCREVER DE PUSH
// ============================================

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    console.log('[NotifService] 🔕 Desinscrevendo de push notifications...');

    // 1️⃣ Obter SW registration
    const swRegistration = await navigator.serviceWorker.ready;
    if (!swRegistration) {
      console.warn('[NotifService] ⚠️ Service Worker não está ativo');
      return false;
    }

    // 2️⃣ Obter subscription atual
    const subscription = await swRegistration.pushManager.getSubscription();
    if (!subscription) {
      console.log('[NotifService] ℹ️ Utilizador não estava subscrito');
      localStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION);
      return true;
    }

    // 3️⃣ Desinscrever
    const unsubscribed = await subscription.unsubscribe();
    if (!unsubscribed) {
      console.warn('[NotifService] ⚠️ Falha ao desinscrever');
      return false;
    }

    // 4️⃣ Remover localmente
    localStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION);

    // 5️⃣ Informar backend
    try {
      await api.post('/api/notifications/unsubscribe');
    } catch (err) {
      console.warn('[NotifService] ⚠️ Backend ainda não removeu subscription:', err);
      // Não falhar aqui, é OK se backend não remover (será feito depois)
    }

    console.log('[NotifService] ✅ Desinscrito com sucesso');
    return true;
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao desinscrever:', error);
    return false;
  }
}

// ============================================
// 7️⃣ FUNÇÃO: ENVIAR SUBSCRIPTION AO BACKEND
// ============================================

export async function sendSubscriptionToBackend(
  subscription: PushSubscriptionJSON
): Promise<boolean> {
  try {
    console.log('[NotifService] 📤 Enviando subscription ao backend...');

    // 1️⃣ Preparar payload
    const payload = {
      subscription: {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime ?? null,
        keys: {
          auth: subscription.keys.auth,
          p256dh: subscription.keys.p256dh,
        },
      },
    };

    // 2️⃣ Enviar ao backend
    const response = await api.post('/api/notifications/subscribe', payload);

    if (response.status === 200 || response.status === 201) {
      console.log('[NotifService] ✅ Subscription salva no backend');
      return true;
    }

    console.warn('[NotifService] ⚠️ Backend respondeu com status:', response.status);
    return false;
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao enviar subscription:', error);

    // Guardar localmente para retry depois
    const failedAttempt = {
      subscription,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'unknown',
    };
    localStorage.setItem('laura-push-failed-send', JSON.stringify(failedAttempt));

    return false;
  }
}

// ============================================
// 8️⃣ FUNÇÃO: PROCESSAR NOTIFICAÇÃO RECEBIDA
// ============================================

export function handlePushNotification(
  event: any
): void {
  try {
    console.log('[NotifService] 📨 Push recebido:', event.data);

    // 1️⃣ Parser o payload
    let payload: NotificationPayload;

    if (event.data) {
      try {
        payload = event.data.json();
      } catch {
        // Se não for JSON, criar payload padrão
        payload = {
          title: 'Laura SaaS',
          body: event.data.text() || 'Nova notificação',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: `laura-notif-${Date.now()}`,
          requireInteraction: true,
          data: {},
        };
      }
    } else {
      payload = {
        title: 'Laura SaaS',
        body: 'Nova notificação',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: `laura-notif-${Date.now()}`,
        requireInteraction: true,
        data: {},
      };
    }

    // 2️⃣ Log estruturado
    console.log('[NotifService] 📢 Mostrando notificação:', {
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      data: payload.data,
    });

    // 3️⃣ Mostrar notificação (feito no service worker com self.registration.showNotification)
    // Apenas registamos aqui, o SW já trata de mostrar

    // 4️⃣ Analytics (opcional)
    try {
      if (window && 'localStorage' in window) {
        const notifications = JSON.parse(
          localStorage.getItem('laura-notifications-log') || '[]'
        );
        notifications.push({
          title: payload.title,
          timestamp: Date.now(),
          tag: payload.tag,
        });
        // Guardar últimas 50
        if (notifications.length > 50) notifications.shift();
        localStorage.setItem('laura-notifications-log', JSON.stringify(notifications));
      }
    } catch (err) {
      console.debug('[NotifService] ℹ️ Não foi possível registar analytics:', err);
    }
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao processar notificação:', error);
  }
}

// ============================================
// 9️⃣ FUNÇÃO: OBTER STATUS ATUAL DE PUSH
// ============================================

export async function getPushStatus(): Promise<{
  supported: boolean;
  permission: 'granted' | 'denied' | 'default';
  subscribed: boolean;
  disabledReason?: string;
}> {
  try {
    const supported = isPushNotificationSupported();
    const permission = Notification.permission as 'granted' | 'denied' | 'default';
    const subscriptionJSON = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTION);
    const subscribed = subscriptionJSON !== null;
    const disabledReason = localStorage.getItem(STORAGE_KEYS.DISABLED_REASON) || undefined;

    return {
      supported,
      permission,
      subscribed,
      disabledReason,
    };
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao obter status:', error);
    return {
      supported: false,
      permission: 'default',
      subscribed: false,
      disabledReason: 'error',
    };
  }
}

// ============================================
// 🔟 FUNÇÃO: TESTAR NOTIFICAÇÃO (DEBUG)
// ============================================

export async function sendTestNotification(): Promise<void> {
  try {
    console.log('[NotifService] 🧪 Enviando notificação de teste...');

    const testPayload: NotificationPayload = {
      title: '🧪 Teste - Laura SaaS',
      body: 'Se vê isto, as notificações estão funcionando!',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: 'test-notification',
      requireInteraction: true,
      data: {
        url: '/',
        test: true,
      },
    };

    // Se estamos em test, podemos enviar pelo backend
    await api.post('/api/notifications/test', testPayload).catch(() => {
      console.log('[NotifService] ℹ️ Backend test endpoint não disponível');
    });

    console.log('[NotifService] ✅ Notificação de teste enviada');
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao enviar teste:', error);
  }
}

// ============================================
// 1️⃣1️⃣ RETRY: REENVIAR SUBSCRIPTIONS FALHADAS
// ============================================

export async function retryFailedSubscriptions(): Promise<number> {
  try {
    const failed = localStorage.getItem('laura-push-failed-send');
    if (!failed) {
      return 0;
    }

    const { subscription } = JSON.parse(failed);
    console.log('[NotifService] 🔄 Tentando reenviar subscription falhada...');

    const success = await sendSubscriptionToBackend(subscription);
    if (success) {
      localStorage.removeItem('laura-push-failed-send');
      console.log('[NotifService] ✅ Retry bem-sucedido');
      return 1;
    }

    return 0;
  } catch (error) {
    console.error('[NotifService] ❌ Erro no retry:', error);
    return 0;
  }
}

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  subscribeToPush,
  unsubscribeFromPush,
  sendSubscriptionToBackend,
  handlePushNotification,
  getPushStatus,
  sendTestNotification,
  retryFailedSubscriptions,
};