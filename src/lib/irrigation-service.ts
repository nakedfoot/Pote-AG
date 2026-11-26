import { all, get, run as sql } from "./db";
import {
  PLAFOND_OUVERTURE_S, dansPlages, debutJourLocal, dureePalierS, nouveauMinParPoint, parseConfig, prochainePlage, type CanalConfig,
} from "./irrigation";
import { meteoActuelle, meteoFiable, pluiePassee, pluiePrevue, refreshMeteo, tempMeteo } from "./meteo";
import { deviceState, getPublishDeps, isMqttConnected, publishCommand } from "./mqtt-service";
import { publishIrrigation, publishIrrigationAlerte } from "./mqtt-publish";
import { getIrrigationSettings, type IrrigationSettings } from "./settings";

/**
 * Moteur d'irrigation : toutes les 15 s, pour chaque canal, applique les règles et pilote la vanne (Zigbee2MQTT).
 *
 * Cycle automatique : palier (vanne ouverte) → pause (les capteurs se mettent à jour) → nouvelle mesure
 * → cible atteinte ? fin : palier suivant (durée recalculée sur le déficit restant), dans la limite des paliers,
 * de la durée totale et des quotas. L'état d'un cycle est en mémoire : au redémarrage, toutes les vannes sont fermées.
 */

const MIN = 60_000;
const TICK_MS = 15_000;
const ATTENTE_MESURE_MAX_MS = 20 * MIN; // après la pause, délai maximal d'attente d'une nouvelle mesure

/** Accès au monde extérieur (horloge, MQTT) : remplaçable dans les tests. */
export const io = {
  now: () => Date.now(),
  connecte: () => isMqttConnected(),
  envoyer: (vanne: string, payload: Record<string, unknown>) => publishCommand(vanne, payload),
  etatVanne: (vanne: string) => deviceState(vanne),
  alerte: (canal: string, message: string) => {
    const d = getPublishDeps();
    if (d) publishIrrigationAlerte(d, { date: new Date().toISOString(), canal, message });
  },
};

export type CanalRow = { id: number; nom: string; capteur_id: number | null; vanne: string | null; actif: number; auto: number; config: string; k_appris: number | null };

type Run = {
  phase: "ouvert" | "pause" | "attente";
  manuel: boolean;
  palier: number;
  debut: number;
  totalS: number;
  humDebut: number | null;
  humAvant: number | null;
  dureeS: number;
  dernierReelS: number;
  ouvertA: number;
  fermeA: number;
  confirme: boolean;
  essaisOuverture: number;
  tFermeture: number;
  finPause: number;
  sansGain: number;
  logId: number | null;
};
type Fermeture = { depuis: number; dernier: number; essais: number; alerte: boolean; silencieux: boolean };

export type EvalKind = "ok" | "inutile" | "bloque" | "inactif" | "pause_globale" | "hors_ligne" | "manuel";
type Eval = { kind: EvalKind; code: string; message: string; hum: number | null; humTs: number | null; temp: number | null; alerte?: boolean; silencieux?: boolean };

type Mem = {
  runs: Map<number, Run>;
  evals: Map<number, Eval>;
  fermetures: Map<number, Fermeture>;
  dernierLog: Map<number, string>; // dernier code de blocage journalisé, par canal
  timer: NodeJS.Timeout | null;
  init: boolean;
  occupe: boolean;
  publieA: number;
  signature: string;
};
const g = globalThis as unknown as { __irrigation?: Mem };
const mem = (): Mem =>
  (g.__irrigation ??= { runs: new Map(), evals: new Map(), fermetures: new Map(), dernierLog: new Map(), timer: null, init: false, occupe: false, publieA: 0, signature: "" });

// ---------- Lecture ----------
export const listCanaux = () =>
  all<CanalRow>("SELECT ic.*, c.friendly_name AS vanne FROM irrigation_canal ic LEFT JOIN capteur c ON c.id = ic.capteur_id ORDER BY ic.nom");
export const getCanal = (id: number) =>
  get<CanalRow>("SELECT ic.*, c.friendly_name AS vanne FROM irrigation_canal ic LEFT JOIN capteur c ON c.id = ic.capteur_id WHERE ic.id = ?", id);
export const carresDuCanal = (id: number) => all<{ carre_id: number }>("SELECT carre_id FROM irrigation_canal_carre WHERE canal_id = ?", id).map((r) => r.carre_id);

/** Mesure d'une métrique sur les capteurs des plants des carrés du canal : valeur minimale parmi les capteurs « valides ». */
export function mesure(canalId: number, metrique: "hum_sol" | "temp_air", now: number, o: { maxAgeMs?: number; minTs?: number } = {}) {
  const caps = all<{ capteur_id: number; champ: string }>(
    `SELECT DISTINCT pc.capteur_id, pc.champ FROM plant_capteur pc
     JOIN plant p ON p.id = pc.plant_id
     JOIN irrigation_canal_carre cc ON cc.carre_id = p.carre_id
     WHERE cc.canal_id = ? AND pc.metrique = ?`,
    canalId, metrique,
  );
  let valeur: number | null = null;
  let ts: number | null = null;
  let valides = 0;
  for (const c of caps) {
    const m = get<{ valeur: number; ts: number }>("SELECT valeur, ts FROM mesure WHERE capteur_id = ? AND champ = ? ORDER BY ts DESC LIMIT 1", c.capteur_id, c.champ);
    if (!m) continue;
    if (o.maxAgeMs !== undefined && now - m.ts > o.maxAgeMs) continue;
    if (o.minTs !== undefined && m.ts < o.minTs) continue;
    valides++;
    if (valeur === null || m.valeur < valeur) {
      valeur = m.valeur;
      ts = m.ts;
    }
  }
  return { total: caps.length, valides, valeur, ts };
}

export type LogRow = { id: number; canal_id: number; canal_nom: string; ts: number; type: string; niveau: string; message: string; duree_s: number | null; hum_avant: number | null; hum_apres: number | null; vu: number };
export const listLog = (canalId: number | null, limit = 200) =>
  all<LogRow>(
    `SELECT l.*, ic.nom AS canal_nom FROM irrigation_log l JOIN irrigation_canal ic ON ic.id = l.canal_id
     ${canalId ? "WHERE l.canal_id = ?" : ""} ORDER BY l.ts DESC, l.id DESC LIMIT ${Math.floor(limit)}`,
    ...(canalId ? [canalId] : []),
  );
export const alertesNonVues = () =>
  all<LogRow>(
    `SELECT l.*, ic.nom AS canal_nom FROM irrigation_log l JOIN irrigation_canal ic ON ic.id = l.canal_id
     WHERE l.niveau = 'alerte' AND l.vu = 0 ORDER BY l.ts DESC LIMIT 20`,
  );
export const acquitterAlertes = () => void sql("UPDATE irrigation_log SET vu = 1 WHERE niveau = 'alerte' AND vu = 0");

// ---------- Journal ----------
function ecrire(canalId: number, type: string, message: string, o: { niveau?: "info" | "alerte"; duree_s?: number; hum_avant?: number | null; hum_apres?: number | null } = {}): number {
  const r = sql(
    "INSERT INTO irrigation_log (canal_id, ts, type, niveau, message, duree_s, hum_avant, hum_apres) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    canalId, io.now(), type, o.niveau ?? "info", message, o.duree_s ?? null, o.hum_avant ?? null, o.hum_apres ?? null,
  );
  if (o.niveau === "alerte") {
    const nom = get<{ nom: string }>("SELECT nom FROM irrigation_canal WHERE id = ?", canalId)?.nom ?? "";
    io.alerte(nom, message);
  }
  return Number(r.lastInsertRowid);
}

const pct = (v: number) => `${Math.round(v * 10) / 10} %`;
const duree = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`);

// ---------- Règles ----------
function pauseGlobaleActive(s: IrrigationSettings, now: number): boolean {
  if (!s.pause) return false;
  if (!s.pauseJusqu) return true;
  const aujourdhui = new Date(now).toLocaleDateString("en-CA", { timeZone: s.fuseau });
  return aujourdhui <= s.pauseJusqu;
}

function quotas(canalId: number, cfg: CanalConfig, s: IrrigationSettings, now: number, demarrage: boolean): Eval | null {
  const jour = debutJourLocal(now, s.fuseau);
  const secs = get<{ n: number }>("SELECT COALESCE(SUM(duree_s), 0) n FROM irrigation_log WHERE canal_id = ? AND ts >= ? AND type IN ('palier','manuel')", canalId, jour)?.n ?? 0;
  const base = { hum: null, humTs: null, temp: null };
  if (secs >= cfg.duree_jour_max * 60) return { kind: "bloque", code: "quota_duree", message: `Quota journalier atteint (${Math.round(secs / 60)} min arrosées aujourd'hui)`, ...base };
  if (!demarrage) return null;
  const cycles = get<{ n: number }>("SELECT COUNT(*) n FROM irrigation_log WHERE canal_id = ? AND ts >= ? AND type = 'debut'", canalId, jour)?.n ?? 0;
  if (cycles >= cfg.cycles_jour_max) return { kind: "bloque", code: "quota_cycles", message: `Quota journalier atteint (${cycles} cycle(s) aujourd'hui)`, ...base };
  const fin = get<{ ts: number }>("SELECT MAX(ts) ts FROM irrigation_log WHERE canal_id = ? AND type = 'fin'", canalId)?.ts;
  if (fin && now - fin < cfg.delai_cycles_min * MIN) {
    const reste = Math.ceil((cfg.delai_cycles_min * MIN - (now - fin)) / MIN);
    return { kind: "bloque", code: "repos", message: `Repos entre deux cycles (encore ${reste} min)`, silencieux: true, ...base };
  }
  return null;
}

/**
 * Applique les règles. `demarrage` = décision de lancer un cycle (seuil de déclenchement, repos, cycles/jour) ;
 * sinon, contrôle en cours de cycle (météo, température, plage horaire, quota de durée).
 */
function evaluer(canal: CanalRow, cfg: CanalConfig, s: IrrigationSettings, now: number, demarrage: boolean): Eval {
  const vide = { hum: null, humTs: null, temp: null };
  if (pauseGlobaleActive(s, now)) return { kind: "pause_globale", code: "pause", message: "Pause globale des arrosages", ...vide };

  const hum = mesure(canal.id, "hum_sol", now, { maxAgeMs: s.mesureMaxMin * MIN });
  if (hum.total === 0) return { kind: "inactif", code: "capteur", message: "Aucun capteur d'humidité du sol sur les carrés du canal", ...vide };
  if (hum.valeur === null) {
    return { kind: "bloque", code: "mesure", message: `Aucune mesure d'humidité depuis plus de ${s.mesureMaxMin} min (capteur muet ?)`, alerte: true, ...vide };
  }
  const base = { hum: hum.valeur, humTs: hum.ts, temp: null as number | null };
  if (demarrage && hum.valeur >= cfg.seuil) return { kind: "inutile", code: "inutile", message: `Humidité suffisante (${pct(hum.valeur)} ≥ ${pct(cfg.seuil)})`, ...base };

  // Température : capteur local en priorité, sinon météo
  const { meteo } = meteoActuelle();
  const meteoOk = meteoFiable(meteo, now);
  const tLocale = mesure(canal.id, "temp_air", now, { maxAgeMs: s.mesureMaxMin * MIN }).valeur;
  const temp = tLocale ?? (meteoOk ? tempMeteo(meteo, now) : null);
  base.temp = temp;
  if (temp !== null && temp < cfg.temp_min) return { kind: "bloque", code: "temp", message: `Trop froid (${temp} °C < ${cfg.temp_min} °C)`, ...base };

  if (!dansPlages(cfg.plages, now, s.fuseau)) {
    return { kind: "bloque", code: "plage", message: `Hors plage horaire (prochaine : ${prochainePlage(cfg.plages, now, s.fuseau)})`, silencieux: true, ...base };
  }

  if (meteoOk) {
    const passee = pluiePassee(meteo, now, cfg.pluie_passee_h);
    if (passee >= cfg.pluie_passee_mm) return { kind: "bloque", code: "pluie_passee", message: `Il a plu : ${passee} mm sur les ${cfg.pluie_passee_h} dernières heures`, ...base };
    const prevue = pluiePrevue(meteo, now, 24);
    if (prevue >= cfg.pluie_prevue_mm) return { kind: "bloque", code: "pluie_prevue", message: `Pluie prévue : ${prevue} mm d'ici 24 h`, ...base };
  } else if (s.meteoIndispo === "bloquer" && s.latitude !== null) {
    return { kind: "bloque", code: "meteo", message: "Météo indisponible (réglage : ne pas arroser sans météo)", ...base };
  }

  const q = quotas(canal.id, cfg, s, now, demarrage);
  if (q) return { ...q, ...base };
  return { kind: "ok", code: "ok", message: "Conditions réunies", ...base };
}

// ---------- Vanne ----------
function demanderFermeture(canal: CanalRow, now: number, silencieux = false) {
  if (!canal.vanne) return;
  io.envoyer(canal.vanne, { state: "OFF" });
  const f = mem().fermetures.get(canal.id);
  mem().fermetures.set(canal.id, { depuis: f?.depuis ?? now, dernier: now, essais: (f?.essais ?? 0) + 1, alerte: f?.alerte ?? false, silencieux: f?.silencieux ?? silencieux });
}

/** Réémet l'ordre de fermeture tant que la vanne n'a pas confirmé qu'elle est fermée. */
function surveillerFermeture(canal: CanalRow, now: number) {
  const f = mem().fermetures.get(canal.id);
  if (!f || !canal.vanne) return;
  const etat = io.etatVanne(canal.vanne);
  if (etat === "OFF") return void mem().fermetures.delete(canal.id);
  if (now - f.dernier < 20_000) return;
  if (etat === null && f.essais >= 3) {
    if (!f.silencieux) ecrire(canal.id, "alerte", "Impossible de confirmer la fermeture de la vanne (état inconnu). Vérifiez-la.", { niveau: "alerte" });
    return void mem().fermetures.delete(canal.id);
  }
  if (etat === "ON" && f.essais >= 3 && !f.alerte) {
    f.alerte = true;
    ecrire(canal.id, "alerte", "La vanne ne répond pas à l'ordre de fermeture ! Vérifiez-la d'urgence.", { niveau: "alerte" });
  }
  demanderFermeture(canal, now);
}

function ouvrir(canal: CanalRow, cfg: CanalConfig, run: Run, dureeS: number, now: number): boolean {
  if (!canal.vanne) return false;
  const d = Math.min(Math.round(dureeS), PLAFOND_OUVERTURE_S);
  const payload: Record<string, unknown> = { state: "ON" };
  if (cfg.on_time) payload.on_time = d + 10; // minuterie matérielle : filet de sécurité si l'appli disparaît
  if (!io.envoyer(canal.vanne, payload)) return false;
  mem().fermetures.delete(canal.id);
  Object.assign(run, { phase: "ouvert", ouvertA: now, fermeA: now + d * 1000, dureeS: d, confirme: false, essaisOuverture: 0 } satisfies Partial<Run>);
  return true;
}

const nouveauRun = (manuel: boolean, now: number): Run => ({
  phase: "ouvert", manuel, palier: 0, debut: now, totalS: 0, humDebut: null, humAvant: null, dureeS: 0, dernierReelS: 0,
  ouvertA: now, fermeA: now, confirme: false, essaisOuverture: 0, tFermeture: now, finPause: now, sansGain: 0, logId: null,
});

function finCycle(canal: CanalRow, run: Run, message: string, niveau: "info" | "alerte" = "info", humApres: number | null = null) {
  ecrire(canal.id, "fin", message, { niveau, duree_s: run.totalS, hum_avant: run.humDebut, hum_apres: humApres });
  mem().runs.delete(canal.id);
}

function demarrerPalier(canal: CanalRow, cfg: CanalConfig, run: Run, hum: number, now: number): boolean {
  const k = cfg.auto_calibrage && canal.k_appris ? canal.k_appris : cfg.min_par_point;
  const reste = cfg.duree_totale_max * 60 - run.totalS;
  const dureeS = Math.min(dureePalierS(cfg.cible - hum, k, cfg), reste);
  if (dureeS < 30) {
    finCycle(canal, run, "Durée totale maximale atteinte", "info", hum);
    return false;
  }
  run.palier += 1;
  run.humAvant = hum;
  if (!ouvrir(canal, cfg, run, dureeS, now)) {
    finCycle(canal, run, "Impossible d'ouvrir la vanne (MQTT hors ligne ?)", "alerte", hum);
    return false;
  }
  return true;
}

function demarrerCycle(canal: CanalRow, cfg: CanalConfig, hum: number, now: number) {
  ecrire(canal.id, "debut", `Démarrage : humidité ${pct(hum)} < seuil ${pct(cfg.seuil)} (cible ${pct(cfg.cible)})`, { hum_avant: hum });
  const run = nouveauRun(false, now);
  run.humDebut = hum;
  mem().runs.set(canal.id, run);
  demarrerPalier(canal, cfg, run, hum, now);
}

function fermerPalier(canal: CanalRow, cfg: CanalConfig, run: Run, now: number) {
  const reel = Math.max(0, Math.round((run.fermeA - run.ouvertA) / 1000));
  demanderFermeture(canal, now);
  run.totalS += reel;
  run.dernierReelS = reel;
  if (run.manuel) {
    ecrire(canal.id, "manuel", `Arrosage manuel · ${duree(reel)}`, { duree_s: reel });
    mem().runs.delete(canal.id);
    return;
  }
  run.logId = ecrire(canal.id, "palier", `Palier ${run.palier}/${cfg.paliers_max} · ${duree(reel)}`, { duree_s: reel, hum_avant: run.humAvant });
  run.tFermeture = now;
  run.finPause = now + cfg.pause_min * MIN;
  run.phase = "pause";
}

function apresPause(canal: CanalRow, cfg: CanalConfig, s: IrrigationSettings, run: Run, now: number) {
  if (!io.connecte()) return;
  // Il faut une mesure prise APRÈS le palier (le sol met du temps à s'humidifier et le capteur à remonter l'info)
  const minTs = run.tFermeture + Math.max(cfg.pause_min / 2, 5) * MIN;
  const m = mesure(canal.id, "hum_sol", now, { minTs });
  const delaiDepasse = now > run.finPause + ATTENTE_MESURE_MAX_MS;
  if (m.valeur === null || (m.valides < m.total && !delaiDepasse)) {
    if (m.valeur === null && delaiDepasse) finCycle(canal, run, "Aucune nouvelle mesure du capteur après le palier : cycle abandonné", "alerte");
    return;
  }
  const hum = m.valeur;
  if (run.logId) sql("UPDATE irrigation_log SET hum_apres = ? WHERE id = ?", hum, run.logId);

  const gain = hum - (run.humAvant ?? hum);
  if (cfg.auto_calibrage) {
    const k = nouveauMinParPoint(canal.k_appris ?? cfg.min_par_point, run.dernierReelS, gain);
    if (k !== null) {
      sql("UPDATE irrigation_canal SET k_appris = ? WHERE id = ?", k, canal.id);
      canal.k_appris = k;
    }
  }
  run.sansGain = gain < 0.5 ? run.sansGain + 1 : 0;

  if (hum >= cfg.cible) return finCycle(canal, run, `Cible atteinte (${pct(hum)})`, "info", hum);
  if (run.sansGain >= 2) {
    return finCycle(canal, run, `L'humidité ne monte pas après ${run.sansGain} paliers (${pct(hum)}) : vanne fermée, tuyau coupé ou capteur déconnecté ?`, "alerte", hum);
  }
  if (run.palier >= cfg.paliers_max || run.totalS >= cfg.duree_totale_max * 60) {
    const bas = hum < cfg.seuil;
    return finCycle(canal, run, `Limite du cycle atteinte (${run.palier} palier(s), ${duree(run.totalS)}) — humidité ${pct(hum)}${bas ? ", encore sous le seuil" : ""}`, bas ? "alerte" : "info", hum);
  }
  const ev = evaluer(canal, cfg, s, now, false);
  if (ev.kind !== "ok") return finCycle(canal, run, `Cycle interrompu : ${ev.message}`, "info", hum);
  demarrerPalier(canal, cfg, run, hum, now);
}

function avancer(canal: CanalRow, cfg: CanalConfig, s: IrrigationSettings, run: Run, now: number) {
  if (run.phase === "ouvert") {
    const etat = canal.vanne ? io.etatVanne(canal.vanne) : null;
    if (etat === "ON") run.confirme = true;
    if (!run.confirme) {
      const dt = now - run.ouvertA;
      if (dt > 45_000 && run.essaisOuverture === 0 && canal.vanne) {
        run.essaisOuverture = 1;
        io.envoyer(canal.vanne, { state: "ON" });
      }
      if (dt > 120_000) {
        demanderFermeture(canal, now);
        return run.manuel
          ? (ecrire(canal.id, "alerte", "La vanne ne s'ouvre pas (aucune confirmation reçue).", { niveau: "alerte" }), void mem().runs.delete(canal.id))
          : finCycle(canal, run, "La vanne ne s'ouvre pas (aucune confirmation reçue) : cycle abandonné", "alerte");
      }
    } else if (etat === "OFF" && now - run.ouvertA > 20_000 && now < run.fermeA) {
      run.fermeA = now; // refermée avant l'heure (sécurité intégrée de la vanne, action manuelle…)
    }
    if (now >= run.fermeA || now - run.ouvertA > (PLAFOND_OUVERTURE_S + 60) * 1000) fermerPalier(canal, cfg, run, now);
  } else if (run.phase === "pause") {
    if (now >= run.finPause) run.phase = "attente";
  } else {
    apresPause(canal, cfg, s, run, now);
  }
}

function traiter(canal: CanalRow, now: number) {
  const m = mem();
  const cfg = parseConfig(canal.config);
  const s = getIrrigationSettings();
  surveillerFermeture(canal, now);
  const run = m.runs.get(canal.id);
  if (run) return avancer(canal, cfg, s, run, now);

  let ev: Eval;
  if (!canal.actif) ev = { kind: "inactif", code: "off", message: "Canal désactivé", hum: null, humTs: null, temp: null };
  else if (!canal.vanne) ev = { kind: "inactif", code: "vanne", message: "Aucune vanne affectée", hum: null, humTs: null, temp: null };
  else {
    ev = evaluer(canal, cfg, s, now, true);
    if (!canal.auto && (ev.kind === "ok" || ev.kind === "inutile")) ev = { ...ev, kind: ev.kind === "ok" ? "manuel" : ev.kind, message: ev.kind === "ok" ? "Mode manuel : arrosage nécessaire" : ev.message };
    if (!io.connecte() && ev.kind === "ok") ev = { ...ev, kind: "hors_ligne", code: "mqtt", message: "MQTT hors ligne" };
  }
  m.evals.set(canal.id, ev);

  // Journal des blocages (une fois par cause, pas à chaque passage)
  if (ev.kind === "bloque" && canal.auto && !ev.silencieux) {
    if (m.dernierLog.get(canal.id) !== ev.code) {
      m.dernierLog.set(canal.id, ev.code);
      ecrire(canal.id, "bloque", `Bloqué : ${ev.message}`, { niveau: ev.alerte ? "alerte" : "info", hum_avant: ev.hum });
    }
  } else if (ev.kind !== "bloque") m.dernierLog.delete(canal.id);

  if (ev.kind === "ok" && canal.auto && ev.hum !== null) demarrerCycle(canal, cfg, ev.hum, now);
}

// ---------- Boucle ----------
function fermerTout(raison: string) {
  const now = io.now();
  for (const c of listCanaux()) {
    if (!c.vanne) continue;
    demanderFermeture(c, now, true);
  }
  console.log(`[potager] irrigation : ${raison}`);
}

async function tick() {
  const m = mem();
  if (m.occupe) return;
  m.occupe = true;
  try {
    await refreshMeteo();
    if (!m.init) {
      if (!io.connecte()) {
        for (const c of listCanaux()) m.evals.set(c.id, { kind: "hors_ligne", code: "mqtt", message: "MQTT hors ligne ou non configuré", hum: null, humTs: null, temp: null });
        return;
      }
      fermerTout("vannes fermées par sécurité au démarrage");
      m.init = true;
      return; // les ordres de fermeture partent d'abord ; le premier contrôle a lieu au passage suivant
    }
    const now = io.now();
    for (const c of listCanaux()) {
      try {
        traiter(c, now);
      } catch (e) {
        console.error(`[potager] irrigation (canal ${c.nom}) :`, (e as Error).message);
      }
    }
    publier(false);
  } finally {
    m.occupe = false;
  }
}

export function startIrrigation() {
  const m = mem();
  if (m.timer) return;
  m.timer = setInterval(() => void tick().catch((e) => console.error("[potager] irrigation :", (e as Error).message)), TICK_MS);
  m.timer.unref();
  void tick();
}

/** Exécute un passage immédiatement (tests). */
export const _tick = tick;
export const _reset = () => {
  const m = mem();
  m.runs.clear(); m.evals.clear(); m.fermetures.clear(); m.dernierLog.clear(); m.init = false; m.occupe = false; m.signature = "";
};

// ---------- Commandes manuelles ----------
export function demarrerManuel(canalId: number, minutes: number): { ok: boolean; message: string } {
  const canal = getCanal(canalId);
  if (!canal || !canal.vanne) return { ok: false, message: "Canal sans vanne." };
  if (!canal.actif) return { ok: false, message: "Le canal est désactivé." };
  if (mem().runs.has(canalId)) return { ok: false, message: "Un arrosage est déjà en cours sur ce canal." };
  if (!io.connecte()) return { ok: false, message: "MQTT est hors ligne." };
  const s = Math.round(minutes * 60);
  if (!(s >= 30) || s > PLAFOND_OUVERTURE_S) return { ok: false, message: `Durée invalide (de 1 à ${PLAFOND_OUVERTURE_S / 60} minutes).` };
  const now = io.now();
  const run = nouveauRun(true, now);
  if (!ouvrir(canal, parseConfig(canal.config), run, s, now)) return { ok: false, message: "Impossible d'envoyer l'ordre à la vanne." };
  mem().runs.set(canalId, run);
  ecrire(canalId, "info", `Arrosage manuel demandé : ${duree(s)}`);
  return { ok: true, message: `Vanne ouverte pour ${duree(s)}.` };
}

/** Arrête l'arrosage en cours (ou ferme simplement la vanne). */
export function arreter(canalId: number, raison = "Arrêt manuel"): { ok: boolean; message: string } {
  const canal = getCanal(canalId);
  if (!canal) return { ok: false, message: "Canal introuvable." };
  const now = io.now();
  const run = mem().runs.get(canalId);
  if (run) {
    mem().runs.delete(canalId);
    if (run.phase === "ouvert") {
      const reel = Math.max(0, Math.round((Math.min(now, run.fermeA) - run.ouvertA) / 1000));
      ecrire(canalId, run.manuel ? "manuel" : "fin", `${raison} · ${duree(reel)} d'arrosage sur le palier en cours`, { duree_s: run.totalS + reel });
    } else {
      ecrire(canalId, "fin", `${raison} (cycle interrompu)`, { duree_s: run.totalS });
    }
  }
  demanderFermeture(canal, now);
  return { ok: true, message: "Vanne fermée." };
}

export function arretUrgence() {
  for (const c of listCanaux()) arreter(c.id, "Arrêt d'urgence");
}

/** Supprime un canal en fermant sa vanne. */
export function supprimerCanal(id: number) {
  const canal = getCanal(id);
  if (!canal) return;
  mem().runs.delete(id);
  mem().evals.delete(id);
  if (canal.vanne) {
    io.envoyer(canal.vanne, { state: "OFF" });
    mem().fermetures.delete(id);
  }
  sql("DELETE FROM irrigation_canal WHERE id = ?", id);
}

// ---------- Vue pour l'interface ----------
export type EtatCanal = "ouvert" | "pause" | "attente" | "bloque" | "inutile" | "inactif" | "manuel" | "pause_globale" | "hors_ligne" | "inconnu" | "ok";
export type CanalVue = {
  id: number;
  nom: string;
  vanne: string | null;
  actif: boolean;
  auto: boolean;
  config: CanalConfig;
  kAppris: number | null;
  carres: { id: number; nom: string }[];
  humidite: number | null;
  humiditeTs: number | null;
  temp: number | null;
  etat: EtatCanal;
  message: string;
  palier: number | null;
  secondesRestantes: number | null;
  manuel: boolean;
  vanneEtat: string | null;
  dernier: { ts: number; message: string; niveau: string } | null;
};

export function listCanauxVue(): CanalVue[] {
  const now = io.now();
  return listCanaux().map((c) => {
    const cfg = parseConfig(c.config);
    const run = mem().runs.get(c.id);
    const ev = mem().evals.get(c.id);
    const hum = mesure(c.id, "hum_sol", now);
    const temp = mesure(c.id, "temp_air", now).valeur;
    let etat: EtatCanal = ev?.kind ?? "inconnu";
    let message = ev?.message ?? "En attente du prochain contrôle";
    let secondes: number | null = null;
    if (run) {
      etat = run.phase;
      if (run.phase === "ouvert") {
        secondes = Math.max(0, Math.round((run.fermeA - now) / 1000));
        message = run.manuel ? "Arrosage manuel en cours" : `Palier ${run.palier}/${cfg.paliers_max} en cours`;
      } else if (run.phase === "pause") {
        secondes = Math.max(0, Math.round((run.finPause - now) / 1000));
        message = `Pause avant le palier ${run.palier + 1} (le temps que les capteurs se mettent à jour)`;
      } else message = "Attente d'une nouvelle mesure du capteur";
    }
    return {
      id: c.id,
      nom: c.nom,
      vanne: c.vanne,
      actif: !!c.actif,
      auto: !!c.auto,
      config: cfg,
      kAppris: c.k_appris,
      carres: all<{ id: number; nom: string }>("SELECT ca.id, ca.nom FROM irrigation_canal_carre cc JOIN carre ca ON ca.id = cc.carre_id WHERE cc.canal_id = ? ORDER BY ca.nom", c.id),
      humidite: hum.valeur,
      humiditeTs: hum.ts,
      temp,
      etat,
      message,
      palier: run?.palier ?? null,
      secondesRestantes: secondes,
      manuel: !!run?.manuel,
      vanneEtat: c.vanne ? io.etatVanne(c.vanne) : null,
      dernier: get<{ ts: number; message: string; niveau: string }>("SELECT ts, message, niveau FROM irrigation_log WHERE canal_id = ? AND type != 'bloque' ORDER BY ts DESC, id DESC LIMIT 1", c.id) ?? null,
    };
  });
}

// ---------- Publication MQTT / Home Assistant ----------
function publier(force: boolean) {
  const m = mem();
  const d = getPublishDeps();
  if (!d) return;
  const vues = listCanauxVue();
  if (vues.length === 0) return;
  const alertes = alertesNonVues();
  const sig = JSON.stringify([vues.map((v) => [v.id, v.etat, v.humidite, v.vanneEtat]), alertes.length]);
  const now = io.now();
  if (!force && sig === m.signature && now - m.publieA < 5 * MIN) return;
  m.signature = sig;
  m.publieA = now;
  publishIrrigation(d, {
    canaux: vues.map((v) => ({ id: v.id, nom: v.nom, etat: v.etat, message: v.message, humidite: v.humidite, vanne: v.vanneEtat, auto: v.auto })),
    alertes: alertes.map((a) => ({ canal: a.canal_nom, message: a.message, date: new Date(a.ts).toISOString() })),
  });
}
export const publierIrrigation = () => publier(true);
