/**
 * Restringe queries de Agendamento ao profissional quando o utilizador é terapeuta.
 * Terapeutas só vêem os próprios agendamentos. Outros roles (admin, gerente,
 * recepcionista) vêem todos os agendamentos do tenant.
 */
export const scopeAgendamentoQuery = (req, baseQuery = {}) => {
  const query = { tenantId: req.tenantId, ...baseQuery };
  if (req.user?.role === 'terapeuta') {
    query.profissional = req.user.userId;
  }
  return query;
};
