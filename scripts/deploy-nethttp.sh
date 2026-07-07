#!/usr/bin/env bash
# Déploie l'app web sur https://youtubator.nethttp.net
# Vhost wildcard Apache : docroot /var/www/nethttp.net/youtubator/public
# Prérequis : hôte SSH « nethttp » configuré (~/.ssh/config), sudo sans mot de passe côté serveur.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ build (base /, racine du sous-domaine)"
pnpm --filter @youtubator/web exec vite build

echo "→ envoi vers nethttp"
rsync -az --delete -e 'ssh -o BatchMode=yes' apps/web/dist/ nethttp:/tmp/youtubator-deploy/

echo "→ installation dans le docroot (www-data)"
ssh -o BatchMode=yes nethttp '
  sudo -n mkdir -p /var/www/nethttp.net/youtubator/public &&
  sudo -n rsync -a --delete /tmp/youtubator-deploy/ /var/www/nethttp.net/youtubator/public/ &&
  sudo -n chown -R www-data:www-data /var/www/nethttp.net/youtubator &&
  rm -rf /tmp/youtubator-deploy
'
echo "✔ https://youtubator.nethttp.net"
