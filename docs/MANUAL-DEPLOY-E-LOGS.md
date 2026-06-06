# Manual — Deploy, Versão e Logs (Contabo)

Guia prático para publicar alterações, saber **que versão está a correr**, e ver
os logs. Escrito para uso rápido, sem assumir conhecimento de servidores.

---

## 1. O essencial em 30 segundos

| Parte | Onde corre | Como atualiza |
|---|---|---|
| **Frontend** (o site/app) | **Vercel** | **Automático** a cada merge em `main` ✅ |
| **Backend + IA + WhatsApp** | **Servidor Contabo** | **Automático** via GitHub Action (depois de configurado) — ou manual |

> O **frontend** sempre foi automático. O **backend** era manual; com o GitHub Action
> (`.github/workflows/deploy.yml`) passa também a automático a cada merge em `main`.

**Dados do servidor:**
- IP: `80.241.222.235` · Utilizador: `root`
- Pasta do projeto: `/opt/marcai` · Orquestração: `docker-compose.prod.yml`
- ⚠️ O servidor **não tem git** (o código é copiado). Por isso o deploy **não** é `git pull`.

---

## 2. Como saber QUE VERSÃO está a correr (o mais importante)

O **nginx NÃO mostra a versão** — ele é só o "porteiro" que encaminha os pedidos
(`api.` → backend, `wa.` → evolution, `logs.` → dozzle). Para saber a versão usa:

### A. Endpoint `/version` (a forma mais fácil)
Abre no browser (ou `curl`):
```
https://api.<o-teu-dominio>/api/version     ->  { "version": "<commit>", "builtAt": "..." }
```
O `version` é o **commit** que está MESMO a correr. Compara com o último commit em
`main` no GitHub: se forem iguais, está atualizado. (O ia-service tem o seu: `GET /version`.)

### B. Dentro do contentor (no servidor)
```bash
docker exec marcai-backend printenv GIT_SHA
docker exec marcai-ia-service printenv GIT_SHA
```

### Lição-chave: **copiar ≠ reconstruir**
Copiar ficheiros muda o **disco**; o contentor só corre o código novo depois do
`--build`. "Reiniciar" (`Up 5 minutes`) **não** quer dizer "atualizou".

---

## 3. Fazer deploy

### Opção A — Automático (recomendado)
Depois de configurado (secção 6), **não fazes nada**: cada merge em `main` que
toque no backend/ia-service dispara o deploy. Vês o progresso em **GitHub → Actions**.

### Opção B — Manual, com 1 comando (script)
1. No Terminal do Mac: `ssh root@80.241.222.235`
2. Já no servidor (a linha começa por `root@vmi3244070`):
   ```bash
   bash /opt/marcai/deploy/deploy.sh
   ```
   O script baixa `main`, copia só o código da app (não toca em `.env`/`nginx`),
   reconstrói o backend + ia-service e no fim mostra a versão deployada.

### Opção C — Manual, passo a passo (à mão)
Útil para perceberes o que acontece. Comandos curtos (colar **um por linha**):

```
ssh root@80.241.222.235
```
Já dentro do servidor (linha `root@vmi3244070`):
```
cd /tmp
rm -rf new
git clone --depth 1 https://github.com/andredosreis/laura-saas-agenda.git new
cp -rf new/src/. /opt/marcai/src/
cp -rf new/ia-service/src/. /opt/marcai/ia-service/src/
cd /opt/marcai
docker compose -f docker-compose.prod.yml up -d --build backend ia-service
```
1. `git clone` → baixa o código de `main` para `/tmp/new`.
2. `cp` → copia o código novo para `/opt/marcai` (não mexe em `.env`/`nginx`).
3. `up -d --build` → **reconstrói** a imagem com o código novo e **reinicia** os
   contentores. **O `--build` é obrigatório** — sem ele, reinicia o código antigo.

> ⚠️ Se um comando longo se partir ao colar (o terminal mete uma quebra a meio),
> cola **uma linha de cada vez**. Confirma sempre que estás no servidor: a linha
> tem de começar por `root@vmi3244070` (e não `…@MacBookPro`).

> Não consegues entrar no servidor? Painel Contabo → menu `⋮` →
> **"Redefinir Credenciais"** (nova senha root) ou **"Controle VNC"** (console no browser).

---

## 4. Ver os logs

### A. No navegador (Dozzle) — se `logs.<dominio>` estiver configurado
```
https://logs.<o-teu-dominio>
```
(login basic-auth). Mostra os logs de todos os serviços ao vivo, sem terminal.

### B. No terminal (sempre funciona) — dentro do servidor
```bash
# ao vivo (Ctrl+C para sair)
docker compose -f docker-compose.prod.yml logs -f backend ia-service
# últimas 100 linhas
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

### Mensagens-chave a procurar
| Mensagem | Significa |
|---|---|
| `webhook_routed` | Uma mensagem entrou e foi encaminhada |
| `[webhook] áudio transcrito` / `transcribe_ok` | Nota de voz transcrita com sucesso |
| `[webhook] áudio: download falhou` | Não descarregou o áudio do Evolution |
| `webhook_manual_outbound_persisted` | Gravou uma resposta dada pelo telemóvel |
| `[Redis] Ligado` | Fila de lembretes ligada |

---

## 5. Estado / reiniciar

```bash
docker compose -f docker-compose.prod.yml ps              # estado de tudo
docker compose -f docker-compose.prod.yml restart backend # reiniciar um serviço
```

---

## 6. Ligar o auto-deploy (uma vez)

Em **GitHub → Settings → Secrets and variables → Actions → New repository secret**, cria:

| Secret | Valor |
|---|---|
| `CONTABO_HOST` | `80.241.222.235` |
| `CONTABO_USER` | `root` |
| `CONTABO_SSH_KEY` | a **chave privada** SSH cuja pública está no `~/.ssh/authorized_keys` do servidor |

A partir daí, cada merge em `main` (que toque no backend/ia-service) faz deploy
sozinho. Para disparar à mão: **Actions → Deploy (Contabo) → Run workflow**.

---

## 7. Verificar se está MESMO atualizado

A pergunta-chave: **"o commit que está a correr é o último de `main`?"**

### Passo 1 — Qual é o último commit em `main` (no GitHub)
Abre: `https://github.com/andredosreis/laura-saas-agenda/commits/main`
→ o commit do topo tem um código curto (ex.: `a1b2c3d`). É a "versão alvo".

### Passo 2 — Qual o commit a correr no servidor
Duas formas (qualquer uma serve):

**a) Pelo navegador** (mais fácil):
```
https://api.<o-teu-dominio>/api/version
```
→ devolve `{ "version": "a1b2c3d", ... }`. Esse `version` é o que está a correr.

**b) No servidor** (terminal):
```
docker exec marcai-backend printenv GIT_SHA
docker exec marcai-ia-service printenv GIT_SHA
```

### Passo 3 — Comparar
- **Iguais** (Passo 1 == Passo 2) → ✅ está atualizado.
- **Diferentes** → ❌ falta deploy (corre a secção 3).

> Nota: se o `/api/version` ou o `GIT_SHA` disser **`unknown`**, foi um deploy
> feito sem passar a versão (ex.: à mão sem `GIT_SHA=`). O `deploy.sh` e o
> auto-deploy passam sempre — usa um deles para o número aparecer certo.

### Confirmar um ficheiro/feature específico (opcional)
Para ver se um ficheiro novo está MESMO dentro do contentor a correr:
```
docker exec marcai-backend ls /app/src/modules/messaging/handlers/manualOutbound.js
docker exec marcai-ia-service ls /app/src/ia_service/routers/transcribe.py
```
Mostra o caminho = está lá. `No such file` = não está (falta reconstruir).

### Frontend (Vercel)
No painel da Vercel, o deployment do topo mostra o commit publicado.

---

## 8. Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| Correste o deploy no Mac e deu "Already up to date" | Era o repo local, não o servidor | Entra no servidor (secção 3B) |
| `failed to read .env … unexpected character` | Correste no Mac (lê o `.env` local) | Faz no servidor; corrige a linha do `.env` local |
| `/api/version` diz `unknown` | A imagem foi construída sem `GIT_SHA` | Usa `deploy.sh` ou o Action (passam o `GIT_SHA`) |
| Deploy feito mas nada mudou | Faltou `--build` | O `deploy.sh`/Action já fazem `--build` |
| `áudio: download falhou` nos logs | Forma do pedido ao Evolution | Reportar — ajuste à versão do Evolution |
