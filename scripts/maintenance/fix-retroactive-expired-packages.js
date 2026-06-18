/**
 * Realinha vendas de pacote RETROACTIVAS com a regra de negócio "retroactivas nunca expiram".
 *
 * Contexto:
 *   Vendas registadas com dataCompra no passado tinham `dataExpiracao = dataCompra + diasValidade`,
 *   que frequentemente caía no passado → o pacote nascia "Expirado". Como Vendas (PacotesAtivos)
 *   e Agendamentos só mostram pacotes "Ativo", esses pacotes ficavam invisíveis e as sessões
 *   restantes não eram utilizáveis (ex: cliente "Tina").
 *
 *   O fix no código (venderPacote) passou a NÃO calcular validade em vendas retroactivas.
 *   Este script aplica a mesma regra aos registos JÁ existentes.
 *
 * O que faz, por cada CompraPacote com `origemRetroactiva` preenchida (i.e. venda retroactiva):
 *   - status 'Ativo'    → limpa dataExpiracao (deixa de poder expirar)
 *   - status 'Expirado' → limpa dataExpiracao e:
 *        • sessoesRestantes > 0 → status 'Ativo'   (reactiva — caso da Tina)
 *        • sessoesRestantes = 0 → status 'Concluído'
 *   - status 'Cancelado'/'Concluído' → não toca (decisão humana / terminal)
 *
 *   Vendas NÃO retroactivas (sem origemRetroactiva) nunca são tocadas: um pacote normal
 *   que expirou continua expirado.
 *
 * Uso (DB-per-tenant — ADR-001/002):
 *   node scripts/maintenance/fix-retroactive-expired-packages.js          # dry-run (default)
 *   node scripts/maintenance/fix-retroactive-expired-packages.js --apply  # aplica alterações
 *
 * Requisitos antes de produção:
 *   - Backup recente da DB.
 *   - Correr dry-run primeiro e validar a lista de pacotes afectados.
 */

import 'dotenv-flow/config';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

function log(...args) {
  // eslint-disable-next-line no-console
  console.log('[fix-retro-expired]', ...args);
}

// Critério de "venda retroactiva": origemRetroactiva foi preenchida na criação.
const FILTRO_RETROACTIVO = {
  'origemRetroactiva.registadoEm': { $exists: true, $ne: null },
  status: { $in: ['Ativo', 'Expirado'] },
};

function decidirAlteracao(doc) {
  const update = {};
  if (doc.dataExpiracao != null) {
    update.dataExpiracao = null;
  }
  if (doc.status === 'Expirado') {
    update.status = (doc.sessoesRestantes || 0) > 0 ? 'Ativo' : 'Concluído';
  }
  return Object.keys(update).length > 0 ? update : null;
}

async function processTenantDB(dbName) {
  const db = mongoose.connection.useDb(dbName, { useCache: false });
  const coll = db.collection('comprapacotes');
  const clientesColl = db.collection('clientes');

  const candidatos = await coll.find(FILTRO_RETROACTIVO).toArray();
  if (candidatos.length === 0) {
    return { dbName, candidatos: 0, alterados: 0, detalhes: [] };
  }

  // Nomes dos clientes (só para o relatório)
  const clienteIds = [...new Set(candidatos.map((c) => c.cliente).filter(Boolean).map(String))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const clientes = clienteIds.length
    ? await clientesColl.find({ _id: { $in: clienteIds } }).project({ nome: 1 }).toArray()
    : [];
  const nomePorCliente = new Map(clientes.map((c) => [String(c._id), c.nome]));

  const detalhes = [];
  let alterados = 0;

  for (const doc of candidatos) {
    const update = decidirAlteracao(doc);
    if (!update) continue;

    detalhes.push({
      id: String(doc._id),
      cliente: nomePorCliente.get(String(doc.cliente)) || String(doc.cliente),
      de: doc.status,
      para: update.status || doc.status,
      sessoesRestantes: doc.sessoesRestantes,
      dataExpiracaoAntiga: doc.dataExpiracao,
    });

    if (APPLY) {
      await coll.updateOne({ _id: doc._id }, { $set: update });
    }
    alterados += 1;
  }

  return { dbName, candidatos: candidatos.length, alterados, detalhes };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    log('❌ MONGODB_URI não configurado — abortar');
    process.exit(1);
  }

  log(`Modo: ${APPLY ? 'APPLY (escreve alterações)' : 'DRY-RUN (sem alterações)'}`);
  log('A conectar ao MongoDB...');
  await mongoose.connect(uri);
  log('✅ Conectado');

  const adminDb = mongoose.connection.db.admin();
  const { databases } = await adminDb.listDatabases();

  const dbNames = databases
    .map((d) => d.name)
    .filter((name) => name.startsWith('tenant_') || name === mongoose.connection.name);

  log(`A processar ${dbNames.length} bases de dados...`);

  const resultados = [];
  for (const dbName of dbNames) {
    try {
      resultados.push(await processTenantDB(dbName));
    } catch (err) {
      log(`⚠️ Erro ao processar ${dbName}:`, err.message);
      resultados.push({ dbName, error: err.message });
    }
  }

  // Resumo
  log('\n────── RESUMO ──────');
  const totalCandidatos = resultados.reduce((acc, r) => acc + (r.candidatos || 0), 0);
  const totalAlterados = resultados.reduce((acc, r) => acc + (r.alterados || 0), 0);
  log(`Bases processadas:            ${resultados.length}`);
  log(`Pacotes retroactivos achados: ${totalCandidatos}`);
  log(`Pacotes ${APPLY ? 'alterados' : 'a alterar'}:        ${totalAlterados}`);

  for (const r of resultados) {
    if (!r.detalhes || r.detalhes.length === 0) continue;
    log(`\nDB: ${r.dbName} — ${r.detalhes.length} pacote(s):`);
    for (const d of r.detalhes) {
      log(`  • ${d.cliente} | ${d.de} → ${d.para} | sessões restantes: ${d.sessoesRestantes} | id: ${d.id}`);
    }
  }

  if (!APPLY && totalAlterados > 0) {
    log('\nℹ️  Dry-run. Corre novamente com --apply para aplicar as alterações acima.');
  }

  await mongoose.disconnect();
  log('\nDesconectado. Pronto.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[fix-retro-expired] FATAL:', err);
  process.exit(1);
});
