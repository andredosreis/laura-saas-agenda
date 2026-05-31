// Read-only: mostra a conversa (mensagens in/out) de um telefone no tenant marcai.
// Util para inspeccionar o que a IA respondeu durante testes E2E.
//
// Usage:
//   node scripts/tools/show-test-messages.js 351939063214 [limit]

import 'dotenv-flow/config';
import mongoose from 'mongoose';

import Tenant from '../../src/models/Tenant.js';
import { getTenantDB } from '../../src/config/tenantDB.js';
import { getModels } from '../../src/models/registry.js';

const RAW = (process.argv[2] || '351912462033').replace(/\D/g, '');
const BASE = RAW.replace(/^351/, '');
const VARIANTS = [...new Set([RAW, `351${BASE}`, BASE])];
const LIMIT = parseInt(process.argv[3], 10) || 20;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tenant = await Tenant.findOne({ 'whatsapp.instanceName': 'marcai' }).lean();
  if (!tenant) { console.error('✗ Tenant marcai not found'); process.exit(1); }

  const db = getTenantDB(tenant._id.toString());
  const { Mensagem, Cliente } = getModels(db);

  const cliente = await Cliente.findOne({ tenantId: tenant._id, telefone: { $in: VARIANTS } })
    .select('nome telefone').lean();

  const msgs = await Mensagem.find({ tenantId: tenant._id, telefone: { $in: VARIANTS } })
    .sort({ data: 1, createdAt: 1 })
    .limit(LIMIT)
    .select('mensagem origem direcao data createdAt')
    .lean();

  console.log(`Cliente: ${cliente ? cliente.nome : '(desconhecido)'}  |  ${VARIANTS.join(', ')}`);
  console.log(`Mensagens: ${msgs.length}\n`);
  for (const m of msgs) {
    const who = m.direcao === 'entrada' ? '👤 cliente' : '🤖 Laura ';
    const ts = (m.data || m.createdAt);
    const hh = ts?.toISOString ? ts.toISOString().slice(11, 19) : '';
    console.log(`[${hh}] ${who}: ${m.mensagem}`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('✗', e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
