#!/usr/bin/env node
/**
 * Auditoria SÓ-LEITURA do resíduo de dados na BD partilhada (`laura-saas`).
 *
 * Contexto: desde a migração DB-per-tenant (ADR-001), os dados de negócio vivem
 * em `tenant_<id>`. A BD partilhada só devia conter `Tenant`, `User` e
 * `LidCapture`. Ficou lá, porém, um resíduo pré-migração (Jan–Fev 2026).
 *
 * Porque importa (RGPD): o export (F06) e o apagamento (F07) operam sobre
 * `req.models`, ou seja, a BD do tenant. Tudo o que estiver na partilhada é
 * invisível para o export e sobrevive a um pedido de apagamento.
 *
 * ⚠️ NÃO apagar às cegas: nem tudo é duplicado. Este script distingue
 * documentos que já existem no tenant (mesmo `_id`) dos que só existem na
 * partilhada — esses últimos perder-se-iam.
 *
 * Uso:  node scripts/tools/auditar-residuo-bd-partilhada.mjs [tenantId]
 * Este script NUNCA escreve. Não tem modo de apagamento por desenho.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const TENANT_ID = process.argv[2] || '695413fb6ce936a9097af750';
const COLECCOES = [
  'clientes', 'agendamentos', 'comprapacotes', 'transacaos', 'pagamentos',
  'historicoatendimentos', 'conversas', 'mensagems', 'leads', 'pacotes', 'schedules',
];

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI não definido.');
  process.exit(1);
}

await mongoose.connect(uri);
const partilhada = mongoose.connection.db;
const tenantDb = mongoose.connection.useDb(`tenant_${TENANT_ID}`);

console.log(`BD partilhada: ${partilhada.databaseName}`);
console.log(`BD do tenant:  tenant_${TENANT_ID}\n`);
console.log('colecção              | partilhada | no tenant (=_id) | SÓ na partilhada');
console.log('----------------------|------------|------------------|------------------');

const orfaosPorColeccao = {};
for (const col of COLECCOES) {
  const naPartilhada = await partilhada.collection(col).find({}, { projection: { _id: 1 } }).toArray();
  if (naPartilhada.length === 0) continue;

  const noTenant = await tenantDb.collection(col).find({}, { projection: { _id: 1 } }).toArray();
  const idsTenant = new Set(noTenant.map((d) => String(d._id)));
  const orfaos = naPartilhada.filter((d) => !idsTenant.has(String(d._id)));
  orfaosPorColeccao[col] = orfaos.map((d) => String(d._id));

  const marca = orfaos.length > 0 ? `⚠️  ${orfaos.length}` : '0';
  console.log(
    `${col.padEnd(21)} | ${String(naPartilhada.length).padStart(10)} | ` +
    `${String(naPartilhada.length - orfaos.length).padStart(16)} | ${marca}`,
  );
}

const totalOrfaos = Object.values(orfaosPorColeccao).flat().length;
console.log('\n' + '='.repeat(70));
if (totalOrfaos === 0) {
  console.log('Todo o resíduo existe também na BD do tenant (mesmo _id).');
  console.log('Apagar a cópia da partilhada não perde dados — decisão do André.');
} else {
  console.log(`⚠️  ${totalOrfaos} documento(s) existem APENAS na BD partilhada.`);
  console.log('Apagá-los perde dados. Decidir caso a caso (migrar vs eliminar) antes de mexer.');
  for (const [col, ids] of Object.entries(orfaosPorColeccao)) {
    if (ids.length) console.log(`   ${col}: ${ids.join(', ')}`);
  }
}
console.log('='.repeat(70));

await mongoose.disconnect();
