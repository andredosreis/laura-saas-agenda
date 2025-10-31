import dotenv from 'dotenv-flow';
dotenv.config();

import mongoose from 'mongoose';
import UserSubscription from './src/models/UserSubscription.js';

async function checkSubscriptions() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB');

    const subscriptions = await UserSubscription.find({});
    console.log('\n📊 Total de subscriptions:', subscriptions.length);

    for (const sub of subscriptions) {
      console.log('\n---');
      console.log('userId:', sub.userId);
      console.log('active:', sub.active);
      console.log('endpoint:', sub.endpoint ? '✅ Existe' : '❌ Falta');
      console.log('keys.p256dh:', sub.keys?.p256dh ? '✅ Existe' : '❌ Falta');
      console.log('keys.auth:', sub.keys?.auth ? '✅ Existe' : '❌ Falta');

      // Verificar estrutura
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        console.log('🔴 SUBSCRIPTION INVÁLIDA! Falta dados essenciais.');
      } else {
        console.log('🟢 Subscription parece OK');
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Desconectado');
  }
}

checkSubscriptions();