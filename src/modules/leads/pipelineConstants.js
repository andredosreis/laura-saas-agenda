/**
 * Pipeline de Leads — 6 estágios fixos (decisão Phase 1).
 * A customização por tenant é deliberadamente adiada (não há editor de pipeline na UI).
 *
 * Ordem importa: usada para validar transições e renderizar Kanban da esquerda para a direita.
 *
 * Significado:
 *   novo          — Acabou de chegar, ainda sem 1ª resposta da IA/equipa.
 *   em_conversa   — Diálogo iniciado; IA está a recolher dados.
 *   qualificado   — Score >= 60, dados confirmados, pronto para agendar.
 *   agendado      — Tem agendamento marcado.
 *   convertido    — Virou Cliente (manual via botão "Converter em Cliente").
 *   perdido       — Recusou, desistiu ou inactivo > 14 dias.
 */

export const LEAD_STAGES = Object.freeze([
  'novo',
  'em_conversa',
  'qualificado',
  'agendado',
  'convertido',
  'perdido',
]);

export const LEAD_STAGE_LABELS = Object.freeze({
  novo:         'Novo',
  em_conversa:  'Em conversa',
  qualificado:  'Qualificado',
  agendado:     'Agendado',
  convertido:   'Convertido',
  perdido:      'Perdido',
});

export const LEAD_STAGE_COLORS = Object.freeze({
  novo:         '#6366f1', // indigo-500
  em_conversa:  '#8b5cf6', // purple-500
  qualificado:  '#f59e0b', // amber-500
  agendado:     '#10b981', // emerald-500
  convertido:   '#22c55e', // green-500
  perdido:      '#ef4444', // red-500
});

/**
 * Stages que contam para o limite `maxLeads` do plano. Leads em `convertido` ou
 * `perdido` deixam de contar — incentiva fechar leads em vez de acumular.
 */
export const LEAD_ACTIVE_STAGES = Object.freeze([
  'novo', 'em_conversa', 'qualificado', 'agendado',
]);

/**
 * Transições permitidas. Map: stage actual → conjunto de stages destino válidos.
 * Tudo o resto é recusado (excepto se o actor for admin/superadmin — ver leadService).
 *
 * Regras-chave:
 *   - `convertido` só é alcançado via endpoint /convert (não via PATCH /stage).
 *   - `perdido` aceita-se em qualquer estado activo.
 *   - Voltar atrás (ex: agendado → em_conversa) é permitido se o cliente reabrir conversa.
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  novo:         new Set(['em_conversa', 'qualificado', 'perdido']),
  em_conversa:  new Set(['novo', 'qualificado', 'agendado', 'perdido']),
  qualificado:  new Set(['em_conversa', 'agendado', 'perdido']),
  agendado:     new Set(['em_conversa', 'qualificado', 'perdido']),
  convertido:   new Set([]),                 // terminal: só admin pode mover (via service)
  perdido:      new Set(['em_conversa', 'qualificado']),  // pode reabrir
});

/**
 * Stages que NÃO podem ser destino de PATCH /stage (só endpoint dedicado).
 */
export const RESTRICTED_DESTINATION_STAGES = Object.freeze(new Set(['convertido']));

export const ORIGEM_VALUES = Object.freeze(['whatsapp', 'manual', 'import', 'outro']);
export const URGENCIA_VALUES = Object.freeze(['baixa', 'media', 'alta']);
