#!/usr/bin/env bash
# Redirect Evolution webhook from production to local ngrok tunnel.
#
# DANGER: this disables production message handling. The companion script
# `webhook-restore-prod.sh` MUST be run at the end of any local testing
# session.
#
# Reads from .env in repo root:
#   EVOLUTION_API_URL
#   EVOLUTION_API_KEY
#   EVOLUTION_WEBHOOK_SECRET
#
# Usage:  bash scripts/tools/webhook-redirect-local.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

EVO_URL=$(grep '^EVOLUTION_API_URL=' .env | cut -d= -f2-)
EVO_KEY=$(grep '^EVOLUTION_API_KEY=' .env | cut -d= -f2-)
EVO_SECRET=$(grep '^EVOLUTION_WEBHOOK_SECRET=' .env | cut -d= -f2-)

NGROK_URL="https://evolution-excusable-proven.ngrok-free.dev/webhook/evolution"

PAYLOAD=$(cat <<JSON
{
  "webhook": {
    "enabled": true,
    "url": "$NGROK_URL",
    "headers": { "apikey": "$EVO_SECRET" },
    "byEvents": false,
    "base64": false,
    "events": ["MESSAGES_UPSERT"]
  }
}
JSON
)

echo "→ Redirecionando webhook Evolution para: $NGROK_URL"
curl -s -X POST "${EVO_URL}/webhook/set/marcai" \
  -H "apikey: ${EVO_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | python3 -m json.tool

echo
echo "→ Validando..."
curl -s -X GET "${EVO_URL}/webhook/find/marcai" -H "apikey: ${EVO_KEY}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  URL: {d[\"url\"]}'); print(f'  Enabled: {d[\"enabled\"]}')"

echo
echo "⚠  Produção desligada. Restaurar no fim com:"
echo "   bash scripts/tools/webhook-restore-prod.sh"
