#!/usr/bin/env bash
# Restore de backup MongoDB a partir de Cloudflare R2.
#
# Uso:
#   # Lista backups disponíveis em R2
#   ./scripts/maintenance/restore-backup.sh list
#
#   # Download + restore de um archive específico (pede confirmação)
#   ./scripts/maintenance/restore-backup.sh restore daily/backup_2026-04-24_0200.archive.gz
#
#   # Download sem restaurar (para inspecção manual)
#   ./scripts/maintenance/restore-backup.sh download weekly/2026-W17.archive.gz
#
# Variáveis de ambiente necessárias:
#   MONGO_URI              — connection string da DB de DESTINO (cuidado!)
#   R2_ACCESS_KEY_ID
#   R2_SECRET_ACCESS_KEY
#   R2_ENDPOINT
#   R2_BUCKET
#
# Dependências no sistema:
#   - mongodb-database-tools (mongorestore)
#   - aws-cli (configurado por env vars acima)
#
# ATENÇÃO: `restore` sobrescreve documentos com o mesmo _id na DB de destino.
# Em produção, restaurar SEMPRE para uma DB nova primeiro, validar, depois fazer cutover.

set -euo pipefail

CMD="${1:-}"
ARCHIVE_KEY="${2:-}"

if [ -z "$CMD" ]; then
  echo "Uso: $0 {list|restore <key>|download <key>}" >&2
  exit 1
fi

export AWS_DEFAULT_REGION=auto

case "$CMD" in
  list)
    echo "── Backups disponíveis em s3://$R2_BUCKET ──"
    echo "DAILY:"
    aws s3 ls "s3://$R2_BUCKET/daily/" --endpoint-url "$R2_ENDPOINT" --human-readable | tail -10
    echo ""
    echo "WEEKLY:"
    aws s3 ls "s3://$R2_BUCKET/weekly/" --endpoint-url "$R2_ENDPOINT" --human-readable | tail -5
    echo ""
    echo "MONTHLY:"
    aws s3 ls "s3://$R2_BUCKET/monthly/" --endpoint-url "$R2_ENDPOINT" --human-readable | tail -5
    ;;

  download)
    if [ -z "$ARCHIVE_KEY" ]; then
      echo "Falta <key>. Exemplo: daily/backup_2026-04-24_0200.archive.gz" >&2
      exit 1
    fi
    LOCAL="$(basename "$ARCHIVE_KEY")"
    aws s3 cp "s3://$R2_BUCKET/$ARCHIVE_KEY" "$LOCAL" --endpoint-url "$R2_ENDPOINT"
    echo "✅ Download concluído: $LOCAL"
    ;;

  restore)
    if [ -z "$ARCHIVE_KEY" ]; then
      echo "Falta <key>. Exemplo: daily/backup_2026-04-24_0200.archive.gz" >&2
      exit 1
    fi

    echo "⚠️  ATENÇÃO: Vai restaurar $ARCHIVE_KEY para a DB definida em MONGO_URI."
    echo "    Esta operação pode SOBRESCREVER dados existentes."
    read -r -p "Confirma? (escreve 'sim' para continuar): " CONFIRM
    if [ "$CONFIRM" != "sim" ]; then
      echo "Cancelado."
      exit 0
    fi

    LOCAL="$(basename "$ARCHIVE_KEY")"
    aws s3 cp "s3://$R2_BUCKET/$ARCHIVE_KEY" "$LOCAL" --endpoint-url "$R2_ENDPOINT"
    echo "Download concluído. A restaurar..."

    mongorestore --uri="$MONGO_URI" --archive="$LOCAL" --gzip --drop
    echo "✅ Restore concluído."
    rm -f "$LOCAL"
    ;;

  *)
    echo "Comando desconhecido: $CMD" >&2
    echo "Uso: $0 {list|restore <key>|download <key>}" >&2
    exit 1
    ;;
esac
