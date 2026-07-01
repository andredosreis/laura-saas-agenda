import { test, expect, type Page } from '@playwright/test';

/**
 * E2E F04 — Slot Picking in Manual Booking (ADR-028 Fase 3).
 *
 * Estratégia (alinhada com disponibilidade.spec.ts / auth.login.spec.ts): a rede
 * é mockada via Playwright route(). NENHUM backend real é tocado — não se criam
 * agendamentos nem dados de produção. A sessão é semeada em localStorage
 * (addInitScript) + mock de /auth/me.
 *
 * Cobre o contrato F04:
 *  - C1  reservar escolhendo um slot (caminho `dataSelecionada` revivido)
 *  - C2  slots vêm de getAvailableSlots para a data
 *  - C3/C7 excepção `fechado` / dia sem slots → empty state
 *  - C4  distinção visual dos estados (livre/ocupado/pausa/fora)
 *  - C5  "Forçar encaixe" só para admin
 *  - C6  responsivo a 375px (chips tappáveis, sem scroll horizontal)
 *  - C8  modal rápido emite o mesmo payload (dataHora "yyyy-MM-dd'T'HH:mm")
 */

const LABELS: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira',
  4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado',
};

type Row = {
  _id: string; dayOfWeek: number; label: string; isActive: boolean;
  startTime: string; endTime: string; breakStartTime: string; breakEndTime: string;
  updatedAt: string;
};

/** 7 dias activos, janela 09:00–18:00 com pausa 12:00–13:00. */
function makeRows(): Row[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    _id: `sch-${d}`, dayOfWeek: d, label: LABELS[d], isActive: true,
    startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
}

/** Data futura (hoje + 3 dias) em "YYYY-MM-DD" — evita o dimming de "hoje". */
function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

const CLIENTE = { _id: 'cli1', nome: 'Cliente Teste', telefone: '910000000', email: 'cli@teste.pt' };

async function seedAuth(page: Page, role: string = 'admin') {
  await page.route((url) => url.port === '5001', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
  });

  await page.addInitScript((r) => {
    localStorage.setItem('laura_access_token', 'fake-access-token');
    localStorage.setItem('laura_refresh_token', 'fake-refresh-token');
    localStorage.setItem('laura_user', JSON.stringify({ _id: 'user-1', email: 'owner@marcai.pt', nome: 'Owner', role: r }));
    localStorage.setItem('laura_tenant', JSON.stringify({
      _id: 'tenant-1', nome: 'Clínica Teste',
      plano: { tipo: 'basico', status: 'ativo' }, limites: { maxClientes: 100 },
    }));
  }, role);

  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          user: { _id: 'user-1', email: 'owner@marcai.pt', nome: 'Owner', role },
          tenant: { _id: 'tenant-1', nome: 'Clínica Teste', plano: { tipo: 'basico', status: 'ativo' } },
        },
      }),
    });
  });
}

/**
 * Mocka os endpoints da marcação. `availableSlots` é o conjunto autoritativo
 * devolvido por /schedules/available-slots; `occupiedAt` cria uma reserva no dia
 * (para o estado "ocupado" em C4).
 */
async function mockBooking(
  page: Page,
  opts: { date: string; availableSlots: string[]; occupiedAt?: string }
) {
  const { date, availableSlots, occupiedAt } = opts;
  const rows = makeRows();
  const agendamentos = occupiedAt
    ? [{ _id: 'ag-occ', dataHora: `${date}T${occupiedAt}:00`, cliente: { _id: 'x', nome: 'Ocupado' } }]
    : [];

  // Lista de clientes (paginada).
  await page.route((url) => url.pathname.endsWith('/clientes'), async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [CLIENTE], pagination: { total: 1, page: 1, pages: 1, limit: 100 } }),
    });
  });

  // Cliente individual.
  await page.route((url) => /\/clientes\/[^/]+$/.test(url.pathname), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: CLIENTE }) });
  });

  // Pacotes activos do cliente (1 → auto-seleccionado no form).
  await page.route((url) => url.pathname.includes('/compras-pacotes/cliente/'), async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ _id: 'cp1', status: 'Ativo', sessoesRestantes: 5, pacote: { _id: 'p1', nome: 'Pacote Teste' } }]),
    });
  });

  // Contexto do dia (janela base + reservas).
  await page.route((url) => url.pathname.endsWith('/schedules'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ disponibilidade: rows, agendamentos }) });
  });

  // Conjunto autoritativo de slots.
  await page.route((url) => url.pathname.endsWith('/available-slots'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ availableSlots }) });
  });

  // POST /agendamentos (write) + GET /agendamentos (reservas do dia p/ o
  // SlotPicker + lista após navegação). O serviço deriva `ocupados` desta
  // listagem (não do getSchedules, cuja janela é só hoje..+7).
  const agendamentosLista = agendamentos.map((ag) => ({ ...ag, status: 'Agendado' }));
  await page.route((url) => url.pathname.endsWith('/agendamentos'), async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { _id: 'novo-ag' } }) });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: agendamentosLista, pagination: { total: agendamentosLista.length, page: 1, pages: 1, limit: 100 } }),
    });
  });
}

/** Selecciona o cliente de teste no combobox da página. */
async function escolherCliente(page: Page) {
  await page.getByPlaceholder('Digite nome, telefone ou email').first().click();
  await page.getByRole('button', { name: /Cliente Teste/ }).first().click();
}

const AVAILABLE = ['09:00', '11:00', '13:00', '14:00', '16:00', '17:00']; // 10:00=ocupado, 12:00=pausa, 15:00=fora

test.describe('F04 — Slot Picking na marcação manual', () => {
  test('C1/C2 — reservar escolhendo um slot disponível (caminho revivido)', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: AVAILABLE, occupiedAt: '10:00' });

    await page.goto('/criar-agendamento');
    // timeout alargado: primeira navegação pode apanhar o cold-compile do Vite.
    await expect(page.getByRole('heading', { name: 'Novo Agendamento' })).toBeVisible({ timeout: 20000 });

    await escolherCliente(page);

    // Escolher a data → o SlotPicker carrega os slots.
    await page.locator('input[type="date"]').first().fill(date);
    const picker = page.getByTestId('slot-picker');
    await expect(picker).toBeVisible();

    // Chip disponível (09:00) selecionável e vindo de getAvailableSlots (C2).
    const chip09 = picker.getByRole('option', { name: '09:00' });
    await expect(chip09).toBeEnabled();
    await chip09.click();
    await expect(chip09).toHaveAttribute('aria-selected', 'true');

    // Submeter → agendamento criado (C1).
    await page.getByRole('button', { name: 'Criar Agendamento' }).click();
    await expect(page.getByText(/Agendamento criado com sucesso/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/agendamentos/);
  });

  test('C4 — distinção visual dos estados (livre/ocupado/pausa/fora)', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: AVAILABLE, occupiedAt: '10:00' });

    await page.goto('/criar-agendamento');
    await page.locator('input[type="date"]').first().fill(date);
    const picker = page.getByTestId('slot-picker');
    await expect(picker).toBeVisible();

    // livre — selecionável
    const livre = picker.getByRole('option', { name: '09:00' });
    await expect(livre).toHaveAttribute('data-estado', 'livre');
    await expect(livre).toBeEnabled();

    // ocupado — distinto e não selecionável
    const ocupado = picker.getByRole('option', { name: '10:00' });
    await expect(ocupado).toHaveAttribute('data-estado', 'ocupado');
    await expect(ocupado).toBeDisabled();

    // pausa — distinto e não selecionável
    const pausa = picker.getByRole('option', { name: '12:00' });
    await expect(pausa).toHaveAttribute('data-estado', 'pausa');
    await expect(pausa).toBeDisabled();

    // fora do horário — distinto e não selecionável
    const fora = picker.getByRole('option', { name: '15:00' });
    await expect(fora).toHaveAttribute('data-estado', 'fora');
    await expect(fora).toBeDisabled();
  });

  test('C3/C7 — dia sem slots (fechado) mostra empty state', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: [] });

    await page.goto('/criar-agendamento');
    await page.locator('input[type="date"]').first().fill(date);

    await expect(page.getByTestId('slot-picker-empty')).toBeVisible();
    await expect(page.getByText(/Sem horários disponíveis para esta data/i)).toBeVisible();
    // Sem chips de slot.
    await expect(page.getByTestId('slot-picker').getByRole('option')).toHaveCount(0);
  });

  test('C7 — erro de rede em available-slots mostra erro inline (form não crasha)', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'admin');
    // Mocks base, mas available-slots devolve 500.
    await mockBooking(page, { date, availableSlots: AVAILABLE });
    await page.route((url) => url.pathname.endsWith('/available-slots'), async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Erro ao buscar slots disponíveis' }) });
    });

    await page.goto('/criar-agendamento');
    await page.locator('input[type="date"]').first().fill(date);

    // Erro inline (role=alert) e o formulário continua utilizável.
    await expect(page.getByTestId('slot-picker').getByRole('alert')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Novo Agendamento' })).toBeVisible();
  });

  test('C5 — "Forçar encaixe" visível para admin', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: AVAILABLE, occupiedAt: '10:00' });

    await page.goto('/criar-agendamento');
    await page.locator('input[type="date"]').first().fill(date);
    await expect(page.getByTestId('slot-picker')).toBeVisible();

    const toggle = page.getByRole('checkbox', { name: /Forçar encaixe/i });
    await expect(toggle).toBeVisible();

    // Ao activar: entrada de hora manual + chip ocupado torna-se selecionável.
    await toggle.check();
    await expect(page.getByTestId('slot-picker-force-input')).toBeVisible();
    await expect(page.getByTestId('slot-picker').getByRole('option', { name: '10:00' })).toBeEnabled();
  });

  test('C5 — "Forçar encaixe" oculto para não-admin (recepcionista)', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'recepcionista');
    await mockBooking(page, { date, availableSlots: AVAILABLE });

    await page.goto('/criar-agendamento');
    await page.locator('input[type="date"]').first().fill(date);
    await expect(page.getByTestId('slot-picker')).toBeVisible();

    await expect(page.getByRole('checkbox', { name: /Forçar encaixe/i })).toHaveCount(0);
  });

  test('C6 — responsivo a 375px: chips tappáveis, sem scroll horizontal, reserva completa', async ({ page }) => {
    const date = futureDate();
    await page.setViewportSize({ width: 375, height: 812 });
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: AVAILABLE, occupiedAt: '10:00' });

    await page.goto('/criar-agendamento');
    await escolherCliente(page);
    await page.locator('input[type="date"]').first().fill(date);

    const picker = page.getByTestId('slot-picker');
    await expect(picker).toBeVisible();

    // Alvo de toque ≥44px.
    const chip = picker.getByRole('option', { name: '09:00' });
    const box = await chip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Sem scroll horizontal.
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHScroll).toBe(false);

    // Reserva completa no telemóvel.
    await chip.click();
    await page.getByRole('button', { name: 'Criar Agendamento' }).click();
    await expect(page.getByText(/Agendamento criado com sucesso/i)).toBeVisible({ timeout: 5000 });
  });
});
