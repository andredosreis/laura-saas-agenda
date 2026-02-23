/**
 * Script de Migração: laura-saas → tenant_<id> (database-per-tenant)
 *
 * Execução:
 *   node src/scripts/migrateTenantData.js
 *   node src/scripts/migrateTenantData.js --dry-run   (simula sem escrever)
 *   node src/scripts/migrateTenantData.js --tenant <id> (migra só um tenant)
 *
 * Pré-requisitos:
 *   - MONGODB_URI configurado no .env
 *   - Backup da DB feito antes de executar
 *
 * O script é idempotente: pode ser re-executado com segurança.
 * Os dados originais em laura-saas NÃO são apagados por este script.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// --- Configuração ---
const SOURCE_DB = 'laura-saas';
const TENANT_DB_PREFIX = 'tenant_';

// Collections de negócio a migrar (excluir tenants e users — ficam em laura-saas)
const BUSINESS_COLLECTIONS = [
  'clientes',
  'agendamentos',
  'pacotes',
  'comprapacotes',
  'transacaos',
  'pagamentos',
  'historicoatendimentos',
  'conversa',
  'schedules',
];

const isDryRun = process.argv.includes('--dry-run');
const tenantArg = process.argv.includes('--tenant')
  ? process.argv[process.argv.indexOf('--tenant') + 1]
  : null;

// --- Logging ---
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const logOk = (msg) => console.log(`[${new Date().toISOString()}] ✓ ${msg}`);
const logWarn = (msg) => console.warn(`[${new Date().toISOString()}] ⚠ ${msg}`);
const logErr = (msg) => console.error(`[${new Date().toISOString()}] ✗ ${msg}`);

// --- Helpers ---
async function getCollectionNames(db) {
  const collections = await db.listCollections().toArray();
  return collections.map(c => c.name);
}

async function migrateCollection(sourceDb, destDb, collectionName, tenantId, tenantIdStr) {
  const sourceCol = sourceDb.collection(collectionName);
  const destCol = destDb.collection(collectionName);

  // Buscar docs deste tenant na source
  const docs = await sourceCol.find({ tenantId: new mongoose.Types.ObjectId(tenantIdStr) }).toArray();

  if (docs.length === 0) {
    log(`  ${collectionName}: 0 documentos — a saltar`);
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  // Verificar quantos já existem no destino (idempotência)
  const existingIds = new Set(
    (await destCol.find({ _id: { $in: docs.map(d => d._id) } }).project({ _id: 1 }).toArray())
      .map(d => d._id.toString())
  );

  const toInsert = docs.filter(d => !existingIds.has(d._id.toString()));

  log(`  ${collectionName}: ${docs.length} total, ${toInsert.length} novos, ${existingIds.size} já existentes`);

  if (toInsert.length === 0) {
    return { migrated: 0, skipped: existingIds.size, errors: 0 };
  }

  if (isDryRun) {
    logWarn(`  [DRY-RUN] Não inseriu ${toInsert.length} documentos em ${collectionName}`);
    return { migrated: 0, skipped: existingIds.size, errors: 0 };
  }

  try {
    await destCol.insertMany(toInsert, { ordered: false });
    logOk(`  ${collectionName}: ${toInsert.length} documentos inseridos`);
    return { migrated: toInsert.length, skipped: existingIds.size, errors: 0 };
  } catch (err) {
    // insertMany com ordered:false — erros de duplicados são ignorados
    if (err.code === 11000) {
      logWarn(`  ${collectionName}: alguns duplicados ignorados`);
      return { migrated: toInsert.length - (err.writeErrors?.length || 0), skipped: existingIds.size, errors: err.writeErrors?.length || 0 };
    }
    throw err;
  }
}

async function verifyMigration(sourceDb, destDb, collectionName, tenantIdStr) {
  const sourceCol = sourceDb.collection(collectionName);
  const destCol = destDb.collection(collectionName);

  const sourceCount = await sourceCol.countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantIdStr) });
  const destCount = await destCol.countDocuments({});

  const ok = sourceCount === destCount;
  if (ok) {
    logOk(`  Verificação ${collectionName}: ${destCount}/${sourceCount} ✓`);
  } else {
    logErr(`  Verificação ${collectionName}: destino=${destCount} origem=${sourceCount} — DIVERGÊNCIA`);
  }
  return ok;
}

// --- Main ---
async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    logErr('MONGODB_URI não definido no .env');
    process.exit(1);
  }

  if (isDryRun) log('=== MODO DRY-RUN — Nenhum dado será escrito ===');

  log('A ligar ao MongoDB...');
  const client = await mongoose.connect(mongoUri);
  const nativeConn = mongoose.connection.getClient();

  const sourceDb = nativeConn.db(SOURCE_DB);

  // Buscar todos os tenants (ou só o especificado)
  const tenantsCol = sourceDb.collection('tenants');
  const tenantQuery = tenantArg ? { _id: new mongoose.Types.ObjectId(tenantArg) } : {};
  const tenants = await tenantsCol.find(tenantQuery).toArray();

  if (tenants.length === 0) {
    logWarn('Nenhum tenant encontrado. A sair.');
    await mongoose.disconnect();
    return;
  }

  log(`Tenants a migrar: ${tenants.length}`);

  const report = [];

  for (const tenant of tenants) {
    const tenantIdStr = tenant._id.toString();
    const destDbName = `${TENANT_DB_PREFIX}${tenantIdStr}`;
    const destDb = nativeConn.db(destDbName);

    log(`\n--- Tenant: ${tenant.nomeEmpresa || tenantIdStr} (${tenantIdStr}) → ${destDbName} ---`);

    const tenantReport = {
      tenantId: tenantIdStr,
      nome: tenant.nomeEmpresa,
      db: destDbName,
      collections: {},
      verificacao: {},
      sucesso: true
    };

    // Migrar cada collection
    for (const colName of BUSINESS_COLLECTIONS) {
      try {
        const resultado = await migrateCollection(sourceDb, destDb, colName, tenant._id, tenantIdStr);
        tenantReport.collections[colName] = resultado;
      } catch (err) {
        logErr(`  Erro em ${colName}: ${err.message}`);
        tenantReport.collections[colName] = { error: err.message };
        tenantReport.sucesso = false;
      }
    }

    // Verificar integridade
    if (!isDryRun) {
      log(`  Verificando integridade...`);
      for (const colName of BUSINESS_COLLECTIONS) {
        try {
          const ok = await verifyMigration(sourceDb, destDb, colName, tenantIdStr);
          tenantReport.verificacao[colName] = ok;
          if (!ok) tenantReport.sucesso = false;
        } catch (err) {
          logErr(`  Verificação falhou para ${colName}: ${err.message}`);
          tenantReport.verificacao[colName] = false;
          tenantReport.sucesso = false;
        }
      }
    }

    report.push(tenantReport);
  }

  // Sumário final
  console.log('\n=== SUMÁRIO DA MIGRAÇÃO ===');
  let totalMigrado = 0;
  let totalErros = 0;
  for (const r of report) {
    const status = r.sucesso ? '✓' : '✗';
    console.log(`${status} ${r.nome || r.tenantId} → ${r.db}`);
    for (const [col, res] of Object.entries(r.collections)) {
      if (res.error) {
        console.log(`    ✗ ${col}: ERRO — ${res.error}`);
        totalErros++;
      } else {
        const migrated = res.migrated || 0;
        totalMigrado += migrated;
        if (migrated > 0) console.log(`    ✓ ${col}: ${migrated} migrados`);
      }
    }
  }

  console.log(`\nTotal migrado: ${totalMigrado} documentos | Erros: ${totalErros}`);
  if (isDryRun) console.log('(Dry-run: nenhum dado foi escrito)');
  console.log('\nOs dados originais em laura-saas permanecem intactos.');
  console.log('Quando o sistema estiver estável, apague manualmente os documentos migrados da DB partilhada.');

  await mongoose.disconnect();
  log('Desligado do MongoDB. Migração concluída.');
}

main().catch(err => {
  logErr(`Erro fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
