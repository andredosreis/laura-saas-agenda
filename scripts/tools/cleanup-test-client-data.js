// Cleanup test-CLIENT artifacts for the Client Lifecycle E2E flow.
//
// Mirrors cleanup-test-phone-data.js (which targets leads), but for an
// EXISTING CLIENT: removes Mensagens + Conversa (by phone) and the
// Agendamentos the IA created for that client. The Cliente record itself
// is KEPT — it's the reusable test client.
//
// Safe by construction: scoped to the phone variants + the marcai tenant.
//
// Usage:
//   node scripts/tools/cleanup-test-client-data.js              # default 351912462033
//   node scripts/tools/cleanup-test-client-data.js 351900000000 # override
//
// Exit code 0 on success, 1 on any failure.

import 'dotenv-flow/config';
import mongoose from 'mongoose';

import Tenant from '../../src/models/Tenant.js';
import { getTenantDB } from '../../src/config/tenantDB.js';
import { getModels } from '../../src/models/registry.js';

const RAW = (process.argv[2] || '351912462033').replace(/\D/g, '');
const BASE = RAW.replace(/^351/, '');
const VARIANTS = [...new Set([RAW, `351${BASE}`, BASE])];
const INSTANCE = 'marcai';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const tenant = await Tenant.findOne({ 'whatsapp.instanceName': INSTANCE }).lean();
  if (!tenant) {
    console.error(`✗ Tenant ${INSTANCE} not found`);
    process.exit(1);
  }

  const db = getTenantDB(tenant._id.toString());
  const { Cliente, Mensagem, Conversa, Agendamento } = getModels(db);

  const cliente = await Cliente.findOne({
    tenantId: tenant._id,
    telefone: { $in: VARIANTS },
  }).lean();

  const beforeMsg = await Mensagem.countDocuments({ tenantId: tenant._id, telefone: { $in: VARIANTS } });
  await Mensagem.deleteMany({ tenantId: tenant._id, telefone: { $in: VARIANTS } });
  const conv = await Conversa.deleteMany({ tenantId: tenant._id, telefone: { $in: VARIANTS } });

  let appDeleted = 0;
  if (cliente) {
    const r = await Agendamento.deleteMany({
      tenantId: tenant._id,
      cliente: cliente._id,
      criadoPorIA: true,
    });
    appDeleted = r.deletedCount;
    // Reactiva a IA (pode ter sido pausada pela auto-pausa off-topic) para
    // o proximo teste comecar fresco.
    await Cliente.updateOne({ _id: cliente._id, tenantId: tenant._id }, { iaAtiva: true });
  }

  console.log(`🧹 Cleanup CLIENT OK (tenant ${INSTANCE}, phones ${VARIANTS.join(', ')}):`);
  console.log(`   Cliente:         ${cliente ? `kept (${cliente.nome})` : 'not found'}`);
  console.log(`   Mensagens:       ${beforeMsg} removed`);
  console.log(`   Conversas:       ${conv.deletedCount} removed`);
  console.log(`   Agendamentos IA: ${appDeleted} removed`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('✗ Cleanup failed:', err.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
