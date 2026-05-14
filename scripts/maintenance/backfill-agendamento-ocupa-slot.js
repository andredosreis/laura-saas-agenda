/**
 * GAP-01 migration — Agendamento.ocupaSlot backfill + duplicate audit.
 *
 * Contexto:
 *   PRD §7.1 GAP-01 introduz um índice composto único parcial em Agendamento
 *   `(tenantId, dataHora)` filtrado por `ocupaSlot=true` para tornar a detecção
 *   de conflito de slot atómica ao nível da DB.
 *
 *   Este script:
 *     1. Conecta à DB principal e lista todos os tenants.
 *     2. Para cada tenant (DB-per-tenant — ADR-001/002), itera a colecção
 *        `agendamentos` e:
 *          a) Calcula `ocupaSlot` a partir de `status` (false se cancelado).
 *          b) Detecta duplicados pré-existentes que violariam o índice
 *             antes de o criar (mesma `dataHora` + `ocupaSlot=true`).
 *     3. Reporta o resumo. Se `--apply` for passado, aplica os `ocupaSlot`
 *        updates. Caso contrário, dry-run (modo padrão).
 *
 * Uso:
 *   node scripts/maintenance/backfill-agendamento-ocupa-slot.js          # dry-run
 *   node scripts/maintenance/backfill-agendamento-ocupa-slot.js --apply  # aplica
 *
 * Requisitos antes de promover para produção:
 *   - Backup recente da DB (ADR de backup já cobre isto).
 *   - Sem duplicados reportados (ou resolvidos manualmente antes do índice subir).
 *   - Mongoose vai criar o índice automaticamente na próxima conexão. Se houver
 *     duplicados não resolvidos, o `createIndex` falha em background — logado
 *     pelo Mongoose mas não bloqueia o app. Por isso este script deve correr
 *     ANTES do deploy do schema novo.
 */

import 'dotenv-flow/config';
import mongoose from 'mongoose';

const STATUSES_QUE_NAO_OCUPAM_SLOT = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];

const APPLY = process.argv.includes('--apply');

function log(...args) {
  // eslint-disable-next-line no-console
  console.log('[backfill-ocupa-slot]', ...args);
}

async function processTenantDB(adminDb, dbName) {
  const db = mongoose.connection.useDb(dbName, { useCache: false });
  const coll = db.collection('agendamentos');

  const total = await coll.estimatedDocumentCount();
  if (total === 0) {
    return { dbName, total: 0, ocupaSlotAtualizados: 0, duplicados: [] };
  }

  // 1) Backfill ocupaSlot — só docs sem o campo ou com valor inconsistente.
  let ocupaSlotAtualizados = 0;
  if (APPLY) {
    const trueResult = await coll.updateMany(
      {
        $and: [
          { status: { $nin: STATUSES_QUE_NAO_OCUPAM_SLOT } },
          { $or: [{ ocupaSlot: { $exists: false } }, { ocupaSlot: { $ne: true } }] },
        ],
      },
      { $set: { ocupaSlot: true } },
    );
    const falseResult = await coll.updateMany(
      {
        $and: [
          { status: { $in: STATUSES_QUE_NAO_OCUPAM_SLOT } },
          { $or: [{ ocupaSlot: { $exists: false } }, { ocupaSlot: { $ne: false } }] },
        ],
      },
      { $set: { ocupaSlot: false } },
    );
    ocupaSlotAtualizados = (trueResult.modifiedCount || 0) + (falseResult.modifiedCount || 0);
  } else {
    const aTornarTrue = await coll.countDocuments({
      $and: [
        { status: { $nin: STATUSES_QUE_NAO_OCUPAM_SLOT } },
        { $or: [{ ocupaSlot: { $exists: false } }, { ocupaSlot: { $ne: true } }] },
      ],
    });
    const aTornarFalse = await coll.countDocuments({
      $and: [
        { status: { $in: STATUSES_QUE_NAO_OCUPAM_SLOT } },
        { $or: [{ ocupaSlot: { $exists: false } }, { ocupaSlot: { $ne: false } }] },
      ],
    });
    ocupaSlotAtualizados = aTornarTrue + aTornarFalse;
  }

  // 2) Audit de duplicados que violariam o índice composto único parcial.
  // Grupo por (tenantId, dataHora) onde status NÃO está nos cancelados.
  // Cada grupo com count > 1 é uma violação pré-existente.
  const duplicados = await coll
    .aggregate([
      { $match: { status: { $nin: STATUSES_QUE_NAO_OCUPAM_SLOT } } },
      {
        $group: {
          _id: { tenantId: '$tenantId', dataHora: '$dataHora' },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          statuses: { $push: '$status' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 50 },
    ])
    .toArray();

  return { dbName, total, ocupaSlotAtualizados, duplicados };
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

  // Inclui tenant_* (DB-per-tenant) E a DB principal (se ainda existirem
  // agendamentos partilhados pré-migração shared-DB → DB-per-tenant).
  const dbNamesParaProcessar = databases
    .map((d) => d.name)
    .filter((name) => name.startsWith('tenant_') || name === mongoose.connection.name);

  log(`A processar ${dbNamesParaProcessar.length} bases de dados...`);

  const resultados = [];
  for (const dbName of dbNamesParaProcessar) {
    try {
      const r = await processTenantDB(adminDb, dbName);
      resultados.push(r);
    } catch (err) {
      log(`⚠️ Erro ao processar ${dbName}:`, err.message);
      resultados.push({ dbName, error: err.message });
    }
  }

  // Resumo
  log('\n────── RESUMO ──────');
  const totalDocs = resultados.reduce((acc, r) => acc + (r.total || 0), 0);
  const totalUpdates = resultados.reduce((acc, r) => acc + (r.ocupaSlotAtualizados || 0), 0);
  const dbsComDuplicados = resultados.filter((r) => (r.duplicados || []).length > 0);

  log(`Bases processadas:        ${resultados.length}`);
  log(`Agendamentos analisados:  ${totalDocs}`);
  log(`ocupaSlot ${APPLY ? 'actualizados' : 'a actualizar'}: ${totalUpdates}`);
  log(`Bases com duplicados:     ${dbsComDuplicados.length}`);

  if (dbsComDuplicados.length > 0) {
    log('\n────── DUPLICADOS DETECTADOS (violariam o índice) ──────');
    for (const r of dbsComDuplicados) {
      log(`\nDB: ${r.dbName} — ${r.duplicados.length} grupos:`);
      for (const dup of r.duplicados) {
        log(
          `  • tenantId=${dup._id.tenantId} dataHora=${dup._id.dataHora?.toISOString?.() || dup._id.dataHora} count=${dup.count}`,
        );
        log(`    ids: ${dup.ids.map(String).join(', ')}`);
        log(`    statuses: ${dup.statuses.join(', ')}`);
      }
    }
    log(
      '\n⚠️ Resolver os duplicados manualmente (cancelar/eliminar o mais recente) antes do deploy do índice.',
    );
  } else {
    log('\n✅ Nenhum duplicado detectado — seguro promover o índice.');
  }

  await mongoose.disconnect();
  log('\nDesconectado. Pronto.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[backfill-ocupa-slot] FATAL:', err);
  process.exit(1);
});
