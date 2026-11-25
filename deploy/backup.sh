#!/usr/bin/env bash
# Sauvegarde complète (base SQLite cohérente, photos, plan, clé de chiffrement) dans une archive datée.
# Usage : bash deploy/backup.sh [dossier-de-destination]   (par défaut : /var/backups/potager)
set -euo pipefail
DATA_DIR="${DATA_DIR:-/var/lib/potager}"
DEST="${1:-/var/backups/potager}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$DEST" "$TMP/potager"
# VACUUM INTO produit une copie cohérente même pendant que l'appli écrit.
DB="$DATA_DIR/potager.db" OUT="$TMP/potager/potager.db" node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.env.DB);
  db.exec(`VACUUM INTO \x27${process.env.OUT}\x27`);
  db.close();'
for f in uploads plan.jpg .secret; do [ -e "$DATA_DIR/$f" ] && cp -a "$DATA_DIR/$f" "$TMP/potager/"; done
tar -czf "$DEST/potager-$STAMP.tar.gz" -C "$TMP" potager
chmod 600 "$DEST/potager-$STAMP.tar.gz"
echo "Sauvegarde : $DEST/potager-$STAMP.tar.gz"
