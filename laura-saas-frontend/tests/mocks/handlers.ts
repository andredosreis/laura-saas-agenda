import { http, HttpResponse } from 'msw';

/**
 * MSW handlers para mocks da API Marcai em testes Vitest.
 *
 * Estes handlers interceptam chamadas axios feitas via src/services/api.js
 * e retornam respostas controladas. Permite testar comportamento de
 * AuthContext, interceptor 401/refresh, ProtectedRoute, etc., sem servidor real.
 *
 * Base URL: alinhado com VITE_API_URL no .env (default: /api ou /api/v1).
 * Em testes, MSW intercepta qualquer URL — não importa o domínio.
 */

const API_BASE = '*/api';

export const handlers = [
  // ───────────────────────────
  // Auth
  // ───────────────────────────

  // Login OK — shape: { success, data: { user, tenant, tokens: { accessToken, refreshToken } } }
  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    const body = await request.json() as { email?: string; password?: string };

    if (body.email === 'test@marcai.pt' && body.password === 'TestPass@123') {
      return HttpResponse.json({
        success: true,
        data: {
          user: {
            _id: 'user-test-1',
            email: 'test@marcai.pt',
            nome: 'Test User',
            role: 'admin',
            emailVerificado: true,
          },
          tenant: {
            _id: 'tenant-test-1',
            nome: 'Salão Teste',
            plano: { tipo: 'basico', status: 'ativo' },
            limites: { maxClientes: 100 },
          },
          tokens: {
            accessToken: 'fake-access-token',
            refreshToken: 'fake-refresh-token',
          },
        },
      });
    }

    return HttpResponse.json(
      { success: false, error: 'Credenciais inválidas' },
      { status: 401 }
    );
  }),

  // Refresh token OK — shape: { success, data: { tokens: { accessToken, refreshToken } } }
  http.post(`${API_BASE}/auth/refresh`, async ({ request }) => {
    const body = await request.json() as { refreshToken?: string };

    if (body.refreshToken === 'fake-refresh-token') {
      return HttpResponse.json({
        success: true,
        data: {
          tokens: {
            accessToken: 'new-fake-access-token',
            refreshToken: 'new-fake-refresh-token',
          },
        },
      });
    }

    return HttpResponse.json(
      { success: false, error: 'Refresh token inválido' },
      { status: 401 }
    );
  }),

  // Logout OK
  http.post(`${API_BASE}/auth/logout`, () => {
    return HttpResponse.json({ success: true });
  }),

  // /auth/me — utilizador autenticado
  http.get(`${API_BASE}/auth/me`, ({ request }) => {
    const auth = request.headers.get('authorization');
    if (auth?.includes('fake-access-token') || auth?.includes('new-fake-access-token')) {
      return HttpResponse.json({
        success: true,
        data: {
          user: {
            _id: 'user-test-1',
            email: 'test@marcai.pt',
            nome: 'Test User',
            role: 'admin',
            emailVerificado: true,
          },
          tenant: {
            _id: 'tenant-test-1',
            nome: 'Salão Teste',
            plano: { tipo: 'basico', status: 'ativo' },
            limites: { maxClientes: 100 },
          },
        },
      });
    }
    return HttpResponse.json(
      { success: false, error: 'TOKEN_EXPIRED', code: 'TOKEN_EXPIRED' },
      { status: 401 }
    );
  }),

  // ───────────────────────────
  // Clientes (smoke handlers — testes específicos podem override)
  // ───────────────────────────

  http.get(`${API_BASE}/clientes`, () => {
    return HttpResponse.json({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, pages: 0, limit: 20 },
    });
  }),
];
