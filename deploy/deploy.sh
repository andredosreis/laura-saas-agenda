#!/usr/bin/env bash
#
# Deploy manual do backend + ia-service no servidor Contabo.
# CORRER DENTRO DO SERVIDOR (ssh root@<ip>), em qualquer pasta:
#
#   bash /opt/marcai/deploy/deploy.sh
#
# Baixa o código mais recente de `main` do GitHub e reconstrói SÓ o backend e o
# ia-service. NÃO toca em `.env` nem em `nginx/` (segredos e domínios intactos).
# O frontend é na Vercel (automático), não passa por aqui.

set -euo pipefail

REPO="https://github.com/andredosreis/laura-saas-agenda.git"
DEST="/opt/marcai"
TMP="/tmp/marcai-deploy"

echo "==> A baixar o código mais recente de main…"
rm -rf "$TMP"
git clone --depth 1 "$REPO" "$TMP"

SHA="$(git -C "$TMP" rev-parse --short HEAD)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "==> A copiar código (sem mexer em .env/nginx)…"
cp -rf "$TMP/src/." "$DEST/src/"
cp -rf "$TMP/ia-service/src/." "$DEST/ia-service/src/"
cp -f  "$TMP/Dockerfile" "$TMP/docker-compose.prod.yml" "$TMP/package.json" "$TMP/package-lock.json" "$DEST/"
cp -f  "$TMP/ia-service/Dockerfile" "$TMP/ia-service/pyproject.toml" "$DEST/ia-service/"

echo "==> A reconstruir backend + ia-service (versão $SHA)…"
cd "$DEST"
GIT_SHA="$SHA" BUILT_AT="$NOW" \
  docker compose -f docker-compose.prod.yml up -d --build backend ia-service

rm -rf "$TMP"
echo ""
echo "✅ Deploy concluído. Versão deployada: $SHA"
echo "   Confirma:  docker exec marcai-backend printenv GIT_SHA"
echo "   Ou abre:   https://api.<o-teu-dominio>/api/version"
