import { test, expect, type Page } from '@playwright/test';

/**
 * E2E F01 — Reopen Availability UI.
 *
 * Estratégia (alinhada com auth.login.spec.ts): mocka a rede via Playwright
 * route(). Não depende do backend Marcai. A sessão é semeada em localStorage
 * (addInitScript, re-aplicada em cada reload) + mock de /auth/me, para o
 * ProtectedLayout renderizar como owner/admin autenticado.
 *
 * Cobre o contrato F01:
 *  - C1  navbar link reachable
 *  - C2  editar horário base persiste (headline)
 *  - C3  vista dia-a-dia operável a 375px (fluxo editar→salvar→reload→persistido)
 *  - C4  desktop mantém a grelha; mobile mostra a vista dia-a-dia
 *  - C5  empty-state CTA "Define o teu horário"
 */

const LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
};

type Row = {
  _id: string;
  dayOfWeek: number;
  label: string;
  isActive: boolean;
  startTime: string;
  endTime: string;
  breakStartTime: string;
  breakEndTime: string;
  updatedAt: string;
};

function makeRows(activeDays: number[]): Row[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    _id: `sch-${d}`,
    dayOfWeek: d,
    label: LABELS[d],
    isActive: activeDays.includes(d),
    startTime: '09:00',
    endTime: '18:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
}

/** Semeia sessão autenticada + mock /auth/me. */
async function seedAuth(page: Page) {
  // Catch-all: qualquer chamada ao backend (localhost:5001) não mockada devolve
  // um 200 benigno. Sem isto, pedidos de fundo (badges do Sidebar, refresh) batem
  // no backend real com o token fake → 401 → toasts "Autenticação inválida" que
  // tapam o toast de sucesso. Mocks específicos abaixo têm prioridade (Playwright:
  // a rota registada mais tarde vence).
  await page.route(
    (url) => url.port === '5001',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }
  );

  await page.addInitScript(() => {
    localStorage.setItem('laura_access_token', 'fake-access-token');
    localStorage.setItem('laura_refresh_token', 'fake-refresh-token');
    localStorage.setItem(
      'laura_user',
      JSON.stringify({ _id: 'user-1', email: 'owner@marcai.pt', nome: 'Owner', role: 'admin' })
    );
    localStorage.setItem(
      'laura_tenant',
      JSON.stringify({
        _id: 'tenant-1',
        nome: 'Clínica Teste',
        plano: { tipo: 'basico', status: 'ativo' },
        limites: { maxClientes: 100 },
      })
    );
  });

  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          user: { _id: 'user-1', email: 'owner@marcai.pt', nome: 'Owner', role: 'admin' },
          tenant: { _id: 'tenant-1', nome: 'Clínica Teste', plano: { tipo: 'basico', status: 'ativo' } },
        },
      }),
    });
  });
}

/**
 * Mock stateful de /schedules — GET devolve o estado atual, PUT actualiza-o
 * em memória (persistência entre reloads no fluxo do teste).
 */
async function mockSchedules(page: Page, activeDays: number[]) {
  const state = makeRows(activeDays);

  // PUT /schedules/:dayOfWeek — deve vir ANTES do GET (glob mais específico).
  await page.route('**/schedules/*', async (route) => {
    const url = new URL(route.request().url());
    const day = parseInt(url.pathname.split('/').pop() ?? '', 10);
    const body = route.request().postDataJSON() ?? {};
    const row = state.find((r) => r.dayOfWeek === day);
    if (row) {
      // Servidor só aceita estes campos (sem mass assignment)
      if (body.isActive !== undefined) row.isActive = body.isActive;
      if (body.startTime !== undefined) row.startTime = body.startTime;
      if (body.endTime !== undefined) row.endTime = body.endTime;
      if (body.breakStartTime !== undefined) row.breakStartTime = body.breakStartTime;
      if (body.breakEndTime !== undefined) row.breakEndTime = body.breakEndTime;
    }
    await route.fulfill({
      status: row ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(row ?? { error: 'Not found' }),
    });
  });

  await page.route('**/schedules', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ disponibilidade: state, agendamentos: [] }),
    });
  });

  // --- Excepções (F02) — stateful. Registadas DEPOIS para terem prioridade. ---
  const excecoes: Array<Record<string, unknown>> = [];
  let seq = 0;

  // GET lista / POST cria — `*` final tolera a query string (?from=&to=)
  await page.route('**/schedules/excecoes*', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() ?? {};
      const exc = { _id: `exc-${++seq}`, inicio: null, fim: null, observacao: '', ...body };
      excecoes.push(exc);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: exc }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: excecoes }) });
  });

  // PUT/DELETE por id
  await page.route('**/schedules/excecoes/*', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const idx = excecoes.findIndex((e) => e._id === id);
    if (route.request().method() === 'DELETE') {
      if (idx >= 0) excecoes.splice(idx, 1);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { _id: id } }) });
      return;
    }
    // PUT
    const body = route.request().postDataJSON() ?? {};
    if (idx >= 0) excecoes[idx] = { ...excecoes[idx], ...body };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: excecoes[idx] ?? { _id: id } }) });
  });
}

test.describe('F01 — Disponibilidade', () => {
  test('C1 — navbar link is reachable and page loads', async ({ page }) => {
    await seedAuth(page);
    await mockSchedules(page, [1, 2, 3]);

    await page.goto('/disponibilidade');

    // Página carrega dentro do ProtectedLayout
    await expect(page.getByRole('heading', { name: 'Disponibilidade', level: 1 })).toBeVisible();

    // Link de navegação presente e navega para /disponibilidade
    const navLink = page.getByRole('link', { name: 'Disponibilidade' }).first();
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(page).toHaveURL(/\/disponibilidade/);
  });

  test('C5 — empty state shows "Define o teu horário" CTA', async ({ page }) => {
    await seedAuth(page);
    await mockSchedules(page, []); // nenhum dia activo

    await page.goto('/disponibilidade');

    await expect(page.getByRole('heading', { name: 'Define o teu horário' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Define o teu horário' })).toBeVisible();
  });

  test('C4 — compact day editor renders on both desktop and mobile', async ({ page }) => {
    await seedAuth(page);
    await mockSchedules(page, [1, 2, 3]);

    // Desktop — editor compacto (mesma vista em todas as larguras; sem grelha)
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/disponibilidade');
    const dayList = page.getByTestId('day-by-day');
    await expect(dayList).toBeVisible();
    // 7 dias da semana como cartões
    await expect(dayList.getByRole('button', { name: 'Editar' })).toHaveCount(7);

    // Mobile — a mesma vista mantém-se operável
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(dayList).toBeVisible();
    await expect(dayList.getByRole('button', { name: 'Editar' })).toHaveCount(7);
  });

  test('C2/C3 — mobile: edit a weekday and persist across reload', async ({ page }) => {
    await seedAuth(page);
    await mockSchedules(page, [1]); // Segunda activa

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/disponibilidade');

    // Editor compacto (lista de dias) visível a 375px
    const dayByDay = page.getByTestId('day-by-day');
    await expect(dayByDay).toBeVisible();

    // Abrir a Segunda-feira (primeira linha) e editar
    await dayByDay.getByRole('button', { name: 'Editar' }).first().click();
    await expect(page.getByRole('heading', { name: 'Editar horário base' })).toBeVisible();

    const timeInputs = page.locator('input[type="time"]');
    await timeInputs.nth(0).fill('10:00'); // início expediente
    await timeInputs.nth(1).fill('17:00'); // fim expediente

    await page.getByRole('button', { name: 'Salvar' }).click();

    // Toast de sucesso (C2)
    await expect(page.getByText(/Horários atualizados com sucesso/i)).toBeVisible({ timeout: 5000 });

    // Persistência: reload e confirmar as novas horas (C3)
    await page.reload();
    await expect(page.getByTestId('day-by-day').getByText(/10:00.*17:00/)).toBeVisible({ timeout: 5000 });
  });

  test('C6 — "copiar para os dias úteis" issues parallel PUTs to Seg–Sex', async ({ page }) => {
    await seedAuth(page);
    await mockSchedules(page, [1]); // Segunda activa

    // Regista os PUTs a /schedules/:dia
    const putDays: number[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PUT' && /\/schedules\/\d+$/.test(req.url())) {
        putDays.push(parseInt(req.url().split('/').pop() ?? '', 10));
      }
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/disponibilidade');

    await page.getByTestId('day-by-day').getByRole('button', { name: 'Editar' }).first().click();
    await page.getByRole('button', { name: /Copiar para os dias úteis/i }).click();

    await expect(page.getByText(/copiados para os dias úteis/i)).toBeVisible({ timeout: 5000 });

    // Seg–Sex (1..5) receberam um PUT; sem duplicados
    expect([...new Set(putDays)].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test('C12 — mobile: create a closed-day exception with a note (calendar)', async ({ page }) => {
    await seedAuth(page);
    await mockSchedules(page, [1, 2, 3, 4, 5]);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/disponibilidade');

    // Calendário de excepções visível
    const calendar = page.getByTestId('excecoes-calendar');
    await expect(calendar).toBeVisible();

    // Abrir o dia 15 do mês visível
    await calendar.getByText('15', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Excepção de data' })).toBeVisible();

    // "Fechado" está pré-selecionado; escrever nota e guardar
    await page.getByPlaceholder(/Feriado, formação, folga/i).fill('Feriado');
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText(/Excepção guardada/i)).toBeVisible({ timeout: 5000 });

    // A excepção aparece numa célula do calendário com o badge "Fechado"
    // (scoped a botões de dia — a legenda também diz "Fechado" mas não é um botão)
    const cellComExcecao = calendar.locator('button[data-testid^="day-cell-"]', { hasText: 'Fechado' });
    await expect(cellComExcecao).toHaveCount(1, { timeout: 5000 });
    // ...e mostra a NOTA na própria célula
    await expect(cellComExcecao).toContainText('Feriado');
  });
});
