/**
 * Follow-up pós-sessão (spec docs/superpowers/specs/2026-07-02-follow-up-pos-sessao-design.md).
 *
 * `avaliarFollowUp` e `buildFollowUpMensagem` são puras (testáveis sem DB);
 * `processFollowUpJob` (Task 4) faz o wiring DB + envio. Vive fora do
 * notificationWorker para não tocar no pipeline de lembretes existente.
 */
import { DateTime } from 'luxon';

const ZONA = 'Europe/Lisbon';
const STATUS_CANCELADOS = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];

/**
 * Decide se o follow-up é enviado e com que variante.
 * Recebe docs .lean() (possivelmente null) — nenhum acesso a DB aqui.
 * Semântica das flags: ausente = activo; só bloqueia com `false` explícito.
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
