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
