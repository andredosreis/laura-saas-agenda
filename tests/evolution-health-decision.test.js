import { decideAlert, normalizeObserved, isDisconnectError } from '../src/services/evolutionHealthDecision.js';

const OPTS = { confirmMs: 180000, dailyMs: 86400000 };
const t0 = new Date('2026-07-08T00:00:00Z');
const at = (ms) => new Date(t0.getTime() + ms);
const down = { healthy: false, reason: 'session_closed' };
const up = { healthy: true, reason: null };

describe('normalizeObserved', () => {
  it('open → healthy', () => {
    expect(normalizeObserved({ ok: true, state: 'open' })).toEqual({ healthy: true, reason: null });
  });
  it('connecting/close → session_closed', () => {
    expect(normalizeObserved({ ok: true, state: 'connecting' })).toEqual({ healthy: false, reason: 'session_closed' });
    expect(normalizeObserved({ ok: true, state: 'close' })).toEqual({ healthy: false, reason: 'session_closed' });
  });
  it('unreachable → api_unreachable', () => {
    expect(normalizeObserved({ ok: false, unreachable: true, error: 'x' })).toEqual({ healthy: false, reason: 'api_unreachable' });
  });
});

describe('isDisconnectError', () => {
  it('apanha "Connection Closed" em objecto aninhado', () => {
    expect(isDisconnectError({ status: 500, response: { message: 'Connection Closed' } })).toBe(true);
  });
  it('apanha em string', () => {
    expect(isDisconnectError('Connection Terminated')).toBe(true);
  });
  it('ignora erro não-desconexão', () => {
    expect(isDisconnectError({ status: 400, message: 'invalid number' })).toBe(false);
    expect(isDisconnectError(null)).toBe(false);
  });
});

describe('decideAlert', () => {
  it('open + healthy = none', () => {
    const r = decideAlert({ state: 'open', downSince: null, lastAlertAt: null }, up, at(0), OPTS);
    expect(r.action).toBe('none');
    expect(r.nextState.state).toBe('open');
  });
  it('open + unhealthy = arma relógio (none)', () => {
    const r = decideAlert({ state: 'open', downSince: null, lastAlertAt: null }, down, at(0), OPTS);
    expect(r.action).toBe('none');
    expect(r.nextState).toEqual({ state: 'down', downSince: at(0), lastAlertAt: null });
  });
  it('down <confirm = none (blip protegido)', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: null }, down, at(60000), OPTS);
    expect(r.action).toBe('none');
  });
  it('down ≥confirm, nunca alertou = notify_down', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: null }, down, at(200000), OPTS);
    expect(r.action).toBe('notify_down');
    expect(r.nextState.lastAlertAt).toEqual(at(200000));
    expect(r.reason).toBe('session_closed');
  });
  it('down já alertado <daily = none', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: at(200000) }, down, at(200000 + 3600000), OPTS);
    expect(r.action).toBe('none');
  });
  it('down já alertado ≥daily = notify_daily', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: at(0) }, down, at(86400001), OPTS);
    expect(r.action).toBe('notify_daily');
    expect(r.nextState.lastAlertAt).toEqual(at(86400001));
  });
  it('down alertado + healthy = notify_recovered', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: at(200000) }, up, at(300000), OPTS);
    expect(r.action).toBe('notify_recovered');
    expect(r.nextState.state).toBe('open');
  });
  it('down nunca alertado (blip) + healthy = none', () => {
    const r = decideAlert({ state: 'down', downSince: at(0), lastAlertAt: null }, up, at(60000), OPTS);
    expect(r.action).toBe('none');
    expect(r.nextState.state).toBe('open');
  });
});
