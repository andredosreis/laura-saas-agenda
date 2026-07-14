# Runbook — Pôr o Painel Super-Admin em produção (ADR-024)

Guia **standalone** para ligar o painel super-admin (Fase 1 + Fase 2 de leitura) em
produção no VPS Contabo. Seguir de cima para baixo. Não precisa do Claude.

Pressupõe a stack base já deployada (ver [`SETUP-CONTABO.md`](./SETUP-CONTABO.md)).
Substituir em todo o lado: `<dominio>` (ex.: `marcai.app`), `<IP>`, `<TENANT_ID>`.

> **Ordem importa:** a rota de métricas é **fail-closed** — sem `MONGO_TENANT_RO_URI`,
> `GET /admin/tenants/:id/uso` devolve erro (nunca usa a conexão principal). Por isso
> a credencial (passos 1–2) vem **antes** do deploy.

---

## 1. Criar o utilizador Mongo READ-ONLY (Atlas)

O painel lê dados de tenant com uma credencial **só de leitura** (Gate 4b). Escrita
é rejeitada pelo próprio Mongo.

1. Atlas → **Database Access** → **Add New Database User**.
2. Authentication Method: **Password**. Definir utilizador (ex.: `marcai_ro`) + password forte.
3. Database User Privileges → **Built-in Role** → **Only read any database**.
4. Add User.
5. Construir a connection string (igual à principal, mas com este user/pass):
   `mongodb+srv://marcai_ro:<PASS>@<cluster>.mongodb.net/?retryWrites=true&w=majority`

Esta string é o `MONGO_TENANT_RO_URI`.

---

## 2. Pôr a env var no Contabo

```bash
ssh marcai@<IP>
cd ~/marcai
nano .env
```

Adicionar (junto ao `MONGODB_URI`):

```
MONGO_TENANT_RO_URI=mongodb+srv://marcai_ro:<PASS>@<cluster>.mongodb.net/?retryWrites=true&w=majority
```

Guardar e sair.

---

## 3. Deploy da versão com o painel

```bash
git pull origin main      # traz Fase 1+2 (PRs #33/#34) + a rota /uso
docker compose -f docker-compose.prod.yml up -d --build backend
docker compose -f docker-compose.prod.yml ps          # backend "Up"
docker compose -f docker-compose.prod.yml logs --tail=50 backend   # sem erros de arranque
```

---

## 4. Smoke test (ainda sem superadmin)

```bash
# API viva
curl -i https://api.<dominio>/api/v1/auth/me                 # -> 401

# O painel está escondido a quem não tem token
curl -i https://api.<dominio>/api/v1/admin/tenants           # -> 401
```

A superfície `/admin/*` devolve **404** (não 403) a um utilizador autenticado que
não seja superadmin — de propósito (não revelar que existe). Confirma-se no passo 6.

---

## 5. Criar a conta superadmin

O superadmin **não nasce do registo** (que cria sempre `role: 'admin'`). Cria-se
**elevando** um utilizador existente.

### 5a. Registar (ou reutilizar) uma conta normal

```bash
curl -s -X POST https://api.<dominio>/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"nomeEmpresa":"Admin Marcai","nome":"Teu Nome","email":"super@<dominio>","password":"UmaPassForte@123"}'
```

### 5b. Elevar o role para `superadmin` na DB partilhada

```bash
mongosh "<MONGODB_URI>"     # a connection string PRINCIPAL (read-write)
```

Dentro do `mongosh`:

```javascript
show dbs                       // identificar a DB partilhada: a que tem as coleções
                               // `users` e `tenants` (NÃO uma `tenant_<id>`). Tipicamente "laura-saas".
use laura-saas                 // <-- substituir pelo nome real encontrado acima
db.users.updateOne({ email: "super@<dominio>" }, { $set: { role: "superadmin" } })
db.users.findOne({ email: "super@<dominio>" }, { email: 1, role: 1 })   // confirmar role: "superadmin"
```

> O `superadmin` já existe no enum do model `User`. O backend só valida `role` —
> o campo `permissoes` é só para o frontend mostrar/esconder botões.

### 5c. Re-login (o token antigo ainda tem role 'admin')

```bash
TOKEN=$(curl -s -X POST https://api.<dominio>/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"super@<dominio>","password":"UmaPassForte@123"}' \
  | jq -r '.data.tokens.accessToken')

echo "$TOKEN"     # deve imprimir um JWT (não "null")
```

---

## 6. Testar o painel

```bash
# Listar todos os tenants (cross-tenant, control-plane)
curl -s https://api.<dominio>/api/v1/admin/tenants \
  -H "Authorization: Bearer $TOKEN" | jq

# Detalhe de um tenant (usar um _id da lista acima)
curl -s https://api.<dominio>/api/v1/admin/tenants/<TENANT_ID> \
  -H "Authorization: Bearer $TOKEN" | jq

# Métricas de uso — a rota que precisa do MONGO_TENANT_RO_URI
curl -s https://api.<dominio>/api/v1/admin/tenants/<TENANT_ID>/uso \
  -H "Authorization: Bearer $TOKEN" | jq
# Esperado: { "success": true, "data": { "clientes": N, "agendamentos": N, "mensagens": N } }
```

---

## 7. Verificar a auditoria (recomendado)

Toda ação do painel grava no `AuditLog` (DB partilhada, append-only).

```bash
mongosh "<MONGODB_URI>"
use laura-saas     # ou o nome real da DB partilhada
db.auditlogs.find().sort({ createdAt: -1 }).limit(5).pretty()
# Esperado: entradas com action 'tenant.list' / 'tenant.view' / 'tenant.uso', status 'ok'.
# Se um não-superadmin tentou aceder, há uma entrada com status 'denied'.
```

---

## Troubleshooting

| Sintoma | Causa provável | Resolução |
|---|---|---|
| `/uso` → 500 ou erro `MONGO_TENANT_RO_URI não definido` | env var em falta ou não apanhada pelo container | Confirmar passo 2; recriar: `docker compose -f docker-compose.prod.yml up -d backend` |
| `/uso` → erro de permissão/leitura | credencial RO sem leitura nas `tenant_*` | No Atlas, o role tem de ser **Only read any database** (não read numa DB específica) |
| `/admin/*` → sempre **404** com o token superadmin | token ainda é o antigo (role 'admin') | Refazer o login (passo 5c) |
| `/admin/*` → **401** | token ausente/expirado | Refazer o login |
| `jq` devolve `null` no token | login falhou (credenciais/plano) | Ver a resposta sem `jq`: repetir o `curl` do 5c sem o pipe |

---

## Notas

- **Mutações (criar/suspender tenant, mudar plano) NÃO existem ainda** — é a Fase 3
  do ADR-024 (precisa do `adminMutation` transacional). O painel hoje é **só leitura**.
- A credencial RO é **verificada em runtime no arranque** (Gate 4b, F14), em duas
  camadas: (1) enumeração dos privilégios efectivos via `connectionStatus` — afirma
  que não há nenhuma acção de escrita sobre recursos de tenant (`tenant_*`, todas as
  DBs ou `anyResource`/`cluster`); (2) um canário de escrita numa DB-sentinela que
  tem de ser recusado. Se qualquer camada detectar escrita, o backend **recusa todas
  as leituras cross-tenant** do painel (`/uso` → 500) e regista em log + Sentry —
  fail-closed, mas nunca derruba o produto para os tenants. Por isso o passo 1 exige
  **Only read any database** (leitura, zero escrita); em testes o enforcement não se
  impõe (memory-server é read-write).
- Frontend do painel: fora deste runbook (a Fase 2 entregou as rotas de API; as
  páginas React são trabalho separado).
