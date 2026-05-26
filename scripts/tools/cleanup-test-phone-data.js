// Cleanup test-phone artifacts (Lead, Mensagens, Conversa, Agendamentos) for
// a single phone number under the marcai tenant.
//
// Safe by construction: filters are scoped to one phone + the marcai
// tenant only. Will NOT touch any other lead. Used between E2E test
// sessions to start from a deterministic state.
//
// Usage:
//   node scripts/tools/cleanup-test-phone-data.js              # default phone 351912462033
//   node scripts/tools/cleanup-test-phone-data.js 351900000000 # override
//
// Exit code 0 on success, 1 on any failure.

import 'dotenv-flow/config';
import mongoose from 'mongoose';

import Tenant from '../../src/models/Tenant.js';
import { getTenantDB } from '../../src/config/tenantDB.js';
import { getModels } from '../../src/models/registry.js';

const TEL = process.argv[2] || '351912462033';
const INSTANCE = 'marcai';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const tenant = await Tenant.findOne({ 'whatsapp.instanceName': INSTANCE }).lean();
  if (!tenant) {
    console.error(`✗ Tenant ${INSTANCE} not found`);
    process.exit(1);
  }

  const db = getTenantDB(tenant._id.toString());
  const { Lead, Mensagem, Conversa, Agendamento } = getModels(db);

  const lead = await Lead.findOne({ tenantId: tenant._id, telefone: TEL }).lean();
  const conversaId = lead?.conversa || null;

  const beforeMsg = await Mensagem.countDocuments({ tenantId: tenant._id, telefone: TEL });
  const beforeApp = await Agendamento.countDocuments({ tenantId: tenant._id, 'lead.telefone': TEL });

  await Agendamento.deleteMany({ tenantId: tenant._id, 'lead.telefone': TEL });
  await Mensagem.deleteMany({ tenantId: tenant._id, telefone: TEL });
  if (conversaId) await Conversa.deleteOne({ _id: conversaId });
  const leadDeleted = await Lead.deleteOne({ tenantId: tenant._id, telefone: TEL });

  console.log(`🧹 Cleanup OK for ${TEL} (tenant ${INSTANCE}):`);
  console.log(`   Lead:         ${leadDeleted.deletedCount > 0 ? 'deleted' : 'not found'}${lead?.nome ? ` (was: ${lead.nome})` : ''}`);
  console.log(`   Mensagens:    ${beforeMsg} removed`);
  console.log(`   Conversa:     ${conversaId ? 'deleted' : 'not linked'}`);
  console.log(`   Agendamentos: ${beforeApp} removed`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('✗ Cleanup failed:', err.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
