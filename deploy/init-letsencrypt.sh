#!/bin/sh
# init-letsencrypt.sh — obtém os primeiros certificados Let's Encrypt.
# Resolve o ovo-e-galinha: nginx precisa de certs para arrancar, certbot
# precisa de nginx para a validação webroot.
#
# Uso (no VPS, na raiz do projecto, com o .env preenchido):
#   API_DOMAIN=api.marcai.pt WA_DOMAIN=wa.marcai.pt EMAIL=teu@email.pt \
#     sh deploy/init-letsencrypt.sh
set -e

COMPOSE="docker compose -f docker-compose.prod.yml"
: "${API_DOMAIN:?define API_DOMAIN}"
: "${WA_DOMAIN:?define WA_DOMAIN}"
: "${EMAIL:?define EMAIL}"
STAGING="${STAGING:-0}"   # STAGING=1 para testar sem gastar quota do Let's Encrypt

cert_path="/etc/letsencrypt/live/$API_DOMAIN"

echo "### 1/4 Substituir placeholders na config nginx..."
sed -i "s/API_DOMAIN/$API_DOMAIN/g; s/WA_DOMAIN/$WA_DOMAIN/g" nginx/conf.d/marcai.conf

echo "### 2/4 Criar certificado dummy temporário..."
$COMPOSE run --rm --entrypoint "\
  sh -c 'mkdir -p $cert_path && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout $cert_path/privkey.pem -out $cert_path/fullchain.pem \
    -subj /CN=localhost'" certbot
$COMPOSE up -d nginx

echo "### 3/4 Apagar dummy e pedir certificado real..."
$COMPOSE run --rm --entrypoint "rm -rf /etc/letsencrypt/live/$API_DOMAIN /etc/letsencrypt/archive/$API_DOMAIN /etc/letsencrypt/renewal/$API_DOMAIN.conf" certbot

staging_arg=""
[ "$STAGING" != "0" ] && staging_arg="--staging"

$COMPOSE run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot $staging_arg \
    --email $EMAIL --agree-tos --no-eff-email --non-interactive \
    -d $API_DOMAIN -d $WA_DOMAIN" certbot

echo "### 4/4 Recarregar nginx com os certs reais..."
$COMPOSE exec nginx nginx -s reload || $COMPOSE up -d --force-recreate nginx

echo "### Concluído. Certificados em $cert_path"
