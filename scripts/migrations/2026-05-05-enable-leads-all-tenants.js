/**
 * Migration: 2026-05-05 — activar leadsAtivo para todos os tenants existentes
 *
 * Contexto: Phase 1 do módulo de Leads.
 * O campo `limites.leadsAtivo` foi adicionado ao schema Tenant com default `false`.
 * Este script activa-o para todos os tenants `ativo`/`trial` existentes.
 *
 * Idempotente: tenants já com `leadsAtivo: true` são ignorados.
 * Reversível: `--rollback` desactiva de volta para `false`.
 * Dry-run: default. Para aplicar, passa `--apply`.
 *
 * Uso:
 *   node scripts/migrations/2026-05-05-enable-leads-all-tenants.js [--apply] [--rollback]
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const APPLY    = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const DRY_RUN  = !APPLY && !ROLLBACK;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI não definido. Copia o .env antes de correr.');
  process.exit(1);
}

const TenantSchema = new mongoose.Schema({}, { strict: false });
const Tenant = mongoose.model('Tenant', TenantSchema);

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅  Ligado ao MongoDB');

  if (DRY_RUN) {
    const semFlag = await Tenant.countDocuments({
      'plano.status': { $in: ['ativo', 'trial'] },
      'limites.leadsAtivo': { $ne: true },
    });
    const jaAtivos = await Tenant.countDocuments({
      'plano.status': { $in: ['ativo', 'trial'] },
      'limites.leadsAtivo': true,
    });
    console.log(`\n[DRY-RUN]`);
    console.log(`  Tenants que seriam actualizados : ${semFlag}`);
    console.log(`  Tenants já com leadsAtivo=true  : ${jaAtivos}`);
    console.log(`\nCorre com --apply para aplicar.`);
  } else if (ROLLBACK) {
    const res = await Tenant.updateMany(
      { 'limites.leadsAtivo': true },
      { $set: { 'limites.leadsAtivo': false } },
    );
    console.log(`\n[ROLLBACK] leadsAtivo → false em ${res.modifiedCount} tenant(s).`);
  } else {
    const res = await Tenant.updateMany(
      {
        'plano.status': { $in: ['ativo', 'trial'] },
        'limites.leadsAtivo': { $ne: true },
      },
      { $set: { 'limites.leadsAtivo': true } },
    );
    console.log(`\n[APPLY] leadsAtivo → true em ${res.modifiedCount} tenant(s).`);
  }

  await mongoose.disconnect();
  console.log('✅  Concluído.');
}

run().catch((err) => {
  console.error('❌  Erro:', err.message);
  process.exit(1);
});
