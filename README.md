# Potager

Gestion de potager connecté (Next.js + SQLite, sans Docker).

## Développement local

```
npm install
npm run dev        # http://localhost:3000
```

Au premier lancement, créer le compte administrateur sur `/setup`, puis renseigner
MQTT et sources botaniques dans le menu Paramètres.

Les données sont dans `./data` (modifiable avec `DATA_DIR`) :
`potager.db` (base SQLite), `.secret` (clé de chiffrement des mots de passe/clés API), `uploads/` (photos).
Node 22.13+ requis (`node:sqlite` intégré).

## MQTT

- **Entrée** : `<base Zigbee2MQTT>/#` (découverte des capteurs via `bridge/devices`).
- **Sortie** : un objet JSON complet par plant sur `<préfixe>/plant/<id>/state` (retenu),
  `<préfixe>/status` (online/offline, testament), `<préfixe>/plant/<id>/image_url` et `image_b64`.
- **Home Assistant** : découverte automatique (`<préfixe de découverte>/…/potager_<id>/…/config`),
  un appareil par plant (capteurs, alerte, état, âge, dernier arrosage, photo).

- **Rappels** : `<préfixe>/rappels` (retenu) liste ce qu'il y a à faire (arrosage, récolte proche ou dépassée,
  batterie faible, données anciennes). Home Assistant reçoit un capteur « Potager Rappels » (état = nombre de rappels,
  attributs = détail) : de quoi déclencher une notification, par exemple :

```yaml
automation:
  - alias: "Potager : notification des rappels"
    trigger:
      - platform: numeric_state
        entity_id: sensor.potager_rappels
        above: 0
    action:
      - service: notify.mobile_app_MON_TELEPHONE   # votre service de notification
        data:
          title: "🌱 Potager"
          message: "{{ state_attr('sensor.potager_rappels', 'resume') }}"
```

## Application mobile (PWA)

L'appli est installable : depuis le navigateur du téléphone, « Ajouter à l'écran d'accueil » (Chrome, Safari).
Le navigateur n'active l'installation et le mode hors connexion qu'en **HTTPS** (ou sur `localhost`) :
placez l'appli derrière un reverse proxy avec certificat et mettez `COOKIE_SECURE=true`.
Hors connexion, une page d'attente s'affiche ; les données du potager ne sont jamais mises en cache.

## Production (conteneur LXC Debian/Ubuntu, sans Docker)

Dans le conteneur, en root :

```
curl -fsSL https://raw.githubusercontent.com/nakedfoot/Pote-AG/main/deploy/install.sh | bash
```

Le script installe Git et Node 22 si besoin, clone le dépôt dans `/opt/potager`, compile, crée l'utilisateur système
`potager` et le service systemd `potager`, puis vérifie que l'appli répond (`/api/health`).
Ouvrez ensuite `http://<ip-du-conteneur>:3000` pour créer le compte administrateur.

- **Mise à jour** : `potager-update` (relance le script : `git pull`, compilation, redémarrage). Données et configuration conservées.
- **Version précise** : `curl … | POTAGER_REF=v1.0 bash` (branche ou étiquette Git ; `main` par défaut).
- **Configuration** : `/etc/potager.env` (port, `TZ`, `COOKIE_SECURE`…), puis `systemctl restart potager`.
- **Derrière nginx / nginx Proxy Manager** : désactiver « Cache Assets » (il met en cache les requêtes de navigation de Next.js et provoque
  « This page couldn't load » après un clic dans le menu) et « Block Common Exploits » ; activer « Websockets Support » si MQTT passe par le même hôte.
- **Données** : `/var/lib/potager` (base, photos, plan, clé de chiffrement).
- **Journaux** : `journalctl -u potager -f`.
- **Sauvegarde** : `bash /opt/potager/deploy/backup.sh [dossier]` (archive datée, à planifier avec cron).
- **Migrer une base de développement** : copier le contenu de `./data` (y compris `.secret`) vers `/var/lib/potager`
  avant le premier démarrage, puis `chown -R potager:potager /var/lib/potager`.
