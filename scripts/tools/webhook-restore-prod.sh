#!/usr/bin/env bash
# Restore Evolution webhook back to production (Render).
#
# Use after `webhook-redirect-local.sh` whenever you finish a local
# testing session — otherwise production stays disconnected.
#
# Usage:  bash scripts/tools/webhook-restore-prod.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

EVO_URL=$(grep '^EVOLUTION_API_URL=' .env | cut -d= -f2-)
EVO_KEY=$(grep '^EVOLUTION_API_KEY=' .env | cut -d= -f2-)
EVO_SECRET=$(grep '^EVOLUTION_WEBHOOK_SECRET=' .env | cut -d= -f2-)

PROD_URL="https://laura-saas.onrender.com/webhook/evolution"

PAYLOAD=$(cat <<JSON
{
  "webhook": {
    "enabled": true,
    "url": "$PROD_URL",
    "headers": { "apikey": "$EVO_SECRET" },
    "byEvents": false,
    "base64": false,
    "events": ["MESSAGES_UPSERT"]
  }
}
JSON
)

echo "→ Restaurando webhook Evolution para: $PROD_URL"
curl -s -X POST "${EVO_URL}/webhook/set/marcai" \
  -H "apikey: ${EVO_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | python3 -m json.tool

echo
echo "→ Validando..."
curl -s -X GET "${EVO_URL}/webhook/find/marcai" -H "apikey: ${EVO_KEY}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  URL: {d[\"url\"]}'); print(f'  Enabled: {d[\"enabled\"]}')"

echo
echo "✅ Produção restaurada."
