/**
 * MIGRAÇÃO F03 (ADR-028 Fase 2) — Semear `Schedule` + `ScheduleException`
 * a partir das regras hardcoded do `ia-service` (agent_business_rules.py).
 *
 * Depois desta migração, o painel (F01/F02) passa a ser a fonte única de
 * disponibilidade; a IA lê do endpoint `/api/internal/disponibilidade` (F03)
 * e deixa de depender de `RULES_PER_TENANT` / `DATE_OVERRIDES_PER_TENANT`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SEGURANÇA — o `.env` local aponta para o cluster Atlas de PRODUÇÃO.
 *   • Dry-run é o modo por defeito: NÃO escreve nada, só imprime o plano.
 *   • `--apply` / `--rollback` / `--force` são RECUSADOS contra um URI de
 *     produção (Atlas / mongodb+srv) a menos que se passe explicitamente
 *     `--i-understand-prod`. Isto evita escritas acidentais em produção.
 *   • Em testes, importa-se `seedTenant()` directamente e injectam-se os
 *     models de um `mongodb-memory-server` — nunca se corre o CLI contra prod.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Uso:
 *   node src/migrations/seedScheduleFromAgentRules.js                    # dry-run do seed
 *   node src/migrations/seedScheduleFromAgentRules.js --apply            # escreve o seed
 *   node src/migrations/seedScheduleFromAgentRules.js --rollback         # dry-run do rollback (só mostra o plano)
 *   node src/migrations/seedScheduleFromAgentRules.js --rollback --apply # DESFAZ de facto
 *   node src/migrations/seedScheduleFromAgentRules.js --apply --force    # ignora guarda de customização
 *
 * Idempotente: re-correr `--apply` não muda nada. Preserva dias-base E
 * excepções que o dono já personalizou (só escreve dias ainda no default do
 * `initializeSchedules`; excepções existentes com valores diferentes do seed
 * são preservadas salvo --force). O rollback só remove excepções cuja
 * observação é a marca do seed — nunca dados criados pelo dono.
 */

import dotenv from 'dotenv-flow';
import mongoose from 'mongoose';

import { getTenantDB } from '../config/tenantDB.js';
import { getModels } from '../models/registry.js';

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════
// Snapshot estático das regras Python (agent_business_rules.py) — D7.
// Só tenants reais (o `_default` do Python não é um tenant, não se semeia).
// ═══════════════════════════════════════════════════════════════════════
export const RULES_SNAPSHOT = {
  // L.A. Estética Avançada (Laura) — pilot
  '695413fb6ce936a9097af750': {
    monday: { start: '09:00', end: '19:00', break_start: '12:00', break_end: '13:00' },
    tuesday: { start: '09:00', end: '19:00', break_start: '12:00', break_end: '13:00' },
    wednesday: { start: '09:00', end: '19:00', break_start: '12:00', break_end: '13:00' },
    thursday: { start: '09:00', end: '19:00', break_start: '12:00', break_end: '13:00' },
    friday: { start: '09:00', end: '19:00', break_start: '12:00', break_end: '13:00' },
    saturday: { start: '09:00', end: '13:00' }, // 4h sem pausa
    sunday: null, // fechado
  },
};

export const DATE_OVERRIDES_SNAPSHOT = {
  '695413fb6ce936a9097af750': {
    '2026-12-25': null, // Natal
    '2026-06-03': null,
    '2026-06-04': null,
    '2026-06-10': null,
  },
};

// Python weekday name → Mongo dayOfWeek (0=Domingo .. 6=Sábado) + label.
const WEEKDAY_MAP = {
  monday: { dayOfWeek: 1, label: 'Segunda-feira' },
  tuesday: { dayOfWeek: 2, label: 'Terça-feira' },
  wednesday: { dayOfWeek: 3, label: 'Quarta-feira' },
  thursday: { dayOfWeek: 4, label: 'Quinta-feira' },
  friday: { dayOfWeek: 5, label: 'Sexta-feira' },
  saturday: { dayOfWeek: 6, label: 'Sábado' },
  sunday: { dayOfWeek: 0, label: 'Domingo' },
};

// Default do `initializeSchedules` (defaults do schema Schedule) — usado para
// detectar dias "por tocar" (writable) vs personalizados (preserved).
export const DEFAULT_SCHEDULE_FIELDS = {
  isActive: false,
  startTime: '09:00',
  endTime: '18:00',
  breakStartTime: '12:00',
  breakEndTime: '13:00',
};

const MANAGED_FIELDS = ['isActive', 'startTime', 'endTime', 'breakStartTime', 'breakEndTime'];

// Marca escrita na `observacao` das excepções semeadas — é o que permite ao
// rollback distinguir excepções da migração de excepções criadas pelo dono.
export const SEED_OBSERVACAO = 'Seed F03 (migração agent_business_rules)';

// Converte uma DayRule Python (ou null=fechado) nos campos Mongo geridos.
export function mapDayRuleToScheduleFields(rule) {
  if (rule == null) {
    // Fechado → inactivo com tempos default (== DEFAULT_SCHEDULE_FIELDS).
    return { ...DEFAULT_SCHEDULE_FIELDS };
  }
  return {
    isActive: true,
    startTime: rule.start,
    endTime: rule.end,
    breakStartTime: rule.break_start ?? null,
    breakEndTime: rule.break_end ?? null,
  };
}

function sameManagedFields(a, b) {
  return MANAGED_FIELDS.every((f) => (a?.[f] ?? null) === (b?.[f] ?? null));
}

// Converte um override de data Python nos campos ScheduleException.
export function mapDateOverrideToException(override) {
  if (override == null) {
    return { tipo: 'fechado', inicio: null, fim: null };
  }
  return { tipo: 'horario-especial', inicio: override.start, fim: override.end };
}

/**
 * Semeia (ou desfaz) o Schedule + ScheduleException de UM tenant.
 * Puro em termos de I/O: recebe os models já resolvidos, por isso é testável
 * com `mongodb-memory-server` sem tocar em produção.
 *
 * @param {object} args
 * @param {import('mongoose').Model} args.Schedule
 * @param {import('mongoose').Model} args.ScheduleException
 * @param {string} args.tenantId
 * @param {object} args.rules      — snapshot { dayName: DayRule|null }
 * @param {object} args.overrides  — snapshot { "YYYY-MM-DD": override|null }
 * @param {boolean} [args.apply]   — escreve (false = dry-run)
 * @param {boolean} [args.force]   — ignora a guarda de customização
 * @param {boolean} [args.rollback]
 * @returns {Promise<{ days: object[], exceptions: object[] }>} relatório de acções
 */
export async function seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply = false, force = false, rollback = false }) {
  const report = { dedup: [], days: [], exceptions: [] };

  // ── Dedup preventivo ──────────────────────────────────────────────────
  // O índice único { tenantId, dayOfWeek } (novo em F03) não constrói se já
  // existirem duplicados históricos (corrida antiga do initializeSchedules).
  // Mantém o doc mais recente por dia; remove os restantes (só com apply).
  const allDays = await Schedule.find({ tenantId }).sort({ updatedAt: -1 }).lean();
  const seenDow = new Set();
  const duplicateIds = [];
  for (const doc of allDays) {
    const key = String(doc.dayOfWeek);
    if (seenDow.has(key)) duplicateIds.push(doc._id);
    else seenDow.add(key);
  }
  if (duplicateIds.length > 0) {
    report.dedup.push({ count: duplicateIds.length, action: apply ? 'removed' : 'would remove' });
    if (apply) {
      await Schedule.deleteMany({ _id: { $in: duplicateIds }, tenantId });
    }
  }

  if (rollback) {
    // Reset dos dias-base semeados de volta ao default; remoção das excepções semeadas.
    for (const [dayName, rule] of Object.entries(rules)) {
      const { dayOfWeek, label } = WEEKDAY_MAP[dayName];
      const target = mapDayRuleToScheduleFields(rule);
      const existing = await Schedule.findOne({ tenantId, dayOfWeek }).lean();
      if (existing && sameManagedFields(existing, target)) {
        report.days.push({ dayOfWeek, label, action: apply ? 'reset-to-default' : 'would reset-to-default' });
        if (apply) {
          await Schedule.updateOne({ tenantId, dayOfWeek }, { $set: { label, ...DEFAULT_SCHEDULE_FIELDS } });
        }
      } else {
        report.days.push({ dayOfWeek, label, action: 'skip (não corresponde ao seed)' });
      }
    }
    for (const [data, override] of Object.entries(overrides)) {
      const target = mapDateOverrideToException(override);
      const existing = await ScheduleException.findOne({ tenantId, data }).lean();
      const matchesSeedValues = existing
        && existing.tipo === target.tipo
        && (existing.inicio ?? null) === (target.inicio ?? null)
        && (existing.fim ?? null) === (target.fim ?? null);
      // Só remove o que a MIGRAÇÃO escreveu (marca na observação) — nunca uma
      // excepção do dono que por coincidência tenha os mesmos valores.
      if (matchesSeedValues && existing.observacao === SEED_OBSERVACAO) {
        report.exceptions.push({ data, action: apply ? 'removed' : 'would remove' });
        if (apply) await ScheduleException.deleteOne({ tenantId, data });
      } else {
        report.exceptions.push({ data, action: 'skip (não corresponde ao seed)' });
      }
    }
    return report;
  }

  // ── Semear dias-base (com guarda de customização) ──
  for (const [dayName, rule] of Object.entries(rules)) {
    const { dayOfWeek, label } = WEEKDAY_MAP[dayName];
    const target = mapDayRuleToScheduleFields(rule);
    const existing = await Schedule.findOne({ tenantId, dayOfWeek }).lean();

    let action;
    let write = false;
    if (!existing) {
      action = 'would write'; write = true;
    } else if (sameManagedFields(existing, target)) {
      action = 'unchanged (idempotente)'; write = false;
    } else if (sameManagedFields(existing, DEFAULT_SCHEDULE_FIELDS)) {
      action = 'would write'; write = true;
    } else if (force) {
      action = 'would write (forced)'; write = true;
    } else {
      action = 'preserved (customizado)'; write = false;
    }

    report.days.push({ dayOfWeek, label, action });
    if (apply && write) {
      await Schedule.updateOne(
        { tenantId, dayOfWeek },
        { $set: { label, ...target }, $setOnInsert: { tenantId, dayOfWeek } },
        { upsert: true }
      );
      report.days[report.days.length - 1].action = force && action.includes('forced') ? 'written (forced)' : 'written';
    }
  }

  // ── Semear excepções por data (com guarda de customização, como os dias) ──
  for (const [data, override] of Object.entries(overrides)) {
    const target = mapDateOverrideToException(override);
    const existing = await ScheduleException.findOne({ tenantId, data }).lean();
    const same = existing && existing.tipo === target.tipo && (existing.inicio ?? null) === (target.inicio ?? null) && (existing.fim ?? null) === (target.fim ?? null);

    let action;
    let write = false;
    if (!existing) {
      action = 'would write'; write = true;
    } else if (same) {
      action = 'unchanged (idempotente)'; write = false;
    } else if (force) {
      action = 'would write (forced)'; write = true;
    } else {
      // A dona já criou uma excepção diferente para esta data (F02 UI) —
      // preservar; o seed nunca sobrepõe dados do dono sem --force.
      action = 'preserved (customizado)'; write = false;
    }

    report.exceptions.push({ data, action });
    if (apply && write) {
      await ScheduleException.updateOne(
        { tenantId, data },
        { $set: { ...target, observacao: SEED_OBSERVACAO }, $setOnInsert: { tenantId, data } },
        { upsert: true }
      );
      report.exceptions[report.exceptions.length - 1].action = force && action.includes('forced') ? 'written (forced)' : 'written';
    }
  }

  return report;
}

// ── Guarda de produção ─────────────────────────────────────────────────
// Postura fail-closed: só URIs claramente LOCAIS dispensam confirmação.
// Qualquer outro destino (Atlas, IP remoto, túnel SSH…) exige
// --i-understand-prod, porque um túnel para o cluster de produção não
// contém nem `mongodb+srv` nem `.mongodb.net` nem o marcador do cluster.
function looksLikeProd(uri) {
  if (!uri) return false;
  const isLocal = /mongodb:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/i.test(uri);
  return !isLocal;
}

// ── CLI ─────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const rollback = args.includes('--rollback');
  const force = args.includes('--force');
  const iUnderstandProd = args.includes('--i-understand-prod');
  // Só `--apply` escreve. `--rollback` sozinho é um dry-run do rollback;
  // para desfazer de facto é preciso `--rollback --apply`.
  const writes = apply;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI não definido.');
    process.exit(1);
  }

  if (writes && looksLikeProd(uri) && !iUnderstandProd) {
    console.error('🛑 RECUSADO: o MONGODB_URI parece ser PRODUÇÃO (Atlas).');
    console.error('   Esta migração escreveria dados reais. Corre em dry-run (sem flags)');
    console.error('   ou, se realmente pretendes escrever em produção com backup feito,');
    console.error('   junta explicitamente --i-understand-prod.');
    process.exit(1);
  }

  const mode = rollback
    ? (apply ? 'ROLLBACK' : 'DRY-RUN (rollback — junta --apply para desfazer de facto)')
    : (apply ? 'APPLY' : 'DRY-RUN');
  console.log(`🚀 seedScheduleFromAgentRules — modo ${mode}${force ? ' (force)' : ''}`);
  console.log(`📡 A ligar a ${uri.replace(/\/\/[^@]*@/, '//***@')}`);

  await mongoose.connect(uri);
  try {
    for (const tenantId of Object.keys(RULES_SNAPSHOT)) {
      const models = getModels(getTenantDB(tenantId));
      const report = await seedTenant({
        Schedule: models.Schedule,
        ScheduleException: models.ScheduleException,
        tenantId,
        rules: RULES_SNAPSHOT[tenantId],
        overrides: DATE_OVERRIDES_SNAPSHOT[tenantId] || {},
        apply,
        force,
        rollback,
      });
      console.log(`\n🏢 Tenant ${tenantId}`);
      if (report.dedup.length > 0) {
        console.log('   Duplicados (tenantId, dayOfWeek):');
        for (const d of report.dedup) console.log(`     - ${d.count} doc(s): ${d.action}`);
      }
      console.log('   Dias base:');
      for (const d of report.days) console.log(`     - ${d.label} (dow ${d.dayOfWeek}): ${d.action}`);
      console.log('   Excepções por data:');
      for (const e of report.exceptions) console.log(`     - ${e.data}: ${e.action}`);
    }
    if (!writes) {
      console.log(`\nℹ️  DRY-RUN — nada foi escrito. Corre com ${rollback ? '--rollback --apply para desfazer' : '--apply para aplicar'}.`);
    } else {
      console.log(`\n✅ ${mode} concluído.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

// Executa só quando corrido directamente como CLI (não em import de teste).
const isDirectRun = process.argv[1] && process.argv[1].endsWith('seedScheduleFromAgentRules.js');
if (isDirectRun) {
  main().catch((err) => {
    console.error('❌ Erro na migração:', err);
    process.exit(1);
  });
}
