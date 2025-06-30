// ajustarEtapaClientes.js

require('dotenv-flow').config(); // para carregar variáveis .env
const mongoose = require('mongoose');

// Ajuste o caminho do seu model conforme sua estrutura
const Cliente = require('./src/models/Cliente');

async function main() {
  // Conectando ao banco
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  console.log('Conectado ao MongoDB.');

  // Atualiza todos os clientes que não têm o campo etapaConversa
  const result = await Cliente.updateMany(
    { etapaConversa: { $exists: false } },
    { $set: { etapaConversa: 'livre' } }
  );

  console.log(`Clientes atualizados: ${result.modifiedCount || result.nModified}`);
  await mongoose.disconnect();
  console.log('Desconectado do MongoDB. Pronto!');
}

main().catch(err => {
  console.error('Erro ao atualizar clientes:', err);
});
