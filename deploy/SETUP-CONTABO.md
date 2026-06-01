# Runbook — Consolidação no VPS Contabo (ADR-023)

Migração do split Render/Vercel/Hostinger para um VPS único com Docker Compose.
**MongoDB fica no Atlas. Frontend fica na Vercel.** Tudo o resto corre no Contabo.

Topologia final (`docker-compose.prod.yml`):

```
Internet ──► nginx (80/443) ──► backend:5000   (api.<dominio>)
                            └──► evolution:8080 (wa.<dominio>)
   rede interna Docker (não exposta): ia-service:8000 · redis:6379 · evolution:8080
   externo: MongoDB Atlas (UE)
```

Ganho-chave: backend→ia-service passa a `http://ia-service:8000` interno e ambos
lêem o **mesmo `.env`** → o `INTERNAL_SERVICE_TOKEN` nunca mais diverge (fim do 401).

---

## Pré-requisitos (tu)
- IP do VPS + acesso SSH (root inicial).
- Um domínio com 2 registos **A** a apontar para o IP do VPS:
  - `api.<dominio>` → IP
  - `wa.<dominio>`  → IP
- Segredos à mão: `MONGODB_URI` (Atlas), `EVOLUTION_API_KEY`, `JWT_SECRET`,
  `JWT_REFRESH_SECRET`, `GOOGLE_API_KEY`, `RESEND_API_KEY`, VAPID, `SENTRY_DSN`.

---

## Fase 0 — Hardening do servidor (VPS em branco)

```bash
# como root
apt update && apt upgrade -y
apt install -y ufw fail2ban git curl

# utilizador não-root
adduser marcai && usermod -aG sudo marcai
rsync --archive --chown=marcai:marcai ~/.ssh /home/marcai   # copia a chave SSH

# firewall — só SSH + HTTP + HTTPS
ufw allow OpenSSH && ufw allow 80 && ufw allow 443
ufw --force enable

# SSH: desligar login por password e root (depois de confirmar acesso por chave)
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
systemctl enable --now fail2ban
```

## Fase 0b — Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker marcai
# reentrar como marcai a partir daqui
```

## Fase 1 — Código + segredos

```bash
# como marcai
git clone <REPO_URL> marcai && cd marcai
git checkout main

cp .env.production.example .env
nano .env            # preencher TODOS os segredos
#   INTERNAL_SERVICE_TOKEN=$(openssl rand -hex 32)
#   REDIS_PASSWORD=$(openssl rand -hex 24)
#   WHATSAPP_DOMAIN=wa.<dominio>
```

## Fase 2 — Build + arranque + TLS

```bash
# build das imagens (backend + ia-service)
docker compose -f docker-compose.prod.yml build

# primeiros certificados (substitui domínios e email)
API_DOMAIN=api.<dominio> WA_DOMAIN=wa.<dominio> EMAIL=teu@email.pt \
  sh deploy/init-letsencrypt.sh
#   (testar primeiro com STAGING=1 para não gastar quota; depois repetir sem)

# subir o stack completo
docker compose -f docker-compose.prod.yml up -d

# verificar
docker compose -f docker-compose.prod.yml ps
curl -i https://api.<dominio>/api/auth/me     # -> 401 (API viva)
docker compose -f docker-compose.prod.yml logs -f backend ia-service
#   procurar: "[Redis] Ligado", worker iniciado, ia-service health 200
```

## Fase 3 — WhatsApp / Evolution (ponto sensível)

1. Abrir `https://wa.<dominio>` (painel Evolution) → ligar instância (QR code).
2. **Webhook interno** — configurar o webhook da instância para o backend pela
   rede interna (não sai para a internet):
   `http://backend:5000/webhook/evolution` (ou o path real do projecto).
   Em alternativa, externo: `https://api.<dominio>/webhook/evolution`.
3. **Drenar lembretes antigos:** o Redis novo está vazio. Os delayed jobs do
   Redis antigo (Hostinger) NÃO migram. Deixar o worker antigo a esvaziar a fila
   OU fazer o cutover numa janela de baixa actividade. Garantir que só **um**
   worker BullMQ está activo (evitar lembretes duplicados).

## Fase 4 — Frontend (Vercel)
- Na Vercel: `VITE_API_URL = https://api.<dominio>/api/v1` → redeploy.

## Fase 5 — Desligar o antigo (após 2-3 dias estáveis)
- Suspender Render `laura-saas` (`srv-d0vjn6p5pdvs738jicag`) e `Marcai`
  (`srv-d7ufho9j2pic73bqvung`).
- Desligar Redis/Evolution no Hostinger. Cancelar Upstash.

---

## Operação corrente

```bash
# deploy de nova versão
git pull && docker compose -f docker-compose.prod.yml up -d --build

# logs / estado
docker compose -f docker-compose.prod.yml logs -f <serviço>
docker compose -f docker-compose.prod.yml ps

# renovação de certs é automática (container certbot, 12/12h)
```

## Rollback
O ambiente antigo (Render/Vercel/Hostinger) fica intacto até à Fase 5.
Reverter = reapontar o webhook do Evolution e `VITE_API_URL` para o ambiente antigo.

## Monitorização
- UptimeRobot/Healthchecks em `https://api.<dominio>/api/auth/me` (espera 401).
- Backups: `.env`, `docker-compose.prod.yml`, `nginx/` guardados fora do VPS.
  Volume `redis-data` persiste a fila entre restarts. MongoDB = backups Atlas.
