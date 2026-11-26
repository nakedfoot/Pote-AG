import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data");

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE settings (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
  );
  CREATE TABLE zone (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    couleur TEXT NOT NULL DEFAULT '#16a34a',
    plan_x REAL, plan_y REAL, plan_w REAL, plan_h REAL
  );
  CREATE TABLE carre (
    id INTEGER PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES zone(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    dimensions TEXT,
    exposition TEXT,
    plan_x REAL, plan_y REAL, plan_w REAL, plan_h REAL
  );
  CREATE TABLE plant (
    id INTEGER PRIMARY KEY,
    carre_id INTEGER REFERENCES carre(id) ON DELETE SET NULL,
    nom TEXT NOT NULL,
    variete TEXT,
    photo TEXT,
    opb_pid TEXT,
    opb_data TEXT,
    date_semis TEXT,
    date_plantation TEXT,
    date_recolte_prevue TEXT,
    statut TEXT NOT NULL DEFAULT 'croissance',
    notes TEXT,
    temp_min REAL, temp_max REAL,
    hum_air_min REAL, hum_air_max REAL,
    hum_sol_min REAL, hum_sol_max REAL,
    ec_min REAL, ec_max REAL,
    lux_min REAL, lux_max REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE capteur (
    id INTEGER PRIMARY KEY,
    friendly_name TEXT NOT NULL UNIQUE,
    ieee_addr TEXT,
    modele TEXT,
    dernier_contact TEXT
  );
  CREATE TABLE plant_capteur (
    plant_id INTEGER NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
    capteur_id INTEGER NOT NULL REFERENCES capteur(id) ON DELETE CASCADE,
    metrique TEXT NOT NULL,
    champ TEXT NOT NULL,
    PRIMARY KEY (plant_id, metrique)
  );
  CREATE TABLE mesure (
    capteur_id INTEGER NOT NULL REFERENCES capteur(id) ON DELETE CASCADE,
    champ TEXT NOT NULL,
    ts INTEGER NOT NULL,
    valeur REAL NOT NULL
  );
  CREATE INDEX idx_mesure ON mesure(capteur_id, champ, ts);
  CREATE TABLE evenement (
    id INTEGER PRIMARY KEY,
    plant_id INTEGER NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    commentaire TEXT,
    photo TEXT
  );
  `,
  // v2 : champs numériques exposés par chaque capteur Zigbee2MQTT (JSON [{champ, unite}])
  `ALTER TABLE capteur ADD COLUMN champs TEXT NOT NULL DEFAULT '[]';`,
  // v3 : topics de découverte Home Assistant publiés (pour pouvoir les retirer proprement)
  `CREATE TABLE mqtt_discovery (topic TEXT PRIMARY KEY);`,
  // v4 : calendrier et caractéristiques botaniques (complétés par les sources externes), cache des API
  `
  ALTER TABLE plant ADD COLUMN nom_scientifique TEXT;
  ALTER TABLE plant ADD COLUMN mois_plantation TEXT;
  ALTER TABLE plant ADD COLUMN mois_floraison TEXT;
  ALTER TABLE plant ADD COLUMN mois_fructification TEXT;
  ALTER TABLE plant ADD COLUMN mois_recolte TEXT;
  ALTER TABLE plant ADD COLUMN mois_taille TEXT;
  ALTER TABLE plant ADD COLUMN mois_dormance TEXT;
  ALTER TABLE plant ADD COLUMN cycle TEXT;
  ALTER TABLE plant ADD COLUMN exposition TEXT;
  ALTER TABLE plant ADD COLUMN arrosage TEXT;
  ALTER TABLE plant ADD COLUMN rusticite TEXT;
  ALTER TABLE plant ADD COLUMN ph_min REAL;
  ALTER TABLE plant ADD COLUMN ph_max REAL;
  ALTER TABLE plant ADD COLUMN hauteur_cm REAL;
  ALTER TABLE plant ADD COLUMN espacement_cm REAL;
  ALTER TABLE plant ADD COLUMN jours_recolte REAL;
  ALTER TABLE plant ADD COLUMN comestible TEXT;
  ALTER TABLE plant ADD COLUMN toxicite TEXT;
  ALTER TABLE plant ADD COLUMN description TEXT;
  ALTER TABLE plant ADD COLUMN sources_data TEXT;
  UPDATE plant SET nom_scientifique = json_extract(opb_data, '$.display_pid') WHERE opb_data IS NOT NULL AND json_valid(opb_data);
  CREATE TABLE source_cache (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, ts INTEGER NOT NULL);
  `,
  // v5 : hauteur mesurée de chaque plant, avec historique
  `
  CREATE TABLE plant_hauteur (
    id INTEGER PRIMARY KEY,
    plant_id INTEGER NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    hauteur_cm REAL NOT NULL,
    commentaire TEXT
  );
  CREATE INDEX idx_plant_hauteur ON plant_hauteur(plant_id, date);
  `,
  // v6 : dimensions précises des carrés (en cm), pour les représenter graphiquement
  `
  ALTER TABLE carre ADD COLUMN longueur_cm REAL;
  ALTER TABLE carre ADD COLUMN largeur_cm REAL;
  ALTER TABLE carre ADD COLUMN hauteur_cm REAL;
  `,
  // v7 : pieds optionnels aux quatre coins du carré
  `ALTER TABLE carre ADD COLUMN pieds INTEGER NOT NULL DEFAULT 0;`,
  // v8 : position libre du plant dans son carré (fractions 0..1 de la surface de terre)
  `
  ALTER TABLE plant ADD COLUMN plan_x REAL;
  ALTER TABLE plant ADD COLUMN plan_y REAL;
  `,
  // v9 : forme de la plante (arbre, arbuste, fleur…) pour son dessin dans le carré ; null = déduite du nom
  `ALTER TABLE plant ADD COLUMN type_plante TEXT;`,
  // v10 : nombre d'unités plantées (une fiche = une surface de plantation) et taille de cette surface dans le carré
  `
  ALTER TABLE plant ADD COLUMN quantite INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE plant ADD COLUMN plan_w REAL;
  ALTER TABLE plant ADD COLUMN plan_h REAL;
  `,
  // v11 : carré tourné de 90° sur le plan du jardin
  `ALTER TABLE carre ADD COLUMN plan_rot INTEGER NOT NULL DEFAULT 0;`,
  // v12 : la rotation du carré sur le plan est un angle libre en degrés (0 ou 1 = 90° avant)
  `UPDATE carre SET plan_rot = plan_rot * 90;`,
  // v13 : irrigation — canaux (une vanne Zigbee + des carrés), journal des arrosages et des alertes
  `
  ALTER TABLE capteur ADD COLUMN commutable INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE irrigation_canal (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    capteur_id INTEGER REFERENCES capteur(id) ON DELETE SET NULL,
    actif INTEGER NOT NULL DEFAULT 1,
    auto INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    k_appris REAL
  );
  CREATE TABLE irrigation_canal_carre (
    canal_id INTEGER NOT NULL REFERENCES irrigation_canal(id) ON DELETE CASCADE,
    carre_id INTEGER NOT NULL REFERENCES carre(id) ON DELETE CASCADE,
    PRIMARY KEY (canal_id, carre_id)
  );
  CREATE TABLE irrigation_log (
    id INTEGER PRIMARY KEY,
    canal_id INTEGER NOT NULL REFERENCES irrigation_canal(id) ON DELETE CASCADE,
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    niveau TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    duree_s INTEGER,
    hum_avant REAL,
    hum_apres REAL,
    vu INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_irrigation_log ON irrigation_log(canal_id, ts);
  `,
];

const g = globalThis as unknown as { __db?: DatabaseSync };

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "potager.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

export function db(): DatabaseSync {
  return (g.__db ??= open());
}

export function all<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T[] {
  // node:sqlite renvoie des objets sans prototype : on les convertit en objets simples
  // (sinon React refuse de les passer aux composants client).
  return db().prepare(sql).all(...params).map((r) => ({ ...r })) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): T | undefined {
  const row = db().prepare(sql).get(...params);
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: (string | number | null)[]) {
  return db().prepare(sql).run(...params);
}
