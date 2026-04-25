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

// ✅ Suporta tanto VITE_VAPID_PUBLIC_KEY quanto VITE_VAPID_PUBLIC (caso Vercel bloqueie _KEY)
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || import.meta.env.VITE_VAPID_PUBLIC || '';

// 🔍 DEBUG: Verificar se variável está carregando
console.log('[NotifService] 🔍 DEBUG VAPID:', {
  hasVITE_VAPID_PUBLIC_KEY: !!import.meta.env.VITE_VAPID_PUBLIC_KEY,
  hasVITE_VAPID_PUBLIC: !!import.meta.env.VITE_VAPID_PUBLIC,
  keyLength: VAPID_PUBLIC_KEY.length,
  allEnvKeys: Object.keys(import.meta.env).filter(k => k.includes('VAPID'))
});

// ============================================
// 2️⃣ VERIFICAR SUPORTE A WEB PUSH
// ============================================

function isPushNotificationSupported(): boolean {
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
// 5️⃣ FUNÇÃO: SUBSCREVER EM PUSH
// ============================================

export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  try {
    if (!isPushNotificationSupported()) {
      console.warn('[NotifService] ⚠️ Web Push não suportado');
      return Promise.resolve(null);
    }
    
    const existingSubscription = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTION);
    if (existingSubscription) {
      console.log('[NotifService] ✅ Já subscrito, retornando subscription existente');
      return JSON.parse(existingSubscription) as PushSubscriptionJSON;
    }

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

    const swRegistration = await navigator.serviceWorker.ready;
    if (!swRegistration) {
      console.error('[NotifService] ❌ Service Worker não está ativo');
      return null;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.warn('[NotifService] ⚠️ VITE_VAPID_PUBLIC_KEY não configurada em .env');
      return null;
    }

    console.log('[NotifService] 🔔 Subscrevendo em push notifications...');

    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    });

    const subscriptionJSON: PushSubscriptionJSON = subscription.toJSON() as PushSubscriptionJSON;

    localStorage.setItem(
      STORAGE_KEYS.SUBSCRIPTION,
      JSON.stringify(subscriptionJSON)
    );

    console.log('[NotifService] ✅ Subscrito com sucesso');

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
    console.log('[NotifService] 🔔 Desinscrever de push...');

    const stored = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTION);

    if (!stored) {
      console.warn('[NotifService] ⚠️ Sem subscription ativa');
      return false;
    }

    const swRegistration = await navigator.serviceWorker.ready;
    if (!swRegistration) {
      console.error('[NotifService] ❌ Service Worker não está ativo');
      return false;
    }

    // Extrair endpoint da subscription para notificar o backend
    let endpoint: string | undefined;
    try {
      const parsed = JSON.parse(stored);
      endpoint = parsed.endpoint;
    } catch {
      endpoint = undefined;
    }

    const pushSubscription = await swRegistration.pushManager.getSubscription();
    if (pushSubscription) {
      endpoint = endpoint || pushSubscription.endpoint;
      await pushSubscription.unsubscribe();
      console.log('[NotifService] ✅ Desinscrição do browser completada');
    }

    // Sincronizar com backend para remover o registo e não deixar órfão
    if (endpoint) {
      try {
        await api.post('/notifications/unsubscribe', { endpoint });
        console.log('[NotifService] ✅ Backend actualizado');
      } catch (err) {
        // Não bloqueia o logout local se o backend falhar
        console.warn('[NotifService] ⚠️ Falha a notificar backend — subscription removida localmente');
      }
    }

    localStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION);

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
): Promise<void> {
  try {
    console.log('[NotifService] 📤 Enviando subscription ao backend...');

    const response = await api.post('/notifications/subscribe', {
      subscription,
      userId: 'LAURA', // ✨ CORREÇÃO: Identifica Laura para receber notificações
      userAgent: navigator.userAgent,
    });

    console.log('[NotifService] ✅ Subscription enviada:', response.data);
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao enviar subscription:', error);
  }
}

// ============================================
// 8️⃣ FUNÇÃO: PROCESSAR NOTIFICAÇÕES PUSH (Service Worker)
// ============================================

export function handlePushNotification(event: any): void {
  const payload: NotificationPayload = event.data.json();

  try {
    console.log('[NotifService] 📢 Mostrando notificação:', {
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
    });

    event.waitUntil(
      (self as any).registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag,
        requireInteraction: payload.requireInteraction ?? true,
        data: payload.data || {},
      })
    );
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao processar notificação:', error);
  }
}
// ============================================
/// ============================================
// 9️⃣ FUNÇÃO: GET PUSH STATUS
// ============================================

export async function getPushStatus() {
  try {
    const supported = isPushNotificationSupported();
    const permission = Notification.permission;
    const subscription = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTION);
    const disabledReason = localStorage.getItem(STORAGE_KEYS.DISABLED_REASON);

    return {
      supported,
      permission: permission as 'granted' | 'denied' | 'default',
      subscribed: !!subscription,
      disabledReason: disabledReason || undefined,
    };
  } catch (error) {
    console.error('[NotifService] ❌ Erro ao obter push status:', error);
    return {
      supported: false,
      permission: 'default' as const,
      subscribed: false,
      disabledReason: 'check_failed',
    };
  }
}