import mongoose from 'mongoose';
import Agendamento from '../src/models/Agendamento.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const addIndexes = async () => {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');

    console.log('\n📊 Criando índices de analytics...');

    // Create compound indexes for analytics queries
    await Agendamento.collection.createIndex({ tenantId: 1, status: 1, dataHora: 1 });
    console.log('  ✅ Índice criado: { tenantId: 1, status: 1, dataHora: 1 }');

    await Agendamento.collection.createIndex({ tenantId: 1, dataHora: 1 });
    console.log('  ✅ Índice criado: { tenantId: 1, dataHora: 1 }');

    await Agendamento.collection.createIndex({ tenantId: 1, cliente: 1, status: 1 });
    console.log('  ✅ Índice criado: { tenantId: 1, cliente: 1, status: 1 }');

    console.log('\n🎉 Todos os índices criados com sucesso!');

    // List all indexes
    console.log('\n📋 Índices atuais na collection Agendamento:');
    const indexes = await Agendamento.collection.indexes();
    indexes.forEach(index => {
      console.log(`  - ${JSON.stringify(index.key)}`);
    });

    await mongoose.disconnect();
    console.log('\n🔌 Desconectado do MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erro ao criar índices:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

addIndexes();
