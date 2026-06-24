#!/usr/bin/env bash
#
# backup-contabo.sh — Disaster Recovery do stack Contabo (ADR-029).
#
# Faz backup OFF-SITE para Cloudflare R2 APENAS do que vive só no VPS e não se
# reproduz a partir do Git/Atlas:
#   1. postgres da Evolution   (pg_dump)            → chats/contactos da Evolution
#   2. volume evolution_data   (tar)               → sessão/emparelhamento WhatsApp
#   3. .env                    (cifrado com age)   → segredos (NUNCA em claro no R2)
#
# NÃO cobre (de propósito): código (GitHub), base de dados (Atlas + backup.yml),
# redis (transitório). Ver ADR-029.
#
# Corre NO Contabo, via cron. Pré-requisitos (setup único — ver deploy/RESTORE-CONTABO.md):
#   apt-get update && apt-get install -y age awscli
#   criar /opt/marcai/.backup.env (chmod 600) com:
#     R2_ACCESS_KEY_ID=...
#     R2_SECRET_ACCESS_KEY=...
#     R2_ENDPOINT=https://<accountId>.r2.cloudflarestorage.com
#     R2_BUCKET=marcai-backups
#     AGE_RECIPIENT=age1...        # chave PÚBLICA age (a privada fica FORA do Contabo)
#
# Cron sugerido (03:30 UTC, desfasado do backup.yml da BD às 02:00):
#   30 3 * * * /opt/marcai/deploy/backup-contabo.sh >> /var/log/marcai-backup.log 2>&1
#
set -euo pipefail

PROJECT_DIR="/opt/marcai"
CONFIG="${PROJECT_DIR}/.backup.env"
ENV_FILE="${PROJECT_DIR}/.env"
PG_CONTAINER="marcai-postgres"
PG_USER="evolution"
PG_DB="evolution"
EVOLUTION_VOLUME="marcai_evolution_data"
EVOLUTION_IMAGE_TAG="v2.3.7"   # ADR-016 — registar a versão junto do backup

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERRO: $*"; exit 1; }

# ── Pré-requisitos ────────────────────────────────────────────────────
[ -f "$CONFIG" ]   || fail "Falta $CONFIG (ver cabeçalho do script)"
[ -f "$ENV_FILE" ] || fail "Falta $ENV_FILE"
command -v age >/dev/null || fail "age não instalado (apt-get install -y age)"
command -v aws >/dev/null || fail "aws não instalado (apt-get install -y awscli)"

# shellcheck disable=SC1090
source "$CONFIG"
: "${R2_ACCESS_KEY_ID:?Falta no .backup.env}"
: "${R2_SECRET_ACCESS_KEY:?Falta no .backup.env}"
: "${R2_ENDPOINT:?Falta no .backup.env}"
: "${R2_BUCKET:?Falta no .backup.env}"
: "${AGE_RECIPIENT:?Falta no .backup.env}"

TS="$(date -u +%Y-%m-%d_%H%M)"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

log "Backup Contabo iniciado ($TS)"

# ── 1) postgres da Evolution ──────────────────────────────────────────
log "pg_dump da Evolution…"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --clean --if-exists \
  | gzip > "${TMP}/evolution_pg.sql.gz"

# ── 2) volume evolution_data (sessão WhatsApp) ────────────────────────
log "tar do volume ${EVOLUTION_VOLUME}…"
docker run --rm -v "${EVOLUTION_VOLUME}:/data:ro" -v "${TMP}:/out" alpine \
  tar czf /out/evolution_data.tar.gz -C /data .

# ── 3) .env cifrado (age) ─────────────────────────────────────────────
log "cifrar .env com age…"
age -r "$AGE_RECIPIENT" -o "${TMP}/env.age" "$ENV_FILE"

# ── manifesto (versões / contexto do restauro) ────────────────────────
cat > "${TMP}/MANIFEST.txt" <<EOF
backup_ts=${TS}
host=$(hostname)
evolution_image=${EVOLUTION_IMAGE_TAG}
pg_container=${PG_CONTAINER}
evolution_volume=${EVOLUTION_VOLUME}
EOF

# ── empacotar tudo num único objecto ──────────────────────────────────
ARCHIVE="contabo_${TS}.tar"
tar cf "${TMP}/${ARCHIVE}" -C "$TMP" evolution_pg.sql.gz evolution_data.tar.gz env.age MANIFEST.txt
SIZE="$(du -h "${TMP}/${ARCHIVE}" | cut -f1)"
log "arquivo pronto: ${ARCHIVE} (${SIZE})"

# ── upload para R2 (daily sempre; weekly dom; monthly dia 1) ───────────
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
s3cp() { aws s3 cp "$1" "$2" --endpoint-url "$R2_ENDPOINT" --no-progress; }

s3cp "${TMP}/${ARCHIVE}" "s3://${R2_BUCKET}/contabo/daily/${ARCHIVE}"
[ "$(date -u +%u)" = "7" ] && s3cp "${TMP}/${ARCHIVE}" "s3://${R2_BUCKET}/contabo/weekly/contabo_$(date -u +%Y-W%V).tar"
[ "$(date -u +%d)" = "01" ] && s3cp "${TMP}/${ARCHIVE}" "s3://${R2_BUCKET}/contabo/monthly/contabo_$(date -u +%Y-%m).tar"

log "✅ Backup Contabo concluído e enviado para R2 (${SIZE})"
