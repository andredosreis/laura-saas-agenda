# Plano: FASE 2 - Calendário Interativo + Analytics Avançados

## Status do Projeto
✅ **Fase 1D Completa (100%)** - Sistema testado e aprovado pelo usuário
- Autenticação multi-tenant funcionando
- Dashboard premium com dark/light mode
- Validação em tempo real (react-hook-form + zod)
- Toast notifications estilizados
- Landing page comercial

## Decisão do Usuário
🎯 **Opção escolhida:** Iniciar Fase 2 - Calendário Interativo + Analytics

## Sistema Atual de Agendamentos

### Backend
- **Model:** `Agendamento.js` com campos: tenantId, cliente, pacote, dataHora, status (6 estados), servicoAvulsoValor
- **Endpoints:** CRUD completo em `/api/agendamentos` + endpoints especializados do dashboard
- **Autenticação:** JWT com isolamento multi-tenant por tenantId
- **Bibliotecas:** Luxon 3.7.2 para datas (timezone: Europe/Lisbon)

### Frontend
- **Páginas:** Agendamentos.jsx (tabela), CriarAgendamento.jsx, EditarAgendamento.jsx
- **Charts:** DashboardChart.jsx usando Recharts 3.6.0 (apenas BarChart)
- **Analytics:** KPIs básicos (faturamento mensal, taxa comparecimento) via `/api/dashboard/financeiro`

## Decisões Arquiteturais

### 1. Calendário como Rota Suplementar (/calendario)
- ✅ Mantém `/agendamentos` (tabela) para operações em massa
- ✅ Adiciona `/calendario` para agendamento visual
- ✅ Permite adoção gradual pelos usuários

### 2. Drag-and-Drop com Confirmação
- ✅ Modal de confirmação antes de salvar
- ✅ Detecta conflitos e horário comercial
- ✅ Permite adicionar notas sobre a remarcação

### 3. Página Financeira: /financeiro
- ✅ Nome intuitivo em português
- ✅ Separado de analytics operacionais
- ✅ Consistente com nomenclatura do projeto

### 4. Cálculo de Receita Completo
- ✅ `servicoAvulsoValor` (serviços avulsos)
- ✅ `pacote.valor / pacote.sessoes` (valor por sessão de pacotes)
- ✅ Visão financeira precisa

## Plano de Implementação

### FASE 2A: FullCalendar Integration (Prioridade 1)

#### Passo 1: Instalação de Pacotes
**Comando:**
```bash
cd laura-saas-frontend
npm install @fullcalendar/core @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction @fullcalendar/luxon3
```

**Pacotes:**
- `@fullcalendar/core` - Engine principal
- `@fullcalendar/react` - Wrapper React
- `@fullcalendar/daygrid` - Vista de mês
- `@fullcalendar/timegrid` - Vista de semana/dia
- `@fullcalendar/interaction` - Drag-and-drop
- `@fullcalendar/luxon3` - Integração com Luxon (já instalado)

**Impacto:** ~120KB gzipped

#### Passo 2: Criar CalendarView Component
**Arquivo:** `laura-saas-frontend/src/pages/CalendarView.jsx` (NOVO)

**Funcionalidades:**
1. Três vistas: Mês, Semana, Dia
2. Eventos carregados de `/api/agendamentos`
3. Color-coding por status:
   - Agendado: azul
   - Confirmado: teal
   - Realizado: verde
   - Cancelado: vermelho
   - Não Compareceu: amarelo
4. Timezone: Europe/Lisbon
5. Horário comercial: 09:00-19:00
6. Click em evento → Modal de detalhes
7. Click em slot vazio → Modal criar agendamento
8. Drag event → Modal de confirmação com detecção de conflitos

**Funções principais:**
- `transformAgendamentosToEvents()` - Converte agendamentos para eventos FullCalendar
- `detectConflicts()` - Detecta sobreposição de horários
- `isWithinBusinessHours()` - Valida horário comercial

**Responsividade:**
- Desktop: Todas as vistas
- Mobile: Vista de dia por padrão, UI simplificada

#### Passo 3: Criar Modais de Suporte
**Arquivos NOVOS:**

1. **`laura-saas-frontend/src/components/AppointmentDetailModal.jsx`**
   - Exibe informações completas do agendamento
   - Botões: Editar, Mudar status, Enviar lembrete, Excluir
   - Props: `isOpen`, `onClose`, `appointment`, `onUpdate`

2. **`laura-saas-frontend/src/components/RescheduleConfirmModal.jsx`**
   - Compara data antiga vs nova
   - Mostra avisos de conflito e horário comercial
   - Campo de notas opcional
   - Confirmação → `PUT /api/agendamentos/:id`
   - Props: `oldDate`, `newDate`, `appointment`, `conflicts`, `onConfirm`, `onCancel`

3. **`laura-saas-frontend/src/components/QuickAppointmentModal.jsx`**
   - Data/hora pré-preenchida do slot clicado
   - Dropdown de cliente e pacote
   - Campo de observações
   - Botão criar → `POST /api/agendamentos`
   - Reusa `agendamentoSchema` de validationSchemas.js

#### Passo 4: Integrar Rotas e Navbar
**Arquivos a modificar:**

1. **`laura-saas-frontend/src/App.tsx`**
   - Adicionar rota: `<Route path="/calendario" element={<ProtectedLayout><CalendarView /></ProtectedLayout>} />`

2. **`laura-saas-frontend/src/components/Navbar.jsx`**
   - Adicionar link: `{ to: "/calendario", text: "Calendário", icon: CalendarCheck }`
   - Import: `import { CalendarCheck } from 'lucide-react'`
   - Posição: Após "Agendamentos", antes "Pacotes"

---

### FASE 2B: Analytics Avançados (Prioridade 2)

#### Passo 5: Backend - Novos Endpoints de Analytics
**Arquivo:** `src/controllers/analyticsController.js`

**Adicionar 3 funções:**

1. **`getReceitaTemporal()`**
   - Rota: `GET /api/analytics/receita-temporal`
   - Query params: `periodo` ('dia'|'semana'|'mes'), `dias` (número)
   - Retorna: Array com {data, receita, agendamentos, media}
   - Agregação MongoDB com $lookup em pacotes
   - Calcula receita: servicoAvulsoValor OU pacote.valor/pacote.sessoes

2. **`getDistribuicaoServicos()`**
   - Rota: `GET /api/analytics/distribuicao-servicos`
   - Query params: `dataInicio`, `dataFim` (ISO dates)
   - Retorna: Array com {nome, quantidade, receita, percentual}
   - Agrupa por pacote.nome ou servicoAvulsoNome
   - Ordena por receita (descendente)

3. **`getTopClientes()`**
   - Rota: `GET /api/analytics/top-clientes`
   - Query params: `limite` (default 10), `dataInicio`, `dataFim`
   - Retorna: Array com {ranking, clienteId, nome, telefone, receita, agendamentos, ticketMedio}
   - Agrupa por cliente
   - Ordena por receita

**Todos filtram por `tenantId` e status `'Realizado'`**

#### Passo 6: Registrar Rotas de Analytics
**Arquivo:** `src/routes/analyticsRoutes.js`

**Adicionar:**
```javascript
router.get('/receita-temporal', getReceitaTemporal);
router.get('/distribuicao-servicos', getDistribuicaoServicos);
router.get('/top-clientes', getTopClientes);
```

#### Passo 7: Criar Componentes de Charts
**Arquivos NOVOS:**

1. **`laura-saas-frontend/src/components/RevenueLineChart.jsx`**
   - LineChart do Recharts
   - Eixo X: Datas, Eixo Y: Receita
   - Tooltip customizado
   - Gradiente sob a linha
   - Props: `data`, `periodo`, `isLoading`

2. **`laura-saas-frontend/src/components/ServicePieChart.jsx`**
   - PieChart do Recharts
   - Cores customizadas por serviço
   - Legend com valores de receita
   - Click para destacar
   - Props: `data`, `isLoading`

3. **`laura-saas-frontend/src/components/TopClientsTable.jsx`**
   - Tabela responsiva
   - Top 3 com destaque (ouro, prata, bronze)
   - Colunas: Ranking, Nome, Receita, Agendamentos, Ticket Médio
   - Click no nome → navegação para detalhes do cliente
   - Props: `clientes`, `isLoading`, `onClientClick`

#### Passo 8: Criar Página Financeiro
**Arquivo:** `laura-saas-frontend/src/pages/Financeiro.jsx` (NOVO)

**Layout:**
```
┌─────────────────────────────────────────────┐
│  Header + Filtro de Data Range              │
├─────────────────────────────────────────────┤
│  KPI Cards (4 colunas)                      │
│  [Total Receita][Ticket Médio][Taxa][...]   │
├──────────────────────┬──────────────────────┤
│  Revenue Line Chart  │  Service Pie Chart   │
│  (2/3 largura)       │  (1/3 largura)       │
├──────────────────────┴──────────────────────┤
│  Top Clients Table (largura total)          │
└─────────────────────────────────────────────┘
```

**Funcionalidades:**
1. **Filtro de Data:**
   - Presets: Última semana, Último mês, Último trimestre, Ano atual
   - Date picker customizado
   - Atualiza todos os charts

2. **Seletor de Período (Line Chart):**
   - Tabs: Diário, Semanal, Mensal
   - Atualiza via API

3. **KPI Cards:**
   - Total Receita (soma)
   - Ticket Médio (receita / agendamentos)
   - Taxa de Comparecimento (reusa `/api/dashboard/financeiro`)
   - Crescimento (vs período anterior)

**Data fetching:**
- 4 chamadas paralelas com `Promise.all()`
- APIs: `/analytics/receita-temporal`, `/analytics/distribuicao-servicos`, `/analytics/top-clientes`, `/dashboard/financeiro`

#### Passo 9: Integrar Rota Financeiro
**Arquivos a modificar:**

1. **`laura-saas-frontend/src/App.tsx`**
   - Adicionar rota: `<Route path="/financeiro" element={<ProtectedLayout><Financeiro /></ProtectedLayout>} />`

2. **`laura-saas-frontend/src/components/Navbar.jsx`**
   - Adicionar link: `{ to: "/financeiro", text: "Financeiro", icon: TrendingUp }`
   - Import: `import { TrendingUp } from 'lucide-react'`
   - Posição: Após "Pacotes", antes "Horários"

---

### FASE 2C: Otimização de Banco de Dados

#### Passo 10: Adicionar Índices Compostos
**Arquivo:** `src/models/Agendamento.js`

**Adicionar após índices existentes:**
```javascript
// Índices para queries de analytics
agendamentoSchema.index({ tenantId: 1, status: 1, dataHora: 1 });
agendamentoSchema.index({ tenantId: 1, dataHora: 1 });
agendamentoSchema.index({ tenantId: 1, cliente: 1, status: 1 });
```

#### Passo 11: Script de Migração de Índices
**Arquivo:** `scripts/add-analytics-indexes.js` (NOVO)

**Conteúdo:**
```javascript
import mongoose from 'mongoose';
import Agendamento from '../src/models/Agendamento.js';

const addIndexes = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Criando índices de analytics...');

  await Agendamento.collection.createIndex({ tenantId: 1, status: 1, dataHora: 1 });
  await Agendamento.collection.createIndex({ tenantId: 1, dataHora: 1 });
  await Agendamento.collection.createIndex({ tenantId: 1, cliente: 1, status: 1 });

  console.log('Índices criados com sucesso!');
  await mongoose.disconnect();
};

addIndexes();
```

**Executar:** `node scripts/add-analytics-indexes.js`

---

## Arquivos Críticos

### Backend (Modificar/Criar)
1. ✏️ `src/controllers/analyticsController.js` - 3 novas funções
2. ✏️ `src/routes/analyticsRoutes.js` - Registrar rotas
3. ✏️ `src/models/Agendamento.js` - Adicionar índices
4. ➕ `scripts/add-analytics-indexes.js` - Script de migração

### Frontend (Modificar/Criar)
5. ➕ `laura-saas-frontend/src/pages/CalendarView.jsx` - Componente principal
6. ➕ `laura-saas-frontend/src/pages/Financeiro.jsx` - Página financeira
7. ➕ `laura-saas-frontend/src/components/AppointmentDetailModal.jsx`
8. ➕ `laura-saas-frontend/src/components/RescheduleConfirmModal.jsx`
9. ➕ `laura-saas-frontend/src/components/QuickAppointmentModal.jsx`
10. ➕ `laura-saas-frontend/src/components/RevenueLineChart.jsx`
11. ➕ `laura-saas-frontend/src/components/ServicePieChart.jsx`
12. ➕ `laura-saas-frontend/src/components/TopClientsTable.jsx`
13. ✏️ `laura-saas-frontend/src/App.tsx` - Adicionar 2 rotas
14. ✏️ `laura-saas-frontend/src/components/Navbar.jsx` - Adicionar 2 links

---

## Endpoints API

### Novos Endpoints (Fase 2B)

#### GET `/api/analytics/receita-temporal`
**Query:** `periodo` ('dia'|'semana'|'mes'), `dias` (número)
**Response:**
```json
{
  "periodo": "dia",
  "dias": 30,
  "dados": [
    { "data": "01/01", "receita": 450.00, "agendamentos": 12, "media": 37.50 }
  ]
}
```

#### GET `/api/analytics/distribuicao-servicos`
**Query:** `dataInicio`, `dataFim` (ISO dates)
**Response:**
```json
{
  "dataInicio": "2025-01-01",
  "dataFim": "2025-01-31",
  "servicos": [
    { "nome": "Massagem", "quantidade": 45, "receita": 2250.00, "percentual": 45 }
  ],
  "totalReceita": 5000.00
}
```

#### GET `/api/analytics/top-clientes`
**Query:** `limite` (default 10), `dataInicio`, `dataFim`
**Response:**
```json
{
  "clientes": [
    {
      "ranking": 1,
      "clienteId": "...",
      "nome": "Maria Silva",
      "receita": 850.00,
      "agendamentos": 15,
      "ticketMedio": 56.67
    }
  ]
}
```

---

## Estratégia de Testes

### Backend
- [ ] Testar agregações com múltiplos tenants (isolamento)
- [ ] Testar cálculo de receita (avulso + pacote)
- [ ] Testar filtros de data
- [ ] Testar queries com datasets grandes (>1000 agendamentos)

### Frontend - CalendarView
- [ ] Carregar agendamentos do mês atual
- [ ] Alternar entre mês/semana/dia
- [ ] Click em agendamento abre modal de detalhes
- [ ] Click em slot vazio abre modal de criação
- [ ] Drag-and-drop exibe modal de confirmação
- [ ] Detecção de conflitos funciona
- [ ] Validação de horário comercial funciona
- [ ] Cores por status corretas
- [ ] Responsivo em mobile (vista dia padrão)

### Frontend - Financeiro
- [ ] KPI cards carregam corretamente
- [ ] Line chart exibe tendência de receita
- [ ] Pie chart mostra distribuição de serviços
- [ ] Tabela top clientes ranqueada corretamente
- [ ] Filtro de data atualiza todos os charts
- [ ] Seletor de período (dia/semana/mês) funciona
- [ ] Loading states exibem
- [ ] Dark mode estilizado corretamente

### Multi-tenant
- [ ] Usuário A vê apenas seus agendamentos no calendário
- [ ] Usuário A vê apenas sua receita no financeiro
- [ ] Usuário B não acessa dados de A via API

---

## Checklist de Implementação

### Fase 2A: Calendário (12-15h) ✅
- [x] Instalar FullCalendar packages
- [x] Criar CalendarView.jsx
- [x] Implementar carregamento de eventos
- [x] Adicionar alternância mês/semana/dia
- [x] Implementar color-coding por status
- [x] Criar AppointmentDetailModal
- [x] Criar RescheduleConfirmModal
- [x] Implementar drag-and-drop com detecção de conflitos
- [x] Criar QuickAppointmentModal
- [x] Validação de horário comercial
- [x] Integrar rota /calendario
- [x] Atualizar Navbar
- [ ] Testar responsividade
- [ ] Testar isolamento multi-tenant

### Fase 2B: Analytics (10-12h) ✅
- [x] Criar getReceitaTemporal controller
- [x] Criar getDistribuicaoServicos controller
- [x] Criar getTopClientes controller
- [x] Atualizar analyticsRoutes.js
- [x] Adicionar índices compostos
- [ ] Executar script de migração
- [x] Criar RevenueLineChart
- [x] Criar ServicePieChart
- [x] Criar TopClientsTable
- [x] Criar Financeiro.jsx
- [x] Implementar filtro de data
- [x] Implementar seletor de período
- [x] Integrar rota /financeiro
- [x] Atualizar Navbar
- [ ] Testar com dados reais
- [ ] Verificar cálculo de receita de pacotes
- [ ] Testar isolamento multi-tenant

### Deploy (2-3h)
- [ ] Testar build de produção
- [ ] Validar variáveis de ambiente
- [ ] Deploy para staging
- [ ] Testes com usuários beta
- [ ] Deploy para produção
- [ ] Monitorar erros e performance

**Estimativa total:** 24-30 horas

---

## Melhorias Futuras (Pós-MVP)

1. **Agendamentos Recorrentes** - Semanais/mensais
2. **Lembretes SMS** - Integração Twilio
3. **Booking Online** - Widget para clientes
4. **Rastreamento de Pagamentos** - Faturas, pendências
5. **Gestão de Equipe** - Múltiplos profissionais
6. **Export Relatórios** - PDF/CSV do financeiro
7. **Sincronização Calendários** - Google Calendar, Outlook
