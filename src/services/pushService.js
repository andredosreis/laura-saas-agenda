import dotenv from 'dotenv-flow';
dotenv.config();

import webPush from 'web-push';


// Configurar VAPID keys
console.log('[PushService] 🔍 VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY ? '✅ Carregada' : '❌ Não carregada');

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:support@laurasaas.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Envia notificação push para um cliente
 * @param {Object} subscription - UserSubscription doc
 * @param {Object} payload - Conteúdo da notificação
 * @returns {Promise<boolean>}
 */
export const sendPushNotification = async (subscription, payload) => {
  try {
    if (!subscription || !subscription.endpoint) {
      console.warn('[PushService] ⚠️ Subscription inválida');
      return false;
    }

    const pushPayload = {
      notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icon-192x192.png',
        badge: payload.badge || '/icon-192x192.png',
        tag: payload.tag || `laura-${Date.now()}`,
        requireInteraction: payload.requireInteraction !== false,
      },
      data: payload.data || {},
    };

    // Preparar subscription object para web-push
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    await webPush.sendNotification(pushSubscription, JSON.stringify(pushPayload));

    console.log('[PushService] ✅ Notificação enviada com sucesso');
    return true;
  } catch (error) {
    console.error('[PushService] ❌ Erro ao enviar notificação:', error.message);

    // Se erro 410 Gone = subscription expirou
    if (error.statusCode === 410) {
      console.log('[PushService] 🗑️ Subscription expirada, marcando como inativa');
      // Aqui você pode desativar a subscription no DB se quiser
    }

    return false;
  }
};

/**
 * Envia notificação para múltiplos clientes
 * @param {Array} subscriptions - Lista de UserSubscription docs
 * @param {Object} payload - Conteúdo da notificação
 * @returns {Promise<{sent: number, failed: number}>}
 */
export const sendBulkPushNotifications = async (subscriptions, payload) => {
  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    const success = await sendPushNotification(subscription, payload);
    if (success) {
      sent++;
    } else {
      failed++;
    }
  }

  console.log(`[PushService] 📊 Batch complete: ${sent} enviadas, ${failed} falhadas`);
  return { sent, failed };
};

export default {
  sendPushNotification,
  sendBulkPushNotifications,
};