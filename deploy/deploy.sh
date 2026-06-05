#!/usr/bin/env bash
#
# Deploy manual do backend + ia-service no servidor Contabo.
# CORRER DENTRO DO SERVIDOR (ssh root@<ip>), em qualquer pasta.
#
#   bash /opt/marcai/deploy/deploy.sh
#
# Baixa o código mais recente de `main` do GitHub e reconstrói só o backend e o
# ia-service. NÃO toca em `.env` nem em `nginx/` (segredos e domínios ficam intactos).
# O frontend é na Vercel (automático), não passa por aqui.

set -euo pipefail

REPO="andredosreis/laura-saas-agenda"
DEST="/opt/marcai"
TMP="/tmp/marcai-deploy"

echo "==> A descarregar o código mais recente de main…"
rm -rf "$TMP" && mkdir -p "$TMP"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" \
  | tar xz -C "$TMP" --strip-components=1

# Commit curto (para o /version). Se falhar, usa a data.
SHA="$(curl -fsSL "https://api.github.com/repos/$REPO/commits/main" \
  | grep -m1 '"sha"' | cut -d'"' -f4 | cut -c1-7 || true)"
[ -n "${SHA:-}" ] || SHA="manual-$(date -u +%Y%m%d%H%M)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "==> A copiar código (sem mexer em .env/nginx)…"
cp -rf "$TMP/src/." "$DEST/src/"
cp -rf "$TMP/ia-service/src/." "$DEST/ia-service/src/"
cp -f  "$TMP/Dockerfile" "$TMP/docker-compose.prod.yml" "$TMP/package.json" "$TMP/package-lock.json" "$DEST/"
cp -f  "$TMP/ia-service/Dockerfile" "$TMP/ia-service/pyproject.toml" "$DEST/ia-service/"

echo "==> A reconstruir e reiniciar backend + ia-service (versão $SHA)…"
cd "$DEST"
GIT_SHA="$SHA" BUILT_AT="$NOW" \
  docker compose -f docker-compose.prod.yml up -d --build backend ia-service

rm -rf "$TMP"
echo ""
echo "✅ Deploy concluído. Versão deployada: $SHA"
echo "   Confirma:  docker exec marcai-backend printenv GIT_SHA"
echo "   Ou abre:   https://api.<o-teu-dominio>/api/version"
