// Lógica pura de decisão + template do follow-up pós-sessão (sem DB).
import { DateTime } from 'luxon';
import { avaliarFollowUp, buildFollowUpMensagem } from '../src/workers/followUpPosSessao.js';

const ZONA = 'Europe/Lisbon';
const dataHora = DateTime.fromISO('2026-07-02T14:00:00', { zone: ZONA });

const base = () => ({
  agendamento: {
    _id: 'a1',
    cliente: 'c1',
    status: 'Confirmado',
    confirmacao: { tipo: 'confirmado' },
    dataHora: dataHora.toJSDate(),
  },
  cliente: { _id: 'c1', nome: 'Maria', telefone: '351910000000', iaAtiva: true },
  tenant: {
    nome: 'Clínica X',
    configuracoes: { iaGlobalAtiva: true, followUpPosSessaoAtivo: true },
  },
  compra: null,
  jobDataHoraISO: dataHora.toISO(),
});

describe('avaliarFollowUp — skip conditions', () => {
  it('agendamento inexistente → não envia', () => {
    expect(avaliarFollowUp({ ...base(), agendamento: null }).enviar).toBe(false);
  });

  it.each(['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'])('status %s → não envia', (status) => {
    const input = base();
    input.agendamento.status = status;
    expect(avaliarFollowUp(input).enviar).toBe(false);
  });

  it('confirmação rejeitada → não envia', () => {
    const input = base();
    input.agendamento.confirmacao = { tipo: 'rejeitado' };
    expect(avaliarFollowUp(input).enviar).toBe(false);
  });

  it('remarcado (dataHora difere da do job) → não envia', () => {
    const input = base();
    input.agendamento.dataHora = dataHora.plus({ days: 1 }).toJSDate();
    expect(avaliarFollowUp(input).enviar).toBe(false);
    expect(avaliarFollowUp(input).motivo).toBe('remarcado');
  });

  it('sem cliente associado (lead) → não envia', () => {
    const input = base();
    input.agendamento.cliente = null;
    input.cliente = null;
    expect(avaliarFollowUp(input).motivo).toBe('sem_cliente');
  });

  it('followUp.enviadoEm já existe → não envia (idempotência)', () => {
    const input = base();
    input.agendamento.followUp = { enviadoEm: new Date() };
    expect(avaliarFollowUp(input).motivo).toBe('ja_enviado');
  });

  it('iaGlobalAtiva=false → não envia', () => {
    const input = base();
    input.tenant.configuracoes.iaGlobalAtiva = false;
    expect(avaliarFollowUp(input).motivo).toBe('ia_global_off');
  });

  it('followUpPosSessaoAtivo=false → não envia', () => {
    const input = base();
    input.tenant.configuracoes.followUpPosSessaoAtivo = false;
    expect(avaliarFollowUp(input).motivo).toBe('followup_off');
  });

  it('cliente.iaAtiva=false → não envia', () => {
    const input = base();
    input.cliente.iaAtiva = false;
    expect(avaliarFollowUp(input).motivo).toBe('ia_cliente_off');
  });

  it('cliente sem telefone → não envia', () => {
    const input = base();
    input.cliente.telefone = null;
    expect(avaliarFollowUp(input).motivo).toBe('sem_telefone');
  });

  it('flags ausentes (tenant antigo sem campos) → ENVIA (ausente = activo)', () => {
    const input = base();
    input.tenant.configuracoes = {};
    delete input.cliente.iaAtiva;
    expect(avaliarFollowUp(input).enviar).toBe(true);
  });
});

describe('avaliarFollowUp — variantes e matemática do pacote', () => {
  it('status normal sem pacote → variante normal, pacote null', () => {
    const r = avaliarFollowUp(base());
    expect(r).toEqual({ enviar: true, variante: 'normal', pacote: null });
  });

  it('status Não Compareceu (Laura marcou antes) → variante falta', () => {
    const input = base();
    input.agendamento.status = 'Não Compareceu';
    expect(avaliarFollowUp(input).variante).toBe('falta');
  });

  it('sessão NÃO consumida: restantes 3 → restantesAposEsta 2', () => {
    const input = base();
    input.compra = { sessoesRestantes: 3, historico: [], pacote: { nome: 'Pack Relax' } };
    expect(avaliarFollowUp(input).pacote).toEqual({ nome: 'Pack Relax', restantesAposEsta: 2 });
  });

  it('sessão JÁ consumida (Laura marcou Realizado): restantes 2 → restantesAposEsta 2', () => {
    const input = base();
    input.compra = {
      sessoesRestantes: 2,
      historico: [{ agendamento: 'a1' }],
      pacote: { nome: 'Pack Relax' },
    };
    expect(avaliarFollowUp(input).pacote.restantesAposEsta).toBe(2);
  });

  it('última sessão não consumida: restantes 1 → restantesAposEsta 0', () => {
    const input = base();
    input.compra = { sessoesRestantes: 1, historico: [], pacote: { nome: 'Pack Relax' } };
    expect(avaliarFollowUp(input).pacote.restantesAposEsta).toBe(0);
  });

  it('nunca devolve restantes negativos', () => {
    const input = base();
    input.compra = { sessoesRestantes: 0, historico: [], pacote: { nome: 'Pack' } };
    expect(avaliarFollowUp(input).pacote.restantesAposEsta).toBe(0);
  });
});

describe('buildFollowUpMensagem', () => {
  const baseMsg = { clienteNome: 'Maria', clinicaNome: 'Clínica X' };

  it('variante normal sem pacote: pergunta como correu, sem proposta', () => {
    const m = buildFollowUpMensagem({ ...baseMsg, variante: 'normal', pacote: null });
    expect(m).toContain('Maria');
    expect(m).toContain('como correu');
    expect(m).toContain('_Clínica X_');
    expect(m).not.toMatch(/sessões|sessão no seu pacote|renovar/i);
  });

  it('com sessões restantes: propõe marcar a próxima (plural)', () => {
    const m = buildFollowUpMensagem({
      ...baseMsg,
      variante: 'normal',
      pacote: { nome: 'Pack Relax', restantesAposEsta: 2 },
    });
    expect(m).toContain('2 sessões');
    expect(m).toMatch(/próxima/i);
  });

  it('com 1 sessão restante: singular', () => {
    const m = buildFollowUpMensagem({
      ...baseMsg,
      variante: 'normal',
      pacote: { nome: 'Pack Relax', restantesAposEsta: 1 },
    });
    expect(m).toContain('1 sessão');
    expect(m).not.toContain('1 sessões');
  });

  it('última sessão (restantesAposEsta 0): menciona fim do pacote e renovação', () => {
    const m = buildFollowUpMensagem({
      ...baseMsg,
      variante: 'normal',
      pacote: { nome: 'Pack Relax', restantesAposEsta: 0 },
    });
    expect(m).toMatch(/última sessão/i);
    expect(m).toMatch(/renova/i);
  });

  it('variante falta: sentimos a sua falta + remarcar', () => {
    const m = buildFollowUpMensagem({ ...baseMsg, variante: 'falta', pacote: null });
    expect(m).toMatch(/falta/i);
    expect(m).toMatch(/remarcar|novo horário/i);
    expect(m).toContain('Maria');
  });
});
