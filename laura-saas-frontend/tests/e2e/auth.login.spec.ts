import { test, expect } from '@playwright/test';

/**
 * E2E: fluxo de login do Marcai.
 *
 * Estratégia: mocka /api/auth/login a nível de network via Playwright route().
 * Não depende de backend Marcai estar a correr — testa apenas o fluxo frontend
 * (form submit, redirect, persistência de token).
 *
 * Para E2E com backend real, configurar em separado (separate spec file +
 * project no playwright.config.ts).
 */

test.describe('Login flow', () => {
  test('login com credenciais válidas redireciona para /dashboard', async ({ page }) => {
    // Mock do endpoint de login — devolve sucesso com tokens fictícios
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
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
        }),
      });
    });

    // Mock /auth/me para evitar 401 após redirect ao dashboard
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: { _id: 'user-test-1', email: 'test@marcai.pt', nome: 'Test User', role: 'admin' },
            tenant: { _id: 'tenant-test-1', nome: 'Salão Teste', plano: { tipo: 'basico', status: 'ativo' } },
          },
        }),
      });
    });

    // Stub para qualquer outra chamada API que o dashboard fizer (KPIs, etc)
    await page.route('**/api/dashboard/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    await page.goto('/login');

    // Verificar que página renderizou — Login não tem h1, usa texto descritivo
    await expect(page.getByText(/entre na sua conta para continuar/i)).toBeVisible();

    // Preencher form
    await page.getByLabel('Email').fill('test@marcai.pt');
    await page.getByRole('textbox', { name: 'Senha' }).fill('TestPass@123');

    // Submit
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Aguardar redirect ao dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

    // Token persistido no localStorage
    const accessToken = await page.evaluate(() => localStorage.getItem('laura_access_token'));
    expect(accessToken).toBe('fake-access-token');
  });

  test('login com credenciais inválidas mostra erro inline', async ({ page }) => {
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Credenciais inválidas' }),
      });
    });

    await page.goto('/login');

    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByRole('textbox', { name: 'Senha' }).fill('WrongPassword@1');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Erro genérico do servidor deve aparecer (caixa vermelha em Login.jsx:198)
    await expect(page.getByText(/credenciais inválidas/i)).toBeVisible({ timeout: 5000 });

    // Não deve ter redireccionado
    await expect(page).toHaveURL(/\/login/);
  });
});
