# 🐛 PROBLEMA: Faturamento Zerado nas Transações

**Data do Relatório:** 13 de Janeiro de 2026
**Status:** ✅ RESOLVIDO
**Prioridade:** 🔥 ALTA - Impacta visualização de faturamento
**Data da Resolução:** 13 de Janeiro de 2026

---

## 📋 DESCRIÇÃO DO PROBLEMA

Na página de **Transações** (`/transacoes`), os cards de resumo financeiro estão mostrando valores zerados, mesmo com transações listadas na tabela:

```
┌─────────────────────────────────────────┐
│ Total Receitas:  €0.00                  │
│ Total Despesas:  €0.00                  │
│ Saldo:           €0.00                  │
└─────────────────────────────────────────┘

Mas na tabela abaixo aparecem:
- 13/01/2026 | Receita | Pacote | +€50.00 | Pago
- 11/01/2026 | Receita | Pacote | +€50.00 | Pago
- 11/01/2026 | Receita | Outros | +€50.00 | Pago
```

**Problema:** As transações existem e aparecem listadas, mas os **totais calculados estão sempre em €0.00**.

---

## 🔍 ANÁLISE REALIZADA

### 1. **Frontend (Transacoes.jsx)**

**Arquivo:** `laura-saas-frontend/src/pages/Transacoes.jsx`

**Linha 103:** Frontend busca totais do backend
```javascript
setTotais(response.data.totais || { receitas: 0, despesas: 0, saldo: 0 });
```

**Conclusão:** Frontend está correto, apenas exibe o que o backend retorna.

---

### 2. **Backend - Controller (transacaoController.js)**

**Arquivo:** `src/controllers/transacaoController.js`

**Linhas 136-152:** Cálculo dos totais usando MongoDB Aggregation
```javascript
// Calcular totais
const resumo = await Transacao.aggregate([
  { $match: query },
  {
    $group: {
      _id: '$tipo',
      total: { $sum: '$valorFinal' },
      quantidade: { $sum: 1 }
    }
  }
]);

const totais = {
  receitas: resumo.find(r => r._id === 'Receita')?.total || 0,
  despesas: resumo.find(r => r._id === 'Despesa')?.total || 0,
  saldo: 0
};
totais.saldo = totais.receitas - totais.despesas;
```

**Problema Identificado:**
- O aggregate usa `{ $match: query }` com a mesma query da listagem
- A **listagem encontra 3 transações**, mas o **aggregate retorna 0**
- Isso indica que o aggregate não está encontrando as transações

---

### 3. **Possíveis Causas**

#### **Causa 1: Problema com ObjectId no aggregate** 🎯 MAIS PROVÁVEL

O `tenantId` pode estar como **String** no query, mas no banco pode ser **ObjectId**, causando o aggregate não encontrar nada.

```javascript
// Query atual
query.tenantId = req.tenantId; // String?

// Possível solução
query.tenantId = mongoose.Types.ObjectId(req.tenantId);
```

**Por que isso afeta o aggregate mas não o find?**
- O método `.find()` do Mongoose faz **conversão automática** de String para ObjectId
- O método `.aggregate()` **NÃO faz conversão automática**
- Resultado: `.find()` encontra, mas `.aggregate()` não

---

#### **Causa 2: Filtro de data muito restritivo** ⚠️ POSSÍVEL

As transações da imagem são de:
- 13/01/2026
- 11/01/2026 (2x)

O filtro padrão é "últimos 30 dias" (Transacoes.jsx linha 54):
```javascript
dataInicio: DateTime.now().minus({ days: 30 }).toISODate(),
dataFim: DateTime.now().toISODate()
```

**Mas:** As transações aparecem na listagem, então o filtro está correto. ✅

---

#### **Causa 3: Campo valorFinal é 0 ou null** ❓ IMPROVÁVEL

As transações poderiam ter sido criadas com `valorFinal = 0`.

**Mas:** As transações aparecem com valor "+€50.00" na tabela, então têm valor. ✅

---

#### **Causa 4: Problema de timezone** ❓ IMPROVÁVEL

O filtro de data usa timezone Europa/Lisboa:
```javascript
const inicio = DateTime.fromISO(dataInicio).setZone('Europe/Lisbon').startOf('day').toJSDate();
const fim = DateTime.fromISO(dataFim).setZone('Europe/Lisbon').endOf('day').toJSDate();
query.createdAt = { $gte: inicio, $lte: fim };
```

**Mas:** Se fosse timezone, a listagem também não funcionaria. ✅

---

## 🔧 HISTÓRICO DE CORREÇÕES REALIZADAS

### **Correção 1: Duplicação de Receita de Pacotes** ✅ IMPLEMENTADA

**Problema anterior:** Sistema criava 2 transações para pacotes:
1. Venda do pacote: €500
2. Uso de cada sessão: €50 x 10 = €500
3. **Total duplicado: €1000**

**Solução implementada:**
- **Removida** criação de transação no uso de sessão ([agendamentoController.js:226-234](../../../src/controllers/agendamentoController.js#L226-L234))
- **Mantida** transação apenas na venda do pacote ([compraPacoteController.js:66-98](../../../src/controllers/compraPacoteController.js#L66-L98))

**Arquivos modificados:**
- `src/controllers/agendamentoController.js` - Linhas 218-242
- `src/controllers/compraPacoteController.js` - Linhas 66-98
- `src/controllers/transacaoController.js` - Linhas 136-159 (logs de debug)

---

### **Correção 2: Forma de pagamento inválida** ✅ IMPLEMENTADA

**Problema:** Transações de pacote tinham `formaPagamento: 'Pacote'` (inválido)

**Solução:** Alterado para `formaPagamento: null` (válido)

**Arquivo:** `src/controllers/agendamentoController.js` - Linha 239 (antes da remoção)

---

### **Correção 3: Endpoint para pagamento de serviço avulso** ✅ IMPLEMENTADA

**Criado novo endpoint:** `POST /api/agendamentos/:id/pagamento`

**Funcionalidade:** Registra pagamento de serviços avulsos com forma de pagamento específica

**Arquivos:**
- `src/controllers/agendamentoController.js` - Linhas 402-521
- `src/routes/agendamentoRoutes.js` - Linha 33

---

## 🧪 LOGS DE DEBUG ADICIONADOS

Para identificar o problema, foram adicionados logs em:

### **1. transacaoController.js (Linhas 136-159)**
```javascript
console.log('[listarTransacoes] 🔍 Query para aggregate:', JSON.stringify(query, null, 2));
console.log('[listarTransacoes] 📊 Total de transações encontradas:', total);
console.log('[listarTransacoes] 📈 Resumo do aggregate:', JSON.stringify(resumo, null, 2));
console.log('[listarTransacoes] 💰 Totais calculados:', totais);
```

### **2. transacaoController.js (Linhas 136-146)**
```javascript
if (transacoes.length > 0) {
  console.log('[listarTransacoes] 🔍 Primeira transação:', {
    _id: transacoes[0]._id,
    tipo: transacoes[0].tipo,
    categoria: transacoes[0].categoria,
    valor: transacoes[0].valor,
    desconto: transacoes[0].desconto,
    valorFinal: transacoes[0].valorFinal,
    createdAt: transacoes[0].createdAt
  });
}
```

### **3. compraPacoteController.js (Linhas 67-98)**
```javascript
console.log('[venderPacote] 💰 Criando transação de receita:', { ... });
console.log('[venderPacote] ✅ Transação criada:', { ... });
```

---

## 🎯 PRÓXIMOS PASSOS PARA DIAGNÓSTICO

### **Passo 1: Verificar logs do backend**

Executar:
```bash
cd /Users/andredosreis/Documents/Projetos/laura-saas-agenda
npm run dev
```

Acessar `/transacoes` no frontend e verificar logs no terminal do backend.

**O que esperar ver:**
```
[listarTransacoes] 🔍 Query para aggregate: {
  "tenantId": "67845abc123...",  // ← Verificar se é String ou ObjectId
  "createdAt": {
    "$gte": "2025-12-14T00:00:00.000Z",
    "$lte": "2026-01-13T23:59:59.999Z"
  }
}
[listarTransacoes] 📊 Total de transações encontradas: 3
[listarTransacoes] 🔍 Primeira transação: {
  "_id": "...",
  "tipo": "Receita",
  "valor": 50,
  "valorFinal": 50,  // ← Verificar se é 50 ou 0
  "createdAt": "2026-01-13T..."
}
[listarTransacoes] 📈 Resumo do aggregate: []  // ← Verificar se está vazio
[listarTransacoes] 💰 Totais calculados: { receitas: 0, despesas: 0, saldo: 0 }
```

---

### **Passo 2: Testar consulta direta no MongoDB**

Se os logs mostrarem que o aggregate retorna vazio, testar diretamente:

```javascript
// No MongoDB Compass ou mongo shell
db.transacaos.find({ tenantId: "ID_DO_TENANT" }).limit(3)
// ↑ Verificar se retorna transações

db.transacaos.aggregate([
  { $match: { tenantId: "ID_DO_TENANT" } },
  { $group: { _id: "$tipo", total: { $sum: "$valorFinal" } } }
])
// ↑ Verificar se retorna vazio
```

Se `.find()` funciona mas `.aggregate()` não, **confirma Causa 1** (problema de ObjectId).

---

### **Passo 3: Aplicar correção se Causa 1 confirmada**

**Arquivo:** `src/controllers/transacaoController.js`

**Mudança:**
```javascript
// ANTES (linha 100)
const query = { tenantId: req.tenantId };

// DEPOIS
import mongoose from 'mongoose';
const query = {
  tenantId: mongoose.Types.ObjectId.isValid(req.tenantId)
    ? new mongoose.Types.ObjectId(req.tenantId)
    : req.tenantId
};
```

---

## 📊 INFORMAÇÕES DO SISTEMA

### **Ambiente**
- **Backend:** Node.js + Express + MongoDB
- **Frontend:** React + Vite
- **Database:** MongoDB (Mongoose ODM)
- **Timezone:** Europe/Lisbon
- **Moeda:** Euro (€)

### **Modelos Envolvidos**
1. **Transacao** (`src/models/Transacao.js`)
   - Campos: `tipo`, `categoria`, `valor`, `desconto`, `valorFinal`, `statusPagamento`, `tenantId`
   - Middleware `pre('save')`: Calcula `valorFinal = valor - desconto`

2. **CompraPacote** (`src/models/CompraPacote.js`)
   - Vinculado a Transacao na venda
   - Controla sessões usadas/restantes

3. **Pagamento** (`src/models/Pagamento.js`)
   - Registra detalhes de cada pagamento (MBWay, Multibanco, etc.)

### **Fluxo de Dados**
```
VENDA DE PACOTE:
CompraPacoteController.venderPacote()
  → Cria CompraPacote
  → Cria Transacao (tipo: Receita, categoria: Pacote)
  → Retorna ao frontend

USO DE SESSÃO:
AgendamentoController.updateStatusAgendamento()
  → Chama compraPacote.usarSessao()
  → Decrementa sessões
  → NÃO cria Transacao (correção implementada)

LISTAGEM DE TRANSAÇÕES:
TransacaoController.listarTransacoes()
  → Busca transações com .find() ✅ FUNCIONA
  → Calcula totais com .aggregate() ❌ NÃO FUNCIONA
  → Retorna { transacoes, totais, paginacao }
```

---

## ✅ PROBLEMA RESOLVIDO

**Causa Confirmada:** Problema de conversão de ObjectId no aggregate (Causa 1)

**Solução Aplicada:**
- Conversão explícita de `req.tenantId` (String) para ObjectId antes de usar em `.aggregate()`
- Correção aplicada em 3 controllers: `transacaoController.js`, `compraPacoteController.js`, `pagamentoController.js`

**Resultado:**
- ✅ Cards de resumo financeiro mostram valores corretos
- ✅ Transações são listadas corretamente
- ✅ Dados estão salvos no banco
- ✅ Relatórios financeiros funcionam corretamente

**Arquivos Modificados:**
- `src/controllers/transacaoController.js` - Linhas 103-105 e 509-511
- `src/controllers/compraPacoteController.js` - Linha 470-474
- `src/controllers/pagamentoController.js` - Linhas 393-396

---

## 📝 NOTAS ADICIONAIS

### **Transações Duplicadas Antigas**

Se houver transações duplicadas criadas **antes** da correção da duplicação de receita, elas podem ser limpas com:

```javascript
// Script de limpeza (executar com cuidado!)
// Remove transações de uso de sessão (categoria=Pacote, com agendamento vinculado)

db.transacaos.deleteMany({
  tipo: 'Receita',
  categoria: 'Pacote',
  agendamento: { $ne: null }
});
```

**⚠️ AVISO:** Executar apenas após backup do banco!

---

## 🆘 PRECISA DE MAIS INFORMAÇÕES

Para continuar o diagnóstico, necessário:

1. ✅ **Logs do backend** ao acessar `/transacoes`
2. ⏳ **Resultado da query direta no MongoDB**
3. ⏳ **Screenshot mostrando valores na tabela vs cards zerados**

---

**Documento criado em:** 13/01/2026
**Última atualização:** 13/01/2026
**Responsável:** Claude Code + André dos Reis
**Relacionado a:** `plano_fase3_sistema_financeiro.md`
