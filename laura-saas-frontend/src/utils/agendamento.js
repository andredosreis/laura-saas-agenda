/**
 * Nome do serviço de um agendamento, a partir do serviço CONTRATADO pelo cliente.
 *
 * Ordem: avaliação (inclui leads — não têm serviço contratado) → pacote directo
 * → pacote via compra de pacote (caminho mais comum nas sessões) → serviço avulso
 * → "Serviço" como último recurso.
 *
 * Requer que o agendamento traga `compraPacote.pacote` populado (ver
 * agendamentoController.listar e dashboardController).
 *
 * @param {object} ag agendamento
 * @returns {string}
 */
/**
 * Encurta o nome do pacote tirando o prefixo administrativo "Pacote N sessões de…"
 * para sobrar só o serviço. Ex: "Pacote 10 sessões de drenagem linfática" →
 * "Drenagem linfática". Mantém nomes já curtos ("Drenagem", "Massagem relaxante").
 */
function servicoCurto(nome) {
  if (!nome) return 'Serviço';
  let s = nome
    .replace(/^pacote\s+\d+\s+sess(?:ão|ões|oes|ao)\s*(?:de|da|do|dos|das)?\s*/i, '')
    .trim();
  if (!s) s = nome.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function nomeServicoAgendamento(ag) {
  if (!ag) return 'Serviço';
  if (ag.tipo === 'Avaliacao') return 'Avaliação';

  const bruto =
    ag.pacote?.nome ||
    ag.compraPacote?.pacote?.nome ||
    ag.servicoAvulsoNome ||
    'Serviço';
  const nome = servicoCurto(bruto);
  if (ag.servicoTipo === 'oferta') {
    return `${nome} (Oferta)`;
  }

  // Nº da sessão a fazer / total — derivado do progresso da compra de pacote
  // (numeroDaSessao não é gravado). "usadas + 1" = a sessão a realizar a seguir.
  // Só faz sentido em pacotes de várias sessões; single-sessão fica só com o nome.
  const cp = ag.compraPacote;
  if (cp && cp.sessoesContratadas > 1) {
    const total = cp.sessoesContratadas;
    const n = Math.min(total, (cp.sessoesUsadas || 0) + 1);
    return `${nome} ${n}/${total}`;
  }
  return nome;
}
