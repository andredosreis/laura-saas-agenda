import dotenv from 'dotenv-flow';
dotenv.config();

import mongoose from 'mongoose';
import UserSubscription from './src/models/UserSubscription.js';

async function fixSubscriptions() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB');

    // Atualizar todas as subscriptions com userId null para 'LAURA'
    const result = await UserSubscription.updateMany(
      { userId: null },
      { $set: { userId: 'LAURA' } }
    );

    console.log(`\n✅ Subscriptions atualizadas: ${result.modifiedCount}`);

    // Verificar resultado
    const subscriptions = await UserSubscription.find({});
    console.log('\n📊 Subscriptions após atualização:');

    for (const sub of subscriptions) {
      console.log(`  - userId: ${sub.userId}, active: ${sub.active}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Desconectado');
  }
}

fixSubscriptions();