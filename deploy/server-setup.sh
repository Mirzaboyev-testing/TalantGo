#!/usr/bin/env bash
# Install or update CareerFlow on the shared server. Safe to run again.
#
# Everything lives in /root/careerflow. The one thing touched outside it is the existing Caddyfile,
# and only by APPENDING one site block after a backup, once the combined file validated inside the
# running Caddy. A failed reload leaves the old config serving, so neighbours cannot be taken down.
set -euo pipefail
cd /root/careerflow

CADDYFILE=/root/universal_marketplace/Caddyfile
SITE=careerflow.2-28-27-205.sslip.io
COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.server.yml"
step() { printf '\n=== %s\n' "$*"; }

step "1. settings"
if [ ! -f .env ]; then
  umask 077
  cat > .env <<ENV
APP_ENV=prod
PUBLIC_URL=https://$SITE
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')
POSTGRES_PASSWORD=$(openssl rand -hex 24)
ENV
  echo "created .env (admin password inside, chmod 600)"
else
  echo ".env kept"
fi
mkdir -p secrets backups

step "2. build and start"
$COMPOSE up -d --build --remove-orphans

step "3. health"
for i in $(seq 1 30); do
  if docker exec careerflow-api-1 python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" 2>/dev/null; then
    echo "api healthy"; break
  fi
  sleep 2
  [ "$i" = 30 ] && { echo "api did not start"; $COMPOSE logs --tail 40 api; exit 1; }
done

step "4. proxy"
if grep -q "$SITE" "$CADDYFILE"; then
  echo "$SITE already configured"
else
  cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
  cat "$CADDYFILE" deploy/Caddyfile.careerflow > /tmp/Caddyfile.candidate
  docker cp /tmp/Caddyfile.candidate um-caddy:/tmp/Caddyfile.candidate
  docker exec um-caddy caddy validate --config /tmp/Caddyfile.candidate --adapter caddyfile
  cat deploy/Caddyfile.careerflow >> "$CADDYFILE"     # append in place: the file is bind-mounted
  docker exec um-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "added $SITE"
fi

step "5. status"
$COMPOSE ps
