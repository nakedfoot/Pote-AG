#!/usr/bin/env bash
# Installation / mise à jour de Potager dans un conteneur LXC Debian/Ubuntu, sans Docker.
# Le code est récupéré depuis GitHub (git clone), à lancer en root :
#
#   curl -fsSL https://raw.githubusercontent.com/nakedfoot/Pote-AG/main/deploy/install.sh | bash
#
# Relancer la même commande (ou `potager-update`) met à jour l'appli : les données
# (/var/lib/potager) et la configuration (/etc/potager.env) sont conservées.
#
# Variables facultatives :
#   POTAGER_REPO  adresse du dépôt   (défaut : https://github.com/nakedfoot/Pote-AG.git)
#   POTAGER_REF   branche ou étiquette à installer (défaut : main)
set -euo pipefail

REPO="${POTAGER_REPO:-https://github.com/nakedfoot/Pote-AG.git}"
REF="${POTAGER_REF:-main}"
APP_DIR=/opt/potager
DATA_DIR=/var/lib/potager
APP_USER=potager
ENV_FILE=/etc/potager.env

# Tout est dans une fonction : bash lit le script en entier avant de l'exécuter, donc le
# `git pull` ci-dessous peut remplacer ce fichier sans perturber l'exécution en cours.
main() {
  [ "$(id -u)" -eq 0 ] || { echo "Ce script doit être lancé en root." >&2; exit 1; }

  echo "==> Paquets de base"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates git >/dev/null

  # Node.js >= 22.13 requis (SQLite intégré : node:sqlite).
  node_ok() {
    command -v node >/dev/null 2>&1 || return 1
    local v major minor
    v="$(node -p 'process.versions.node')"; major="${v%%.*}"; minor="${v#*.}"; minor="${minor%%.*}"
    [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 13 ]; }
  }
  if ! node_ok; then
    echo "==> Installation de Node.js 22 (NodeSource)"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi
  echo "    Node $(node -v)"

  echo "==> Utilisateur et dossiers"
  id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
  mkdir -p "$DATA_DIR"

  echo "==> Code source ($REPO, $REF)"
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch --quiet --depth 1 origin "$REF"
    git -C "$APP_DIR" reset --quiet --hard FETCH_HEAD
  else
    if [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
      OLD="$APP_DIR.ancien-$(date +%Y%m%d-%H%M%S)"
      echo "    $APP_DIR existe sans dépôt Git : déplacé vers $OLD"
      mv "$APP_DIR" "$OLD"
    fi
    git clone --quiet --depth 1 --branch "$REF" "$REPO" "$APP_DIR"
  fi
  echo "    Version : $(git -C "$APP_DIR" log -1 --format='%h %s (%cd)' --date=short)"

  echo "==> Dépendances et compilation (quelques minutes)"
  cd "$APP_DIR"
  npm ci --no-audit --no-fund
  npm run build

  echo "==> Configuration"
  if [ ! -f "$ENV_FILE" ]; then
    install -m 640 -o root -g "$APP_USER" "$APP_DIR/deploy/potager.env.example" "$ENV_FILE"
    echo "    Créé : $ENV_FILE (à adapter : port, fuseau horaire, COOKIE_SECURE)"
  else
    echo "    $ENV_FILE conservé"
  fi
  chown -R "$APP_USER:$APP_USER" "$DATA_DIR" "$APP_DIR/.next"
  ln -sf "$APP_DIR/deploy/install.sh" /usr/local/bin/potager-update

  echo "==> Service systemd"
  install -m 644 "$APP_DIR/deploy/potager.service" /etc/systemd/system/potager.service
  systemctl daemon-reload
  systemctl enable potager >/dev/null 2>&1
  systemctl restart potager

  local port
  port="$(grep -E '^PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2 || true)"; port="${port:-3000}"
  echo "==> Vérification"
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
      local ip
      ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
      echo "OK : Potager répond sur http://${ip:-<ip-du-conteneur>}:$port"
      echo "     Premier lancement : ouvrez cette adresse pour créer le compte administrateur."
      echo "     Mise à jour : potager-update    Journaux : journalctl -u potager -f"
      return 0
    fi
    sleep 1
  done
  echo "Le service ne répond pas encore. Consultez : journalctl -u potager -n 50 --no-pager" >&2
  return 1
}

main "$@"
exit
