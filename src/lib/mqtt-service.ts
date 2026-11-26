import mqtt, { type MqttClient } from "mqtt";
import { all, db, get, run } from "./db";
import { getMqttSettings, mqttUrl, type MqttSettings } from "./settings";
import { publishRappels, publishState, removePlant, statusTopic, syncAll, syncPlant, type Deps } from "./mqtt-publish";
import { liveStore, type Live } from "./live";

/**
 * Service MQTT : écoute Zigbee2MQTT, découvre les capteurs, mémorise les valeurs
 * en direct et enregistre les mesures des capteurs associés à un plant.
 * L'état est porté par globalThis pour être partagé entre instrumentation, routes et actions.
 */

export type ChampInfo = { champ: string; unite: string | null };
type State = {
  client: MqttClient | null;
  configured: boolean;
  connected: boolean;
  error: string | null;
  z2mBase: string;
  live: Map<string, Live>; // par friendly_name
  lastWrite: Map<string, number>; // "capteurId|champ" -> ts
  cleanupTimer: NodeJS.Timeout | null;
  cfg: MqttSettings | null;
  publishTimer: NodeJS.Timeout | null;
  lastPublish: Map<number, number>; // plantId -> ts
  pending: Map<number, NodeJS.Timeout>; // publications différées (anti-rafale)
  publishedAt: number | null;
  plantsPublished: number;
};

const WRITE_INTERVAL_MS = 60_000; // une mesure par capteur/champ et par minute au maximum
const RAW_DAYS = 30; // mesures brutes conservées 30 jours, puis moyennées à l'heure
const KEEP_DAYS = 730; // suppression après 2 ans

const g = globalThis as unknown as { __mqttState?: State };
function st(): State {
  return (g.__mqttState ??= {
    client: null,
    configured: false,
    connected: false,
    error: null,
    z2mBase: "zigbee2mqtt",
    live: liveStore,
    lastWrite: new Map(),
    cleanupTimer: null,
    cfg: null,
    publishTimer: null,
    lastPublish: new Map(),
    pending: new Map(),
    publishedAt: null,
    plantsPublished: 0,
  });
}

export function getMqttStatus() {
  const s = st();
  return { configured: s.configured, connected: s.connected, error: s.error, publishedAt: s.publishedAt, plantsPublished: s.plantsPublished };
}

export function getLive(friendlyName: string): Live | undefined {
  return st().live.get(friendlyName);
}

export const isMqttConnected = () => st().connected;

/** Envoie une commande à un appareil Zigbee2MQTT (`<base>/<nom>/set`). Faux si MQTT est hors ligne. */
export function publishCommand(friendlyName: string, payload: Record<string, unknown>): boolean {
  const s = st();
  if (!s.client || !s.connected) return false;
  s.client.publish(`${s.z2mBase}/${friendlyName}/set`, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) s.error = `Commande impossible : ${err.message}`;
  });
  return true;
}

/** Dernier état ON/OFF connu d'un appareil (null si jamais reçu). */
export function deviceState(friendlyName: string): string | null {
  return st().live.get(friendlyName)?.etats?.state ?? null;
}

/** Extrait les champs numériques d'un `definition.exposes` Zigbee2MQTT (récursif). */
function numericExposes(exposes: unknown, out: ChampInfo[] = []): ChampInfo[] {
  if (!Array.isArray(exposes)) return out;
  for (const e of exposes as Record<string, unknown>[]) {
    if (e.type === "numeric" && typeof e.property === "string") {
      out.push({ champ: e.property, unite: typeof e.unit === "string" ? e.unit : null });
    }
    if (Array.isArray(e.features)) numericExposes(e.features, out);
  }
  return out;
}

/** Vrai si l'appareil expose un interrupteur (propriété `state` ON/OFF) : vanne, prise… */
function hasSwitch(exposes: unknown): boolean {
  if (!Array.isArray(exposes)) return false;
  for (const e of exposes as Record<string, unknown>[]) {
    if (e.property === "state" && e.value_on === "ON") return true;
    if (Array.isArray(e.features) && hasSwitch(e.features)) return true;
  }
  return false;
}

function handleDevices(payload: Buffer) {
  let devices: unknown;
  try {
    devices = JSON.parse(payload.toString());
  } catch {
    return;
  }
  if (!Array.isArray(devices)) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structure Z2M non typée
  for (const d of devices as Record<string, any>[]) {
    if (d.type === "Coordinator" || typeof d.friendly_name !== "string") continue;
    const champs = numericExposes(d.definition?.exposes).filter((c) => !["linkquality", "voltage", "battery"].includes(c.champ));
    const modele = d.definition?.model ?? null;
    const commutable = hasSwitch(d.definition?.exposes) ? 1 : 0;
    const ieee = d.ieee_address ?? null;
    const known = ieee ? get<{ id: number }>("SELECT id FROM capteur WHERE ieee_addr = ?", ieee) : undefined;
    if (known) {
      run("UPDATE capteur SET friendly_name = ?, modele = ?, champs = ?, commutable = ? WHERE id = ?", d.friendly_name, modele, JSON.stringify(champs), commutable, known.id);
    } else {
      run(
        `INSERT INTO capteur (friendly_name, ieee_addr, modele, champs, commutable) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(friendly_name) DO UPDATE SET ieee_addr = excluded.ieee_addr, modele = excluded.modele, champs = excluded.champs, commutable = excluded.commutable`,
        d.friendly_name, ieee, modele, JSON.stringify(champs), commutable,
      );
    }
  }
}

function handleDeviceState(friendly: string, payload: Buffer) {
  let data: unknown;
  try {
    data = JSON.parse(payload.toString());
  } catch {
    return;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
  }
  // État ON/OFF d'une vanne ou d'une prise
  const etat = (data as Record<string, unknown>).state;
  const etats = typeof etat === "string" ? { state: etat.toUpperCase() } : undefined;
  if (Object.keys(values).length === 0 && !etats) return;

  const s = st();
  const now = Date.now();
  // On fusionne : certains capteurs n'envoient qu'une partie des champs à chaque message.
  const prev = s.live.get(friendly);
  s.live.set(friendly, { values: { ...(prev?.values ?? {}), ...values }, etats: { ...(prev?.etats ?? {}), ...etats }, ts: now });
  if (Object.keys(values).length === 0) return;

  const cap = get<{ id: number }>("SELECT id FROM capteur WHERE friendly_name = ?", friendly);
  if (!cap) return;
  run("UPDATE capteur SET dernier_contact = ? WHERE id = ?", new Date(now).toISOString(), cap.id);
  let wrote = false;
  for (const [champ, valeur] of Object.entries(values)) {
    if (!get("SELECT 1 FROM plant_capteur WHERE capteur_id = ? AND champ = ? LIMIT 1", cap.id, champ)) continue;
    const key = `${cap.id}|${champ}`;
    if (now - (s.lastWrite.get(key) ?? 0) < WRITE_INTERVAL_MS) continue;
    s.lastWrite.set(key, now);
    run("INSERT INTO mesure (capteur_id, champ, ts, valeur) VALUES (?, ?, ?, ?)", cap.id, champ, now, valeur);
    wrote = true;
  }
  if (wrote) {
    for (const r of all<{ plant_id: number }>("SELECT DISTINCT plant_id FROM plant_capteur WHERE capteur_id = ?", cap.id)) schedulePublish(r.plant_id);
  }
}

function onMessage(topic: string, payload: Buffer) {
  const base = st().z2mBase;
  if (!topic.startsWith(base + "/")) return;
  const rel = topic.slice(base.length + 1);
  if (rel === "bridge/devices") return handleDevices(payload);
  if (rel.startsWith("bridge/") || /\/(availability|set|get)$/.test(rel)) return;
  handleDeviceState(rel, payload);
}

/** Enregistre immédiatement la valeur en direct d'un capteur (appelé à l'association). */
export function snapshotLive(capteurId: number, champ: string) {
  const cap = get<{ friendly_name: string }>("SELECT friendly_name FROM capteur WHERE id = ?", capteurId);
  const v = cap ? st().live.get(cap.friendly_name)?.values[champ] : undefined;
  if (v === undefined) return;
  const now = Date.now();
  st().lastWrite.set(`${capteurId}|${champ}`, now);
  run("INSERT INTO mesure (capteur_id, champ, ts, valeur) VALUES (?, ?, ?, ?)", capteurId, champ, now, v);
}

export function stopMqtt() {
  const s = st();
  s.client?.end(true);
  s.client = null;
  s.connected = false;
  if (s.cleanupTimer) clearInterval(s.cleanupTimer);
  s.cleanupTimer = null;
  if (s.publishTimer) clearInterval(s.publishTimer);
  s.publishTimer = null;
  for (const t of s.pending.values()) clearTimeout(t);
  s.pending.clear();
  s.cfg = null;
}

// ---- Publication ----
const PUBLISH_MIN_INTERVAL_MS = 10_000; // au plus une publication d'état par plant toutes les 10 s
const PUBLISH_REFRESH_MS = 5 * 60_000; // republication périodique (âge, données anciennes…)

function deps(): Deps | null {
  const s = st();
  if (!s.client || !s.connected || !s.cfg) return null;
  const client = s.client;
  return {
    cfg: s.cfg,
    publish: (topic, payload, retain = false) => {
      client.publish(topic, payload, { retain, qos: 0 }, (err) => {
        if (err) s.error = `Publication impossible : ${err.message}`;
      });
    },
  };
}

const logErr = (what: string) => (e: unknown) => console.error(`[potager] ${what} :`, (e as Error).message);

function schedulePublish(plantId: number) {
  const s = st();
  if (!s.cfg || s.pending.has(plantId)) return;
  const wait = Math.max(0, (s.lastPublish.get(plantId) ?? 0) + PUBLISH_MIN_INTERVAL_MS - Date.now());
  const timer = setTimeout(() => {
    s.pending.delete(plantId);
    const d = deps();
    if (!d) return;
    s.lastPublish.set(plantId, Date.now());
    s.publishedAt = Date.now();
    publishState(d, plantId).catch(logErr("publication de l'état"));
  }, wait);
  timer.unref();
  s.pending.set(plantId, timer);
}

/** Resynchronise tout (état, découverte HA, image). Retourne le nombre de plants publiés. */
export async function syncAllNow(): Promise<number> {
  const d = deps();
  if (!d) return 0;
  const n = await syncAll(d);
  const s = st();
  s.publishedAt = Date.now();
  s.plantsPublished = n;
  return n;
}

/** À appeler après création/modification d'un plant (ne bloque pas, no-op si MQTT hors ligne). */
export function syncPlantNow(plantId: number) {
  const d = deps();
  if (!d) return;
  st().publishedAt = Date.now();
  syncPlant(d, plantId).catch(logErr("synchronisation du plant"));
  publishRappels(d); // arrosage, changement de dates ou de stade : les rappels changent aussi
}

export function removePlantNow(plantId: number) {
  const d = deps();
  if (d) removePlant(d, plantId);
}

export function getPublishDeps() {
  return deps();
}

/** Moyenne à l'heure les mesures de plus de RAW_DAYS jours (idempotent), supprime les plus anciennes. */
export function compactMesures() {
  const rawCutoff = Date.now() - RAW_DAYS * 86_400_000;
  const H = 3_600_000;
  const database = db();
  database.exec("BEGIN");
  try {
    database.exec("CREATE TEMP TABLE IF NOT EXISTS mesure_agg (capteur_id INTEGER, champ TEXT, ts INTEGER, valeur REAL)");
    database.exec("DELETE FROM mesure_agg");
    run(
      `INSERT INTO mesure_agg SELECT capteur_id, champ, CAST(ts / ${H} AS INTEGER) * ${H}, AVG(valeur)
       FROM mesure WHERE ts < ? GROUP BY capteur_id, champ, CAST(ts / ${H} AS INTEGER)`,
      rawCutoff,
    );
    run("DELETE FROM mesure WHERE ts < ?", rawCutoff);
    database.exec("INSERT INTO mesure SELECT capteur_id, champ, ts, valeur FROM mesure_agg");
    database.exec("DELETE FROM mesure_agg");
    run("DELETE FROM mesure WHERE ts < ?", Date.now() - KEEP_DAYS * 86_400_000);
    database.exec("COMMIT");
  } catch (e) {
    database.exec("ROLLBACK");
    throw e;
  }
}

/** (Re)démarre la connexion avec les paramètres enregistrés. */
export function startMqtt() {
  stopMqtt();
  const s = st();
  const cfg = getMqttSettings();
  s.z2mBase = cfg.z2mBaseTopic;
  s.error = null;
  s.configured = cfg.host !== "";

  const cleanup = () => {
    try {
      compactMesures();
    } catch (e) {
      console.error("[potager] compactage des mesures :", (e as Error).message);
    }
  };
  cleanup();
  s.cleanupTimer = setInterval(cleanup, 86_400_000);
  s.cleanupTimer.unref();

  if (!s.configured) return;

  const client = mqtt.connect(mqttUrl(cfg), {
    username: cfg.username || undefined,
    password: cfg.password || undefined,
    clientId: `potager-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
    // Testament : Home Assistant marque les entités indisponibles si l'appli disparaît.
    will: { topic: statusTopic(cfg), payload: Buffer.from("offline"), retain: true, qos: 0 },
  });
  s.client = client;
  s.cfg = cfg;

  client.on("connect", () => {
    if (s.client !== client) return;
    s.connected = true;
    s.error = null;
    client.subscribe(`${cfg.z2mBaseTopic}/#`, { qos: 0 }, (err) => {
      if (err) s.error = `Abonnement impossible : ${err.message}`;
    });
    client.publish(statusTopic(cfg), "online", { retain: true });
    syncAllNow().catch(logErr("synchronisation initiale"));
    if (s.publishTimer) clearInterval(s.publishTimer);
    s.publishTimer = setInterval(() => {
      const d = deps();
      if (!d) return;
      for (const p of all<{ id: number }>("SELECT id FROM plant")) publishState(d, p.id).catch(logErr("publication périodique"));
      publishRappels(d);
      // Réaffirme « online » : si une autre instance (même préfixe) a déclenché le testament « offline », ça se corrige seul.
      client.publish(statusTopic(d.cfg), "online", { retain: true });
    }, PUBLISH_REFRESH_MS);
    s.publishTimer.unref();
  });
  client.on("close", () => {
    if (s.client !== client) return;
    s.connected = false;
    if (s.publishTimer) clearInterval(s.publishTimer);
    s.publishTimer = null;
  });
  client.on("error", (e) => {
    if (s.client !== client) return;
    s.error = e.message;
  });
  client.on("message", onMessage);

}

// ---- Lecture pour l'UI ----
export type CapteurView = {
  id: number;
  friendly_name: string;
  modele: string | null;
  ts: number | null;
  champs: (ChampInfo & { valeur: number | null })[];
};

export function listCapteursLive(): CapteurView[] {
  const rows = all<{ id: number; friendly_name: string; modele: string | null; champs: string }>(
    "SELECT id, friendly_name, modele, champs FROM capteur ORDER BY friendly_name",
  );
  const out: CapteurView[] = [];
  for (const r of rows) {
    const live = st().live.get(r.friendly_name);
    const declared: ChampInfo[] = JSON.parse(r.champs || "[]");
    // Champs déclarés par Z2M + champs numériques réellement reçus.
    const names = new Set(declared.map((c) => c.champ));
    for (const k of Object.keys(live?.values ?? {})) if (!["linkquality", "voltage", "battery"].includes(k)) names.add(k);
    if (names.size === 0) continue;
    out.push({
      id: r.id,
      friendly_name: r.friendly_name,
      modele: r.modele,
      ts: live?.ts ?? null,
      champs: [...names].map((champ) => ({
        champ,
        unite: declared.find((c) => c.champ === champ)?.unite ?? null,
        valeur: live?.values[champ] ?? null,
      })),
    });
  }
  return out;
}
