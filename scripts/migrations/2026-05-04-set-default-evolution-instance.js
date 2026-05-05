/**
 * Migration: 2026-05-04 — set default Evolution `instanceName` no tenant piloto
 *
 * Contexto: ADR-021. Migra o sistema de instância partilhada `marcai`
 * para 1 instância Evolution por tenant, sem quebrar o tenant piloto.
 *
 * O que faz:
 *   - Para cada tenant `ativo`/`trial` SEM `whatsapp.instanceName`,
 *     atribui `whatsapp.instanceName = 'marcai'` (a única instância actual).
 *
 * Idempotente: tenants que já têm `instanceName` são ignorados.
 * Reversível: `--rollback` remove `instanceName='marcai'` (não toca em outros valores).
 * Dry-run: default. Para aplicar, passa `--apply`.
 *
 * Uso:
 *   node scripts/migrations/2026-05-04-set-default-evolution-instance.js [--apply] [--rollback]
 *
 * Variáveis de ambiente requeridas:
 *   MONGODB_URI  (a mesma do servidor)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv-flow';
import Tenant from '../../src/models/Tenant.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ROLLBACK = args.has('--rollback');
const DEFAULT_INSTANCE = 'marcai';

if (APPLY && ROLLBACK) {
  console.error('Erro: --apply e --rollback são mutuamente exclusivos.');
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('Erro: MONGODB_URI não definido. Carrega .env ou exporta a variável.');
  process.exit(1);
}

const mode = ROLLBACK ? 'ROLLBACK' : APPLY ? 'APPLY' : 'DRY-RUN';

async function main() {
  console.log(`[migration] Modo: ${mode}`);
  console.log(`[migration] A ligar a MongoDB...`);
  await mongoose.connect(MONGODB_URI);

  if (ROLLBACK) {
    const candidates = await Tenant.find({
      'whatsapp.instanceName': DEFAULT_INSTANCE,
    }).select('_id nome whatsapp.instanceName').lean();

    console.log(`[migration] Tenants com instanceName='${DEFAULT_INSTANCE}': ${candidates.length}`);
    for (const t of candidates) {
      console.log(`  - ${t._id} | ${t.nome}`);
    }

    if (candidates.length === 0) {
      console.log('[migration] Nada a reverter.');
    } else if (APPLY) {
      const result = await Tenant.updateMany(
        { 'whatsapp.instanceName': DEFAULT_INSTANCE },
        { $unset: { 'whatsapp.instanceName': '' } }
      );
      console.log(`[migration] ✅ Reverted ${result.modifiedCount} tenant(s)`);
    } else {
      console.log('[migration] (dry-run — sem --apply, nenhuma alteração persistida)');
    }
  } else {
    // Modo apply ou dry-run normal
    const candidates = await Tenant.find({
      'plano.status': { $in: ['ativo', 'trial'] },
      $or: [
        { 'whatsapp.instanceName': { $exists: false } },
        { 'whatsapp.instanceName': null },
        { 'whatsapp.instanceName': '' },
      ],
    }).select('_id nome whatsapp').lean();

    console.log(`[migration] Tenants candidatos para set instanceName='${DEFAULT_INSTANCE}': ${candidates.length}`);
    for (const t of candidates) {
      console.log(`  - ${t._id} | ${t.nome} | provider=${t.whatsapp?.provider || 'n/a'}`);
    }

    // Aviso de segurança: se houver mais que 1 candidato, não atribuir 'marcai' a todos
    // sem confirmação extra (o nome é unique, ia falhar no segundo). Idempotente: só
    // atribui ao primeiro tenant ativo, deixando os outros para configuração manual.
    if (candidates.length > 1) {
      console.warn(`[migration] ⚠️ Mais que 1 tenant candidato. 'marcai' é unique — só o primeiro receberá o nome.`);
      console.warn(`[migration]    Os restantes precisam de configuração manual com instanceName próprio.`);
    }

    if (candidates.length === 0) {
      console.log('[migration] Nenhum tenant precisa de migração — todos já têm instanceName.');
    } else if (APPLY) {
      const target = candidates[0];
      try {
        const result = await Tenant.updateOne(
          { _id: target._id, 'whatsapp.instanceName': { $in: [null, undefined, ''] } },
          { $set: { 'whatsapp.instanceName': DEFAULT_INSTANCE } }
        );
        console.log(`[migration] ✅ Tenant "${target.nome}" → instanceName='${DEFAULT_INSTANCE}' (modified=${result.modifiedCount})`);
      } catch (err) {
        if (err.code === 11000) {
          console.error(`[migration] ❌ Conflito de unique index. instanceName='${DEFAULT_INSTANCE}' já está em uso.`);
        } else {
          throw err;
        }
      }
    } else {
      console.log('[migration] (dry-run — sem --apply, nenhuma alteração persistida)');
    }
  }

  await mongoose.disconnect();
  console.log('[migration] Concluído.');
}

main().catch((err) => {
  console.error('[migration] ❌ Erro fatal:', err);
  process.exit(1);
});
