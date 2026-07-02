import { describe, it, expect } from 'vitest';
import { construirCandidatos } from '../SlotPicker';
import type { DiaDisponibilidade } from '../../services/scheduleService';

/**
 * Testes de `construirCandidatos` — grelha de chips do SlotPicker (F04, ADR-028 Fase 3).
 *
 * Regressão: com `intervaloEntreSessoes` configurado no tenant, o backend passa a
 * devolver `dia.slots` com passo variável (ex.: '10:15', '14:15'), não só múltiplos
 * de `duration`. A grelha de contexto (passo fixo) nunca pode esconder um `dia.slot`.
 *
 * Usa uma data no futuro para não depender da hora actual (`passado`).
 */

const DATA_FUTURA = '2099-01-01';

describe('construirCandidatos', () => {
  it('inclui todos os dia.slots como livre, mesmo em minutos que não são múltiplos de duration', () => {
    const dia: DiaDisponibilidade = {
      slots: ['09:00', '10:15', '14:15'],
      janela: {
        startTime: '09:00',
        endTime: '18:00',
        breakStartTime: '13:00',
        breakEndTime: '13:30',
      },
      ocupados: [],
    };

    const candidatos = construirCandidatos(dia, 60, DATA_FUTURA);

    const porHora = new Map(candidatos.map((c) => [c.hora, c]));
    expect(porHora.get('09:00')?.estado).toBe('livre');
    expect(porHora.get('10:15')?.estado).toBe('livre');
    expect(porHora.get('14:15')?.estado).toBe('livre');
  });

  it('não duplica horas quando um slot autoritativo coincide com a grelha de passo fixo', () => {
    const dia: DiaDisponibilidade = {
      slots: ['09:00', '10:00'],
      janela: {
        startTime: '09:00',
        endTime: '12:00',
        breakStartTime: '00:00',
        breakEndTime: '00:00',
      },
      ocupados: [],
    };

    const candidatos = construirCandidatos(dia, 60, DATA_FUTURA);
    const horas = candidatos.map((c) => c.hora);

    expect(horas).toEqual([...new Set(horas)]); // sem duplicados
    expect(candidatos.filter((c) => c.hora === '09:00')).toHaveLength(1);
  });

  it('ordena cronologicamente e classifica horas fora de dia.slots pelo contexto (ocupado/pausa/fora)', () => {
    const dia: DiaDisponibilidade = {
      slots: ['09:00', '10:15'],
      janela: {
        startTime: '09:00',
        endTime: '13:00',
        breakStartTime: '12:00',
        breakEndTime: '13:00',
      },
      // 11:00-12:00 ocupado
      ocupados: [{ start: 11 * 60, end: 12 * 60 }],
    };

    const candidatos = construirCandidatos(dia, 60, DATA_FUTURA);
    const horas = candidatos.map((c) => c.hora);

    // cronológico
    expect(horas).toEqual([...horas].sort());

    const porHora = new Map(candidatos.map((c) => [c.hora, c]));
    expect(porHora.get('09:00')?.estado).toBe('livre'); // autoritativo
    expect(porHora.get('10:15')?.estado).toBe('livre'); // autoritativo, passo não-múltiplo de 60
    expect(porHora.get('10:00')?.estado).toBe('fora'); // grelha, não está em slots, sem overlap
    expect(porHora.get('11:00')?.estado).toBe('ocupado'); // grelha, overlap com reserva
    expect(porHora.get('12:00')?.estado).toBe('pausa'); // grelha, dentro da pausa
  });

  it('fallback sem dia.janela devolve só os slots autoritativos como livre', () => {
    const dia: DiaDisponibilidade = {
      slots: ['09:00', '10:15'],
      janela: null,
      ocupados: [],
    };

    const candidatos = construirCandidatos(dia, 60, DATA_FUTURA);
    expect(candidatos).toEqual([
      { hora: '09:00', estado: 'livre', passado: false },
      { hora: '10:15', estado: 'livre', passado: false },
    ]);
  });
});
