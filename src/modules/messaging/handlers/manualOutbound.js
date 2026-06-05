/**
 * manualOutbound handler — grava no inbox as respostas que a profissional
 * escreve directamente no telemóvel pessoal (eventos `fromMe` do Evolution).
 *
 * Objetivo: ter a conversa COMPLETA registada no sistema, incluindo o que a
 * Laura responde fora do inbox web, para se poder observar o comportamento e
 * afinar a IA.
 *
 * Importante: NÃO invoca a IA nem o routing — apenas persiste. A guard de
 * `fromMe` no webhook continua a impedir que a IA reaja às próprias mensagens.
 *
 * Handoff automático: ao gravar uma resposta manual real, pausa a IA neste
 * contacto (`Cliente/Lead.iaAtiva = false`) para o cliente não receber resposta
 * dupla (humano + IA). Re-activar é manual, pelo toggle do inbox.
 *
 * Dedup do "eco": tudo o que o próprio sistema envia (IA, lembretes, resposta
 * pelo inbox web) também regressa do Evolution como `fromMe`. Essas saídas já
 * foram gravadas no momento do envio, por isso ignoramos um `fromMe` cujo texto
 * já exista como saída recente (janela curta). Limitação conhecida: duas saídas
 * manuais com texto idêntico dentro da janela são tratadas como uma só.
 */

import { resolveTenantByInstance } from '../webhookState.js';
import logger from '../../../utils/logger.js';
import { telefoneHash } from '../../../utils/telefoneHash.js';

// Janela para considerar uma saída idêntica como "eco" de um envio já gravado.
const ECHO_WINDOW_MS = 60 * 1000;

/** Telefone canónico (dígitos, sem indicativo 351) — chave "um número = uma conversa". */
function canonicalPhone(raw) {
  return String(raw || '').replace(/\D/g, '').replace(/^351/, '');
}

/** Variantes para casar a conversa guardada em formatos diferentes (com/sem 351). */
function phoneVariants(raw) {
  const base = canonicalPhone(raw);
  return [...new Set([base, `351${base}`])];
}

/**
 * Persiste uma mensagem de saída escrita manualmente no telemóvel.
 *
 * @param {object} args
 * @param {string|null} args.instanceName       instância Evolution (resolve o tenant)
 * @param {string} args.telefoneNormalizado     dígitos do nº do cliente (destinatário)
 * @param {string} args.mensagem                texto enviado
 * @param {Date}   [args.timestamp]             instante real da mensagem (ordenação)
 * @returns {Promise<{ persisted: boolean, reason?: string }>}
 */
export async function persistManualOutbound({ instanceName, telefoneNormalizado, mensagem, timestamp }) {
  const ctx = await resolveTenantByInstance(instanceName);
  if (!ctx) return { persisted: false, reason: 'tenant_unresolved' };

  const { models, tenantId } = ctx;
  if (!models?.Mensagem || !models?.Conversa) return { persisted: false, reason: 'no_models' };

  const variants = phoneVariants(telefoneNormalizado);

  // Dedup do eco: a mesma saída já foi gravada no envio (IA/lembrete/inbox)?
  const since = new Date(Date.now() - ECHO_WINDOW_MS);
  const echo = await models.Mensagem.findOne({
    tenantId,
    telefone: { $in: variants },
    direcao: 'saida',
    mensagem,
    data: { $gte: since },
  })
    .select('_id')
    .lean();
  if (echo) return { persisted: false, reason: 'echo_dup' };

  // Garante a Conversa (mesma thread do cliente — casa por variantes do nº).
  let conversa = await models.Conversa
    .findOne({ tenantId, telefone: { $in: variants } })
    .select('_id')
    .lean();
  if (!conversa) {
    conversa = await models.Conversa.create({
      tenantId,
      telefone: telefoneNormalizado,
      estado: 'aguardando_agendamento',
    });
  }

  await models.Mensagem.create({
    tenantId,
    telefone: telefoneNormalizado,
    mensagem,
    origem: 'laura',
    direcao: 'saida',
    geradoPor: 'humano',
    conversa: conversa._id,
    data: timestamp || new Date(),
  });

  // Pausa a IA neste contacto: a profissional assumiu a conversa pelo telemóvel,
  // por isso a IA não deve responder também (evita resposta dupla ao cliente).
  // Só corre para respostas manuais reais — o eco dos envios do próprio sistema
  // já saiu acima no dedup, logo a IA nunca se pausa a si própria.
  // Re-activar é manual, pelo toggle do inbox (handoff humano).
  const pauseOps = [];
  if (models.Cliente) {
    pauseOps.push(
      models.Cliente.updateMany(
        { tenantId, telefone: { $in: variants } },
        { $set: { iaAtiva: false } },
      ),
    );
  }
  if (models.Lead) {
    pauseOps.push(
      models.Lead.updateMany(
        { tenantId, telefone: { $in: variants } },
        { $set: { iaAtiva: false, ultimaInteracao: new Date() } },
      ),
    );
  }
  const pauseResults = await Promise.all(pauseOps);
  const paused = pauseResults.some((r) => (r?.matchedCount ?? r?.n ?? 0) > 0);

  logger.info(
    { tenant_id: tenantId, telefone_hash: telefoneHash(telefoneNormalizado), ia_paused: paused },
    'webhook_manual_outbound_persisted',
  );

  return { persisted: true, paused };
}
