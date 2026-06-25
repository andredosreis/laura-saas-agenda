# Simulação de Onboarding no Super Admin — Plano de Teste

**Estado:** Plano de teste activo
**Data:** 2026-06-24
**Objectivo:** Ensaiar, ponta-a-ponta, o **onboarding de um cliente** através do painel super-admin — simulando "colocar um cliente" antes de o fazer a sério. Valida o painel (F01–F11, ADR-024) e identifica o que ainda é **manual** (fora do painel).
**Relacionado:** `docs/negocio/oferta-consultoria.md` (modelo de venda) · `docs/negocio/guiao-pitch.md` · `docs/produto/PRD-painel-superadmin.md`

---

## ⚠️ Avisos antes de começar (ler!)

1. **NÃO correr contra produção.** O `.env` local aponta para o **cluster Atlas de PRODUÇÃO** — qualquer tenant criado pelo backend local escreve **dados reais**. Fazer esta simulação **em ambiente de DEV** (BD de desenvolvimento separada). Se mesmo assim for contra produção, usar um nome inequívoco (`ZZ-TESTE-...`) e **apagar no fim**.
2. **Conta superadmin de dev:** `dev-superadmin@marcai.pt` (já existe na BD de dev). Em produção, usar a conta superadmin real.
3. **Etiqueta de tier:** o enum no código ainda é `basico/pro/elite/custom`. Comercialmente, **`basico` = "Essencial"** (ver nota em `docs/negocio/oferta-consultoria.md`). Ao criar, escolher `basico` e ajustar limites à mão.

---

## Pré-requisitos

- [ ] Backend e frontend a correr (ver `CLAUDE.md` → Environment).
- [ ] Conta com `role: superadmin` acessível.
- [ ] Painel acessível em `/admin` (frontend) → API em `/api/v1/admin/*`.
- [ ] Confirmado que **NÃO** se está a apontar para o cluster de produção (ver aviso 1).

---

## Cliente-tipo de teste (estética, à imagem da Laura)

| Campo | Valor de teste |
|---|---|
| Nome da empresa | `ZZ-TESTE Clínica Estética Bella` |
| Slug | auto (`zz-teste-clinica-estetica-bella`) |
| Tier (enum) | `basico` (= **Essencial** comercial) |
| Admin — nome | `Maria Teste` |
| Admin — email | `zz-teste-bella@exemplo.pt` |
| Limites (Essencial) | maxClientes, maxUsuarios=3, maxAgendamentosMes, maxLeads — conforme defaults do plano |
| Flags | `iaAtiva` = on (testar IA) |

---

## Fluxo de teste passo-a-passo

> Marca cada teste como ✅ Passou / ❌ Falhou / ⚠️ Manual. Os ⚠️ alimentam o roadmap.

### T1 — Acesso ao painel (F01)
1. Login como **não-superadmin** → tentar abrir `/admin`.
   - **Esperado:** painel invisível; rota `/admin/*` devolve **404** (nunca 403).
2. Login como **superadmin** → abrir `/admin`.
   - **Esperado:** painel carrega (tema dark indigo/purple/slate).
- Resultado: [ ]

### T2 — Criar tenant + admin user (F06)
1. Formulário "Criar tenant" → preencher com o cliente-tipo acima, tier `basico`.
2. Submeter.
   - **Esperado:** Tenant criado + 1 User `role: admin`, `emailVerificado: false`; email de verificação enviado; aparece na listagem.
   - **Esperado (negativo):** email duplicado → **409**, nenhum tenant criado.
   - **Esperado:** acção auditada (`tenant.create`).
- Resultado: [ ]

### T3 — Listagem e detalhe (F02 / F03)
1. Ver o tenant na listagem paginada (nome, slug, tier, status, data).
2. Abrir o detalhe → plano, limites, config, nº de utilizadores.
   - **Esperado (negativo):** id inválido → 400; inexistente → 404.
- Resultado: [ ]

### T4 — Configurar plano / limites / flags (F07)
1. Ajustar limites para os do **Essencial** (maxUsuarios=3, etc.) e ligar `iaAtiva`.
2. Guardar.
   - **Esperado:** muda imediatamente para o tenant; auditado com diff before/after só dos campos alterados.
   - **Esperado (negativo):** valor fora de enum / limite negativo → 400 com o campo.
- Resultado: [ ]

### T5 — Métricas de uso (F04)
1. Abrir "uso" do tenant → nº de clientes, agendamentos, mensagens.
   - **Esperado:** lê pela ligação **read-only** (`getTenantDBAdmin`); sem credencial RO → erro, **nunca** lê pela ligação de escrita.
- Resultado: [ ]

### T6 — Login como o admin do tenant criado
1. Verificar email (link) e definir password do `zz-teste-bella@exemplo.pt`.
2. Login no produto (não no painel) como esse admin.
   - **Esperado:** entra no tenant correcto, vê dados vazios (tenant novo), limites aplicados.
- Resultado: [ ]

### T7 — Configuração da IA e WhatsApp ⚠️ (FORA DO PAINEL — manual)
> Estes passos **não** estão no painel (ADR-024 Fase 4 / out of scope §7). Fazem parte da **fase 2 do processo de consultoria** (`docs/negocio/oferta-consultoria.md` §5). Registar como trabalho manual.
1. Afinar o **prompt** e o `servicos.md` do tenant para o negócio.
2. Definir o **fluxo de conversão** (ex: estética → IA marca avaliação, não dá preços).
3. **Ligar o WhatsApp** (Evolution API, QR) — ver `docs/operacoes/evolution-api-operations.md`.
   - **Esperado:** a IA responde no WhatsApp do tenant de teste.
- Resultado: ⚠️ Manual — [ ]

### T8 — Suspender / Reactivar (F08)
1. Suspender o tenant (com motivo opcional).
   - **Esperado:** `plano.status = suspenso`; staff do tenant recebe **403** nas rotas de produto; superadmin continua a gerir.
2. Reactivar.
   - **Esperado:** `status = ativo`, acesso restaurado. Idempotente. Ambos auditados.
- Resultado: [ ]

### T9 — Audit log (F09)
1. Abrir o visualizador de auditoria, filtrar pelo tenant de teste.
   - **Esperado:** entradas para create/view/configure/suspend/reactivate + o **denied** do T1; nenhuma rota apaga/edita entradas.
- Resultado: [ ]

### T10 — Limpeza
1. Se foi em produção: suspender e marcar o tenant `ZZ-TESTE...` para remoção (ou remover via script de manutenção).
   - **Esperado:** ambiente limpo, sem dados de teste em produção.
- Resultado: [ ]

---

## Resumo de resultados

| Teste | Estado | Notas |
|---|---|---|
| T1 Acesso | | |
| T2 Criar tenant | | |
| T3 Listagem/detalhe | | |
| T4 Plano/limites | | |
| T5 Uso | | |
| T6 Login admin | | |
| T7 IA/WhatsApp (manual) | | |
| T8 Suspender/reactivar | | |
| T9 Audit | | |
| T10 Limpeza | | |

---

## Gaps identificados (alimentam o roadmap)

> Tudo o que apareceu como ⚠️ manual ou ❌ falhou. O objectivo é que o onboarding de um cliente real seja o mais fluido possível.

- [ ] **Config IA por tenant no painel** (prompt, `servicos.md`, fluxo) — hoje manual (ADR-024 Fase 4).
- [ ] **Ligar WhatsApp/Evolution a partir do painel** — hoje manual (QR).
- [ ] **Setup fee / billing** — fora do sistema (fatura/transferência); decidir se entra no painel.
- [ ] **Rename enum** `basico`→`essencial` + largar `elite` (alinha com `docs/negocio/oferta-consultoria.md`).
- [ ] _(adicionar o que surgir na simulação)_
