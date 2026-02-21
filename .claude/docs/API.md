# API Reference — Marcai

Base URL: `http://localhost:5000/api`

Todas as rotas protegidas requerem header:
```
Authorization: Bearer <accessToken>
```

---

## Autenticação

### POST `/auth/register`
Criar nova conta (cria Tenant + User admin).

**Body:**
```json
{
  "nomeEmpresa": "Studio Bella",
  "nome": "Maria Silva",
  "email": "maria@exemplo.com",
  "password": "MinhaPass123!",
  "telefone": "912345678"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "nome": "Maria Silva", "email": "...", "role": "admin" },
    "tenant": { "id": "...", "nome": "Studio Bella", "slug": "studio-bella", "plano": {...} },
    "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 3600 }
  }
}
```

---

### POST `/auth/login`
**Body:** `{ "email": "...", "password": "..." }`

**Response 200:** mesmo formato do register

**Erros:**
- `401` — credenciais inválidas
- `423` — conta bloqueada (5 tentativas falhadas → bloqueio 2h)
- `403` — plano cancelado/expirado

---

### POST `/auth/refresh`
**Body:** `{ "refreshToken": "..." }`

**Response 200:**
```json
{
  "success": true,
  "data": { "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 3600 } }
}
```

---

### POST `/auth/logout` 🔒
**Body:** `{ "refreshToken": "..." }`

---

### GET `/auth/me` 🔒
Retorna dados do utilizador e tenant actuais.

---

### PUT `/auth/profile` 🔒
**Body:** `{ "nome": "...", "telefone": "..." }`

---

### PUT `/auth/password` 🔒
**Body:** `{ "currentPassword": "...", "newPassword": "..." }`

---

### POST `/auth/forgot-password`
**Body:** `{ "email": "..." }`
Envia email com link de recuperação (expira em 1h).

---

### POST `/auth/reset-password`
**Body:** `{ "token": "...", "password": "..." }`

---

### GET `/auth/verify-reset-token/:token`
Verifica se o token de reset é válido.

---

### GET `/auth/verify-email/:token`
Confirma o email do utilizador. Marca `emailVerificado: true`.

---

## Clientes 🔒

### GET `/clientes`
Lista todos os clientes do tenant.

**Query params:** `?search=nome&ativo=true&page=1&limit=20`

---

### POST `/clientes`
**Body:**
```json
{
  "nome": "João Costa",
  "telefone": "963456789",
  "email": "joao@exemplo.com",
  "dataNascimento": "1990-05-15",
  "observacoes": "Alérgico a látex"
}
```

**Erro 400:** `"Já existe um cliente com este telefone"` (dentro do mesmo tenant)

---

### GET `/clientes/:id`
Detalhe completo (inclui anamnese).

### PUT `/clientes/:id`
Actualizar dados ou ficha de anamnese.

### DELETE `/clientes/:id`
Remover cliente.

---

## Agendamentos 🔒

### GET `/agendamentos`
**Query:** `?data=2026-02-21&clienteId=...&status=agendado`

### POST `/agendamentos`
```json
{
  "clienteId": "...",
  "data": "2026-02-21",
  "hora": "14:30",
  "servico": "Massagem relaxante",
  "duracao": 60,
  "pacoteId": null
}
```

### PUT `/agendamentos/:id`
Actualizar ou mudar estado: `agendado | confirmado | realizado | cancelado | nao_compareceu`

### DELETE `/agendamentos/:id`

### POST `/agendamentos/:id/enviar-lembrete`
Envia lembrete WhatsApp manualmente.

---

## Dashboard 🔒

### GET `/dashboard/agendamentosHoje`
### GET `/dashboard/agendamentosAmanha`
### GET `/dashboard/proximos-agendamentos`
### GET `/dashboard/clientesAtendidosSemana`
### GET `/dashboard/sessoes-baixas`
Clientes com sessões restantes ≤ 2.

### GET `/dashboard/totais`

---

## Pacotes 🔒

### GET `/pacotes`
### POST `/pacotes`
```json
{
  "nome": "Pacote 10 Sessões",
  "descricao": "...",
  "sessoes": 10,
  "preco": 150,
  "categoria": "massagem"
}
```
### PUT `/pacotes/:id`
### DELETE `/pacotes/:id`

---

## Disponibilidade 🔒

### GET `/disponibilidade`
Retorna configuração de horários por dia da semana.

### PUT `/disponibilidade`
```json
{
  "segunda": { "ativo": true, "inicio": "09:00", "fim": "18:00", "intervalo": 30 },
  "terca": { "ativo": true, "inicio": "09:00", "fim": "18:00", "intervalo": 30 },
  "sabado": { "ativo": false }
}
```

---

## Financeiro 🔒

### GET `/financeiro/resumo`
### GET `/financeiro/transacoes`
### POST `/financeiro/transacoes`

---

## Webhooks (público)

### POST `/webhook/whatsapp`
Recebe mensagens da Z-API. Processa com OpenAI e responde automaticamente.

**Headers requeridos pela Z-API:** `x-api-token`

---

## Códigos de Erro

| Código | Significado |
|--------|-------------|
| 400 | Dados inválidos ou regra de negócio violada |
| 401 | Não autenticado (token ausente/expirado) |
| 403 | Sem permissão (role ou plano insuficiente) |
| 404 | Recurso não encontrado |
| 409 | Conflito (duplicado) |
| 423 | Conta bloqueada |
| 500 | Erro interno |

Todos os erros seguem o formato:
```json
{ "success": false, "error": "Mensagem descritiva" }
```
