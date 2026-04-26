import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';

/**
 * Testes do axios interceptor em src/services/api.js.
 *
 * Foco crítico:
 *  1. Request interceptor adiciona Authorization header se há token em localStorage
 *  2. Response interceptor: 401 com TOKEN_EXPIRED → refresh + retry com novo token
 *
 * Skipped (complexos demais para esta fase):
 *  - 401 sem TOKEN_EXPIRED → setTimeout 30s + redirect window.location
 *    (envolve window.location mocking + fake timers — fica para Fase C)
 *  - Race condition de refresh múltiplo (precisa de Promise.all + verificar
 *    que apenas 1 refresh ocorre)
 */

// Mock react-toastify para evitar barulho
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  ToastContainer: () => null,
}));

describe('api.js — request interceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules(); // garante re-import limpo do api.js
  });

  it('adiciona Authorization header quando há token em localStorage', async () => {
    const STORED_TOKEN = 'stored-token-abc';
    localStorage.setItem('laura_access_token', STORED_TOKEN);

    let receivedAuthHeader: string | null = null;

    // Override do handler para capturar o request
    server.use(
      http.get('*/api/clientes', ({ request }) => {
        receivedAuthHeader = request.headers.get('authorization');
        return HttpResponse.json({ success: true, data: [] });
      })
    );

    // Re-import com state limpo
    const { default: api } = await import('../api');
    await api.get('/clientes');

    expect(receivedAuthHeader).toBe(`Bearer ${STORED_TOKEN}`);
  });

  it('não envia Authorization header quando localStorage está vazio', async () => {
    localStorage.clear();

    let receivedAuthHeader: string | null = null;

    server.use(
      http.get('*/api/clientes', ({ request }) => {
        receivedAuthHeader = request.headers.get('authorization');
        return HttpResponse.json({ success: true, data: [] });
      })
    );

    const { default: api } = await import('../api');
    await api.get('/clientes');

    expect(receivedAuthHeader).toBeNull();
  });
});

describe('api.js — response interceptor (401 + TOKEN_EXPIRED → refresh + retry)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('refresh + retry quando recebe 401 TOKEN_EXPIRED com refresh token válido', async () => {
    const ORIGINAL_TOKEN = 'expired-token';
    const NEW_TOKEN = 'fresh-access-token';

    localStorage.setItem('laura_access_token', ORIGINAL_TOKEN);
    localStorage.setItem('laura_refresh_token', 'fake-refresh-token');

    let getCallCount = 0;
    let lastAuthHeader: string | null = null;
    let refreshCalled = false;

    // Override handlers para este teste
    server.use(
      // Primeira chamada com token expirado → 401 TOKEN_EXPIRED
      // Segunda chamada (retry com novo token) → sucesso
      http.get('*/api/clientes', ({ request }) => {
        getCallCount++;
        lastAuthHeader = request.headers.get('authorization');

        if (lastAuthHeader === `Bearer ${ORIGINAL_TOKEN}`) {
          return HttpResponse.json(
            { success: false, error: 'Token expirado', code: 'TOKEN_EXPIRED' },
            { status: 401 }
          );
        }
        return HttpResponse.json({ success: true, data: [] });
      }),
      // Refresh endpoint retorna novo access token
      http.post('*/api/auth/refresh', () => {
        refreshCalled = true;
        return HttpResponse.json({
          success: true,
          data: {
            tokens: {
              accessToken: NEW_TOKEN,
              refreshToken: 'new-refresh-token',
            },
          },
        });
      })
    );

    const { default: api } = await import('../api');
    const response = await api.get('/clientes');

    // Verificar que houve refresh + retry
    expect(refreshCalled).toBe(true);
    expect(getCallCount).toBe(2); // primeira call (401) + retry (200)
    expect(lastAuthHeader).toBe(`Bearer ${NEW_TOKEN}`); // último request usou novo token
    expect(response.data.success).toBe(true);

    // localStorage actualizado com novo token
    expect(localStorage.getItem('laura_access_token')).toBe(NEW_TOKEN);
  });
});
