/**
 * Follow-up pós-sessão (spec docs/superpowers/specs/2026-07-02-follow-up-pos-sessao-design.md).
 *
 * `avaliarFollowUp` e `buildFollowUpMensagem` são puras (testáveis sem DB);
 * `processFollowUpJob` (Task 4) faz o wiring DB + envio. Vive fora do
 * notificationWorker para não tocar no pipeline de lembretes existente.
 */
import { DateTime } from 'luxon';
import { getTenantDB } from '../config/tenantDB.js';
import { getModels } from '../models/registry.js';
import Tenant from '../models/Tenant.js';
import { sendWhatsAppMessage } from '../utils/evolutionClient.js';
import logger from '../utils/logger.js';

const ZONA = 'Europe/Lisbon';
const STATUS_CANCELADOS = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];

/**
 * Decide se o follow-up é enviado e com que variante.
 * Recebe docs .lean() (possivelmente null) — nenhum acesso a DB aqui.
 * Semântica das flags: ausente = activo; só bloqueia com `false` explícito.
 * Excepções fail-closed: tenant null (apagado após o job ser agendado — sem
 * ele o envio cairia na instância Evolution default) e plano.status
 * explicitamente inactivo bloqueiam sempre; plano ausente segue a regra geral.
 */
export function avaliarFollowUp({ agendamento, cliente, tenant, compra, jobDataHoraISO }) {
  if (!agendamento) return { enviar: false, motivo: 'inexistente' };

  if (
    STATUS_CANCELADOS.includes(agendamento.status) ||
    agendamento.confirmacao?.tipo === 'rejeitado'
  ) {
    return { enviar: false, motivo: 'cancelado' };
  }

  // Remarcado desde que o job foi agendado → o job antigo é órfão.
  if (jobDataHoraISO && agendamento.dataHora) {
    const intended = DateTime.fromISO(jobDataHoraISO, { zone: ZONA }).toMillis();
    const atual = DateTime.fromJSDate(new Date(agendamento.dataHora)).toMillis();
    if (Number.isFinite(intended) && Number.isFinite(atual) && intended !== atual) {
      return { enviar: false, motivo: 'remarcado' };
    }
  }

  if (!agendamento.cliente || !cliente) return { enviar: false, motivo: 'sem_cliente' };
  if (agendamento.followUp?.enviadoEm) return { enviar: false, motivo: 'ja_enviado' };
  if (!tenant) return { enviar: false, motivo: 'tenant_inexistente' };
  if (tenant.plano?.status && !['ativo', 'trial'].includes(tenant.plano.status)) {
    return { enviar: false, motivo: 'plano_inativo' };
  }
  if (tenant?.configuracoes?.iaGlobalAtiva === false) return { enviar: false, motivo: 'ia_global_off' };
  if (tenant?.configuracoes?.followUpPosSessaoAtivo === false) return { enviar: false, motivo: 'followup_off' };
  if (cliente.iaAtiva === false) return { enviar: false, motivo: 'ia_cliente_off' };
  if (!cliente.telefone) return { enviar: false, motivo: 'sem_telefone' };

  let pacote = null;
  if (compra) {
    // A sessão de hoje só está no historico se a Laura já marcou Realizado
    // (usarSessao). Se ainda não consumida, desconta-a para saber o que
    // resta DEPOIS desta sessão.
    const consumida = (compra.historico || []).some(
      (h) => String(h.agendamento) === String(agendamento._id)
    );
    pacote = {
      nome: compra.pacote?.nome || 'Pacote',
      restantesAposEsta: Math.max(0, (compra.sessoesRestantes ?? 0) - (consumida ? 0 : 1)),
    };
  }

  const variante = agendamento.status === 'Não Compareceu' ? 'falta' : 'normal';
  return { enviar: true, variante, pacote };
}

export function buildFollowUpMensagem({ clienteNome, variante, pacote, clinicaNome }) {
  const assinatura = `\n\n_${clinicaNome}_`;

  if (variante === 'falta') {
    return (
      `💜 Sentimos a sua falta hoje, ${clienteNome}!\n\n` +
      `Aconteceu alguma coisa? Se quiser, é só responder por aqui e ` +
      `encontramos já um novo horário para a sua sessão. 😊` +
      assinatura
    );
  }

  let proposta = '';
  if (pacote && pacote.restantesAposEsta > 0) {
    const n = pacote.restantesAposEsta;
    const palavra = n === 1 ? 'sessão' : 'sessões';
    proposta =
      `\n\nAinda tem *${n} ${palavra}* no seu pacote — quer deixar já marcada a próxima? ` +
      `É só dizer o dia que lhe dá mais jeito. 😊`;
  } else if (pacote && pacote.restantesAposEsta === 0) {
    proposta =
      `\n\nEsta era a última sessão do seu pacote 🎉 Se quiser continuar os ` +
      `tratamentos, posso ajudar com a renovação — é só dizer!`;
  }

  return (
    `Olá ${clienteNome}! 💜\n\n` +
    `A sua sessão de hoje já terminou — como correu? Adoramos saber como se sentiu.` +
    proposta +
    assinatura
  );
}

/**
 * Handler do job BullMQ 'follow-up-pos-sessao'. Carrega o estado actual,
 * decide via avaliarFollowUp (pura) e envia. Throw apenas em falha de envio
 * (para o retry do BullMQ); todas as skip conditions retornam em silêncio.
 */
export async function processFollowUpJob(job) {
  const { agendamentoId, tenantId } = job.data;

  const db = getTenantDB(tenantId);
  const { Agendamento, Cliente, CompraPacote, Mensagem, Conversa } = getModels(db);

  const agendamento = await Agendamento.findOne({ _id: agendamentoId, tenantId }).lean();
  const [cliente, tenant, compra] = await Promise.all([
    agendamento?.cliente
      ? Cliente.findOne({ _id: agendamento.cliente, tenantId }).select('nome telefone iaAtiva').lean()
      : null,
    Tenant.findById(tenantId).lean(),
    agendamento?.compraPacote
      ? CompraPacote.findOne({ _id: agendamento.compraPacote, tenantId })
          .populate('pacote', 'nome')
          .lean()
      : null,
  ]);

  const decisao = avaliarFollowUp({
    agendamento,
    cliente,
    tenant,
    compra,
    jobDataHoraISO: job.data.dataHora,
  });
  if (!decisao.enviar) {
    logger.info({ jobId: job.id, agendamentoId, motivo: decisao.motivo }, '[FollowUp] não enviado');
    return;
  }

  const mensagem = buildFollowUpMensagem({
    clienteNome: cliente.nome || 'Cliente',
    variante: decisao.variante,
    pacote: decisao.pacote,
    clinicaNome: tenant?.nome || 'A clínica',
  });

  // Claim atómico ANTES do envio: só a execução que consegue marcar
  // followUp.enviadoEm (ainda null) envia. Fecha a janela de duplicação do
  // retry — marcar depois do envio deixava um write falhado reenviar a
  // mensagem. Trade-off deliberado: crash entre o claim e o envio perde a
  // mensagem (fail-closed) — num follow-up, não enviar é melhor que duplicar.
  const claim = await Agendamento.findOneAndUpdate(
    { _id: agendamentoId, tenantId, 'followUp.enviadoEm': null },
    { $set: { 'followUp.enviadoEm': new Date() } }
  ).lean();
  if (!claim) {
    logger.info({ jobId: job.id, agendamentoId, motivo: 'claim_perdido' }, '[FollowUp] não enviado');
    return;
  }

  let resultado;
  try {
    resultado = await sendWhatsAppMessage(
      cliente.telefone,
      mensagem,
      tenant?.whatsapp?.instanceName
    );
  } catch (err) {
    resultado = { success: false, error: err.message };
  }
  if (!resultado.success) {
    // Falha confirmada do envio → liberta o claim para o retry do BullMQ
    // poder reenviar. Se o $unset falhar, fica fail-closed (sem reenvio).
    try {
      await Agendamento.updateOne(
        { _id: agendamentoId, tenantId },
        { $unset: { 'followUp.enviadoEm': '' } }
      );
    } catch (unsetErr) {
      logger.warn(
        { agendamentoId, err: unsetErr.message },
        '[FollowUp] claim não libertado após falha de envio'
      );
    }
    throw new Error(`[FollowUp] Falha ao enviar para ${cliente.nome}: ${JSON.stringify(resultado.error)}`);
  }

  try {
    const tel = String(cliente.telefone).replace(/\D/g, '');
    const variants = [tel, `351${tel}`, tel.replace(/^351/, '')];
    let conversa = await Conversa.findOne({ tenantId, telefone: { $in: variants } });
    if (!conversa) {
      conversa = await Conversa.create({ tenantId, telefone: tel, estado: 'aguardando_agendamento' });
    }
    await Mensagem.create({
      tenantId,
      telefone: tel,
      mensagem,
      origem: 'laura',
      direcao: 'saida',
      geradoPor: 'sistema',
      conversa: conversa._id,
    });
  } catch (err) {
    logger.warn({ err: err.message, agendamentoId }, '[FollowUp] falha a registar na thread (envio OK)');
  }

  logger.info({ jobId: job.id, agendamentoId, variante: decisao.variante }, '[FollowUp] enviado');
}
