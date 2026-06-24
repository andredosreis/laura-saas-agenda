# Disaster Recovery do Stack Contabo (ADR-029)

Runbook para o backup off-site em Cloudflare R2 (`deploy/backup-contabo.sh`).
Cobre: **postgres da Evolution + volume `evolution_data` (sessão WhatsApp) + `.env` cifrado**.
Não cobre (já protegidos): código (GitHub), base de dados (Atlas + `backup.yml`), redis (transitório).

---

## Setup único (no Contabo + na tua máquina)

### 1. Gerar o par de chaves `age` (na TUA máquina, NÃO no Contabo)
```bash
age-keygen -o marcai-backup-key.txt
# → mostra "Public key: age1xxxx..."  (essa vai para o Contabo)
# GUARDA marcai-backup-key.txt FORA do Contabo e do R2 (ex: gestor de senhas).
# Sem esta chave privada, os backups do .env NÃO se conseguem decifrar.
```

### 2. No Contabo: instalar ferramentas + criar config
```bash
ssh root@80.241.222.235
apt-get update && apt-get install -y age awscli

cat > /opt/marcai/.backup.env <<'EOF'
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<accountId>.r2.cloudflarestorage.com
R2_BUCKET=marcai-backups
AGE_RECIPIENT=age1xxxx...     # a chave PÚBLICA do passo 1
EOF
chmod 600 /opt/marcai/.backup.env
```
> As credenciais R2 podem ser as mesmas do `backup.yml` (GitHub secrets) ou um token R2 novo
> com escrita no bucket. O bucket `marcai-backups` já existe (ver `.github/workflows/backup.yml`).

### 3. Agendar o cron
```bash
crontab -e
# adicionar (03:30 UTC, desfasado do backup da BD às 02:00):
30 3 * * * /opt/marcai/deploy/backup-contabo.sh >> /var/log/marcai-backup.log 2>&1
```

### 4. Testar já (uma execução manual)
```bash
/opt/marcai/deploy/backup-contabo.sh
aws s3 ls s3://marcai-backups/contabo/daily/ --endpoint-url "$R2_ENDPOINT"
```

---

## Restauro (num VPS novo/limpo após perda do Contabo)

Pressupõe: stack já clonada em `/opt/marcai` (via `deploy/deploy.sh` / ADR-023) e containers a subir.

```bash
# 0. Ferramentas + credenciais R2 (temporárias)
apt-get install -y age awscli
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... R2_ENDPOINT=https://<id>.r2.cloudflarestorage.com

# 1. Descarregar o último backup
aws s3 ls s3://marcai-backups/contabo/daily/ --endpoint-url "$R2_ENDPOINT"
aws s3 cp s3://marcai-backups/contabo/daily/contabo_<TS>.tar . --endpoint-url "$R2_ENDPOINT"
tar xf contabo_<TS>.tar && cat MANIFEST.txt   # confirmar versão da Evolution

# 2. Restaurar o .env (precisa da chave PRIVADA age, do setup passo 1)
age -d -i marcai-backup-key.txt env.age > /opt/marcai/.env
chmod 600 /opt/marcai/.env

# 3. Subir postgres + restaurar a BD da Evolution
cd /opt/marcai && docker compose -f docker-compose.prod.yml up -d postgres
sleep 5
gunzip -c evolution_pg.sql.gz | docker exec -i marcai-postgres psql -U evolution -d evolution

# 4. Restaurar o volume da sessão WhatsApp (com a Evolution PARADA)
docker compose -f docker-compose.prod.yml stop evolution-api || true
docker run --rm -v marcai_evolution_data:/data -v "$PWD":/in alpine \
  sh -c 'rm -rf /data/* && tar xzf /in/evolution_data.tar.gz -C /data'

# 5. Subir tudo
docker compose -f docker-compose.prod.yml up -d
```

### ⚠️ Se o WhatsApp pedir QR mesmo após o restauro
A sessão pode ter sido invalidada pelo WhatsApp (mudança de dispositivo/versão, ou tempo).
Nesse caso é normal: abrir a Evolution e **reler o QR** uma vez. O resto (BD, contactos,
config) já está restaurado — só o emparelhamento é refeito.

### Verificação pós-restauro
- `GET /api/version` (backend) e `GET /health` (ia-service) respondem.
- Inbox mostra conversas; enviar 1 mensagem de teste pelo WhatsApp.
- A versão da Evolution corresponde ao `MANIFEST.txt` (senão, ajustar `docker-compose.prod.yml`).
