# 📋 Relatório de Melhorias — Laura SaaS Agenda (Marcai)

**Data:** 17/04/2026  
**Versão:** Branch `Colcando_skills`

---

## Estado Atual dos Problemas

| # | Problema | Status | Solução |
|---|---------|--------|---------|
| 1 | Sidebar: Finanças aparece antes de Agendamento | ✅ Resolvido | Reordenado: Agendamento > Finanças |
| 2 | Link de Agendamentos não visível no menu | ✅ Resolvido | Adicionado link `/agendamentos` com ícone ListChecks |
| 3 | Lead fecha pacote → não abre vendas com nome/valor | ✅ Resolvido | Adicionado Step 3 no FunilAvaliacaoModal com seleção de serviço, valor e registo automático |
| 4 | Nome do cliente não aparece em Finanças | ✅ Resolvido | Venda via `/compras-pacotes` API associa cliente automaticamente à transação |
| 5 | Deploy na Vercel não chega com mudanças | ⏳ Pendente | Necessário merge do branch `Colcando_skills` para `main` + push |
| 6 | Email não aparece ao editar cliente | ✅ Resolvido | Campo email adicionado ao formulário EditarCliente |
| 7 | Sessões contratadas não aparecem na ficha | ✅ Resolvido | Filtro relaxado para mostrar todos os pacotes ativos |
| 8 | Sessões não diminuem quando usadas | ✅ Resolvido | Removidos campos legados; dados reais vêm de CompraPacote |

---

## Detalhes das Alterações

### 1. Sidebar — Reordenação (Sidebar.jsx)

**Antes:**
```
Dashboard > FINANÇAS > AGENDAMENTO > ADMINISTRATIVO
```

**Depois:**
```
Dashboard > AGENDAMENTO > FINANÇAS > ADMINISTRATIVO
```

### 2. Sidebar — Link Agendamentos (Sidebar.jsx)

Adicionado item no grupo "AGENDAMENTO":
- **Agendamentos** → `/agendamentos` (ícone: ListChecks)
- Calendário → `/calendario`
- Atendimentos → `/atendimentos`

### 3. Funil de Avaliação — Step 3: Venda (FunilAvaliacaoModal.jsx)

**Fluxo anterior:**
1. Presença (compareceu?)
2. Fechou pacote? → Sim → Redireciona para `/transacoes` (sem contexto)

**Fluxo novo:**
1. Presença (compareceu?)
2. Fechou pacote? → Sim → Lead convertido a Cliente automaticamente
3. **Registar Venda** (novo step):
   - Selecção do tipo de massagem/serviço
   - Valor (editável, pré-preenchido com o valor padrão)
   - Forma de pagamento
   - Resumo: Nome do cliente + Serviço + Valor
   - Botão "Registar Venda" → Cria `CompraPacote` + `Transação` automaticamente
   - Botão "Registar Depois" → Pula e permite registar mais tarde

### 4. Nome do Cliente em Finanças

O problema era que o redirecionamento ia para `/transacoes` (lista genérica) sem contexto.  
Agora a venda é criada via API `/compras-pacotes` no Step 3 do funil, que automaticamente:
- Cria a `CompraPacote` com `cliente` associado
- Cria a `Transação` com `cliente` e descrição `"Venda de pacote: {pacote} - {cliente}"`
- O nome do cliente aparece correctamente em Transações e Relatórios

### 5. Deploy Vercel

**Diagnóstico:** O branch `Colcando_skills` está à frente de `main`. A Vercel faz deploy automático do `main`.

**Acção necessária:**
```bash
git checkout main
git merge Colcando_skills
git push origin main
```

---

## Ficheiros Alterados

| Ficheiro | Tipo |
|----------|------|
| `laura-saas-frontend/src/components/Sidebar.jsx` | Modificado |
| `laura-saas-frontend/src/components/FunilAvaliacaoModal.jsx` | Reescrito |
| `laura-saas-frontend/src/pages/EditarCliente.jsx` | Modificado |
| `docs/MELHORIAS.md` | Criado (este ficheiro) |

---

## Melhorias Futuras Sugeridas

- [ ] Adicionar campo de observações na venda rápida do funil
- [ ] Dashboard financeiro: mostrar vendas recentes do dia
- [ ] Notificação push ao cliente quando pacote é activado
- [ ] Caixa diário (página desactivada — `Caixa.jsx` existe mas está comentada)
- [ ] Parcelamento no funil de avaliação (actualmente só pagamento à vista no step 3)
