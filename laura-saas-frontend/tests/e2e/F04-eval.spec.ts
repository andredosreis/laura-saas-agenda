import { test, expect, type Page, type Request } from '@playwright/test';

/**
 * F04 — Evaluator evidence spec.
 *
 * Não substitui F04-slot-picking.spec.ts (que verifica os critérios do contrato);
 * este spec CAPTURA screenshots (prova visual) e verifica C8 (paridade do modal
 * rápido + formato do payload dataHora). Rede totalmente mockada — nenhum dado
 * real é criado.
 */

const SHOTS =
  '../docs/produto/features/features-disponibilidade/F04-slot-picking-booking/screenshots';

const LABELS: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira',
  4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado',
};

function makeRows() {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    _id: `sch-${d}`, dayOfWeek: d, label: LABELS[d], isActive: true,
    startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
}

function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

const CLIENTE = { _id: 'cli1', nome: 'Cliente Teste', telefone: '910000000', email: 'cli@teste.pt' };
const AVAILABLE = ['09:00', '11:00', '13:00', '14:00', '16:00', '17:00'];

async function seedAuth(page: Page, role = 'admin') {
  await page.route((url) => url.port === '5001', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
  });
  await page.addInitScript((r) => {
    localStorage.setItem('laura_access_token', 'fake-access-token');
    localStorage.setItem('laura_refresh_token', 'fake-refresh-token');
    localStorage.setItem('laura_user', JSON.stringify({ _id: 'user-1', email: 'owner@marcai.pt', nome: 'Owner', role: r }));
    localStorage.setItem('laura_tenant', JSON.stringify({ _id: 'tenant-1', nome: 'Clínica Teste', plano: { tipo: 'basico', status: 'ativo' }, limites: { maxClientes: 100 } }));
  }, role);
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { user: { _id: 'user-1', email: 'owner@marcai.pt', nome: 'Owner', role }, tenant: { _id: 'tenant-1', nome: 'Clínica Teste', plano: { tipo: 'basico', status: 'ativo' } } } }),
    });
  });
}

async function mockBooking(page: Page, opts: { date: string; availableSlots: string[]; occupiedAt?: string; onPost?: (r: Request) => void }) {
  const { date, availableSlots, occupiedAt, onPost } = opts;
  const rows = makeRows();
  const agendamentos = occupiedAt ? [{ _id: 'ag-occ', dataHora: `${date}T${occupiedAt}:00`, cliente: { _id: 'x', nome: 'Ocupado' } }] : [];

  await page.route((url) => url.pathname.endsWith('/clientes'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [CLIENTE], pagination: { total: 1, page: 1, pages: 1, limit: 100 } }) });
  });
  await page.route((url) => /\/clientes\/[^/]+$/.test(url.pathname), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: CLIENTE }) });
  });
  await page.route((url) => url.pathname.includes('/compras-pacotes/cliente/'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: 'cp1', status: 'Ativo', sessoesRestantes: 5, pacote: { _id: 'p1', nome: 'Pacote Teste' } }]) });
  });
  await page.route((url) => url.pathname.endsWith('/schedules'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ disponibilidade: rows, agendamentos }) });
  });
  await page.route((url) => url.pathname.endsWith('/available-slots'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ availableSlots }) });
  });
  // GET devolve as reservas do dia — o serviço deriva `ocupados` desta listagem.
  const agendamentosLista = agendamentos.map((ag) => ({ ...ag, status: 'Agendado' }));
  await page.route((url) => url.pathname.endsWith('/agendamentos'), async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      onPost?.(req);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { _id: 'novo-ag' } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: agendamentosLista, pagination: { total: agendamentosLista.length, page: 1, pages: 1, limit: 100 } }) });
  });
}

test.describe('F04 — evidência (screenshots + C8)', () => {
  test('screenshot: grelha de estados (livre/ocupado/pausa/fora)', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: AVAILABLE, occupiedAt: '10:00' });
    await page.goto('/criar-agendamento');
    await expect(page.getByRole('heading', { name: 'Novo Agendamento' })).toBeVisible({ timeout: 20000 });
    await page.getByPlaceholder('Digite nome, telefone ou email').first().click();
    await page.getByRole('button', { name: /Cliente Teste/ }).first().click();
    await page.locator('input[type="date"]').first().fill(date);
    await expect(page.getByTestId('slot-picker').getByRole('option', { name: '09:00' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-slot-grid-states.png`, fullPage: true });
  });

  test('screenshot: empty state (dia fechado)', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: [] });
    await page.goto('/criar-agendamento');
    await page.locator('input[type="date"]').first().fill(date);
    await expect(page.getByTestId('slot-picker-empty')).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: `${SHOTS}/02-empty-state.png`, fullPage: true });
  });

  test('screenshot: admin "Forçar encaixe" com hora manual', async ({ page }) => {
    const date = futureDate();
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: AVAILABLE, occupiedAt: '10:00' });
    await page.goto('/criar-agendamento');
    await page.locator('input[type="date"]').first().fill(date);
    await expect(page.getByTestId('slot-picker')).toBeVisible({ timeout: 20000 });
    await page.getByRole('checkbox', { name: /Forçar encaixe/i }).check();
    await expect(page.getByTestId('slot-picker-force-input')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-admin-force.png`, fullPage: true });
  });

  test('screenshot: mobile 375px', async ({ page }) => {
    const date = futureDate();
    await page.setViewportSize({ width: 375, height: 812 });
    await seedAuth(page, 'admin');
    await mockBooking(page, { date, availableSlots: AVAILABLE, occupiedAt: '10:00' });
    await page.goto('/criar-agendamento');
    await page.locator('input[type="date"]').first().fill(date);
    await expect(page.getByTestId('slot-picker').getByRole('option', { name: '09:00' })).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: `${SHOTS}/04-mobile-375.png`, fullPage: true });
  });

  test('C8 — modal rápido: SlotPicker + payload dataHora "yyyy-MM-dd\'T\'HH:mm"', async ({ page }) => {
    const date = futureDate();
    let postedDataHora: string | null = null;
    await page.setViewportSize({ width: 375, height: 812 }); // mobile → calendário abre em timeGridDay
    await seedAuth(page, 'admin');
    await mockBooking(page, {
      date, availableSlots: AVAILABLE, occupiedAt: '10:00',
      onPost: (req) => { postedDataHora = (req.postDataJSON() ?? {}).dataHora ?? null; },
    });

    await page.goto('/calendario');
    // Vista dia (mobile) — clicar num slot de hora abre o QuickAppointmentModal.
    const slot = page.locator('td.fc-timegrid-slot-lane[data-time="09:00:00"]');
    await expect(slot).toBeVisible({ timeout: 20000 });
    await slot.click({ force: true });

    // Modal aberto.
    await expect(page.getByRole('heading', { name: 'Novo Agendamento Rápido' })).toBeVisible({ timeout: 10000 });

    // Escolher cliente (pacote auto-seleccionado) + data futura (evita dimming de "hoje").
    await page.getByPlaceholder('Digite nome, telefone ou email').click();
    await page.getByRole('button', { name: /Cliente Teste/ }).first().click();
    await page.locator('input[type="date"]').first().fill(date);
    const picker = page.getByTestId('slot-picker');
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('option', { name: '09:00' })).toBeEnabled();
    await page.screenshot({ path: `${SHOTS}/05-quick-modal.png`, fullPage: true });

    await picker.getByRole('option', { name: '09:00' }).click();
    await page.getByRole('button', { name: 'Criar Agendamento' }).click();

    // C8: payload emitido com dataHora no formato yyyy-MM-dd'T'HH:mm.
    await expect.poll(() => postedDataHora, { timeout: 10000 }).not.toBeNull();
    expect(postedDataHora).toBe(`${date}T09:00`);
  });
});
