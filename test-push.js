import dotenv from 'dotenv-flow';
dotenv.config();

import mongoose from 'mongoose';
import UserSubscription from './src/models/UserSubscription.js';
import { sendPushNotification } from './src/services/pushService.js';

async function testPush() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    // Buscar subscription de Laura
    const subscription = await UserSubscription.findOne({
      userId: 'LAURA',
      active: true
    });

    if (!subscription) {
      console.log('❌ Nenhuma subscription encontrada para LAURA');
      process.exit(1);
    }

    console.log('📋 Subscription encontrada:');
    console.log('  - userId:', subscription.userId);
    console.log('  - endpoint:', subscription.endpoint ? `${subscription.endpoint.substring(0, 50)}...` : '❌ Falta');
    console.log('  - keys.p256dh:', subscription.keys?.p256dh ? `${subscription.keys.p256dh.substring(0, 20)}...` : '❌ Falta');
    console.log('  - keys.auth:', subscription.keys?.auth ? `${subscription.keys.auth.substring(0, 20)}...` : '❌ Falta');
    console.log('  - active:', subscription.active);
    console.log('');

    // Verificar VAPID keys
    console.log('🔐 VAPID Keys:');
    console.log('  - PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY ? '✅ Configurada' : '❌ Falta');
    console.log('  - PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY ? '✅ Configurada' : '❌ Falta');
    console.log('  - SUBJECT:', process.env.VAPID_SUBJECT || 'mailto:support@laurasaas.com');
    console.log('');

    // Tentar enviar notificação de teste
    console.log('📤 Enviando notificação de teste...\n');

    const payload = {
      title: '🧪 Teste de Notificação',
      body: 'Se você recebeu isso, as notificações estão funcionando!',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: 'test-notification',
      requireInteraction: true,
      data: {
        tipo: 'teste',
        timestamp: Date.now(),
      },
    };

    const resultado = await sendPushNotification(subscription, payload);

    if (resultado) {
      console.log('\n✅ SUCESSO! Notificação enviada.');
      console.log('👀 Verifique o navegador para ver a notificação.');
    } else {
      console.log('\n❌ FALHA ao enviar notificação.');
      console.log('Verifique os logs acima para detalhes do erro.');
    }

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Desconectado');
    process.exit(0);
  }
}

testPush();