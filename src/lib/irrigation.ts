import type { Plage } from "./settings";

/**
 * Irrigation : types, valeurs par défaut et règles de calcul PURES (sans base ni MQTT), donc testables.
 * Le moteur qui les applique est dans irrigation-service.ts.
 */

export type CanalConfig = {
  seuil: number; // % d'humidité du sol sous lequel on arrose
  cible: number; // % visé : on arrête dès qu'il est atteint
  temp_min: number; // °C : pas d'arrosage en dessous
  pluie_passee_h: number; // pas d'arrosage s'il a plu plus de pluie_passee_mm sur ces N dernières heures
  pluie_passee_mm: number;
  pluie_prevue_mm: number; // pas d'arrosage si au moins ce cumul est prévu dans les 24 h
  plages: Plage[]; // plages horaires autorisées (vide = à toute heure)
  min_par_point: number; // minutes d'arrosage pour gagner 1 point d'humidité (valeur initiale)
  auto_calibrage: boolean; // affiner min_par_point d'après les gains mesurés
  palier_min: number; // minutes
  palier_max: number;
  pause_min: number; // pause entre deux paliers (capteurs mis à jour toutes les 8-10 min)
  paliers_max: number;
  duree_totale_max: number; // minutes par cycle
  cycles_jour_max: number;
  duree_jour_max: number; // minutes par jour
  delai_cycles_min: number; // repos minimal entre deux cycles
  on_time: boolean; // envoie aussi une minuterie matérielle (on_time) à la vanne, si elle la supporte
};

export const CONFIG_DEFAUT: CanalConfig = {
  seuil: 30,
  cible: 40,
  temp_min: 5,
  pluie_passee_h: 4,
  pluie_passee_mm: 1,
  pluie_prevue_mm: 2,
  plages: [{ debut: "05:00", fin: "10:00" }, { debut: "19:00", fin: "22:00" }],
  min_par_point: 2,
  auto_calibrage: true,
  palier_min: 3,
  palier_max: 10,
  pause_min: 15,
  paliers_max: 4,
  duree_totale_max: 40,
  cycles_jour_max: 3,
  duree_jour_max: 60,
  delai_cycles_min: 120,
  on_time: false,
};

/** Plafond absolu d'ouverture d'une vanne, quoi qu'il arrive (arrosage manuel compris). */
export const PLAFOND_OUVERTURE_S = 60 * 60;

export const HEURE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseConfig(json: string | null): CanalConfig {
  let raw: Partial<CanalConfig> = {};
  try {
    raw = JSON.parse(json || "{}");
  } catch {
    /* config corrompue : valeurs par défaut */
  }
  const c = { ...CONFIG_DEFAUT, ...raw };
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  for (const k of Object.keys(CONFIG_DEFAUT) as (keyof CanalConfig)[]) {
    if (typeof CONFIG_DEFAUT[k] === "number") (c as Record<string, unknown>)[k] = num(c[k], CONFIG_DEFAUT[k] as number);
  }
  c.plages = Array.isArray(c.plages) ? c.plages.filter((p) => p && HEURE_RE.test(p.debut) && HEURE_RE.test(p.fin)) : [];
  c.auto_calibrage = !!c.auto_calibrage;
  c.on_time = !!c.on_time;
  return c;
}

/** Message d'erreur si la configuration est incohérente, sinon null. */
export function validerConfig(c: CanalConfig): string | null {
  if (c.seuil < 0 || c.cible > 100) return "Les pourcentages doivent être compris entre 0 et 100.";
  if (c.cible <= c.seuil) return "La cible d'humidité doit être supérieure au seuil de déclenchement.";
  if (c.palier_min <= 0 || c.palier_max < c.palier_min) return "Durées de palier incohérentes (mini > 0 et maxi ≥ mini).";
  if (c.palier_max * 60 > PLAFOND_OUVERTURE_S) return "Un palier ne peut pas dépasser 60 minutes.";
  if (c.pause_min < 1) return "La pause entre paliers doit durer au moins 1 minute.";
  if (c.paliers_max < 1 || c.duree_totale_max < c.palier_min) return "Nombre de paliers ou durée totale incohérents.";
  if (c.min_par_point <= 0) return "Les minutes par point d'humidité doivent être positives.";
  if (c.cycles_jour_max < 1 || c.duree_jour_max < c.palier_min) return "Quotas journaliers incohérents.";
  return null;
}

// ---------- Temps ----------
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(ts: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    } catch {
      f = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    }
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ts))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
}

/** Secondes écoulées depuis minuit dans le fuseau donné. */
export function secondesDepuisMinuit(ts: number, tz: string): number {
  const p = parts(ts, tz);
  return p.hour * 3600 + p.minute * 60 + p.second;
}

/** Instant (ms) du dernier minuit local : borne des quotas journaliers. */
export const debutJourLocal = (ts: number, tz: string) => ts - secondesDepuisMinuit(ts, tz) * 1000;

const enMinutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** Vrai si l'instant est dans une des plages (une plage « 22:00 → 06:00 » franchit minuit). Aucune plage = toujours vrai. */
export function dansPlages(plages: Plage[], ts: number, tz: string): boolean {
  if (plages.length === 0) return true;
  const m = Math.floor(secondesDepuisMinuit(ts, tz) / 60);
  return plages.some((p) => {
    const d = enMinutes(p.debut);
    const f = enMinutes(p.fin);
    return d <= f ? m >= d && m < f : m >= d || m < f;
  });
}

/** Début de la prochaine plage (« HH:MM »), pour expliquer un blocage horaire. */
export function prochainePlage(plages: Plage[], ts: number, tz: string): string | null {
  if (plages.length === 0) return null;
  const m = Math.floor(secondesDepuisMinuit(ts, tz) / 60);
  const debuts = plages.map((p) => enMinutes(p.debut));
  const apres = debuts.filter((d) => d > m).sort((a, b) => a - b)[0] ?? Math.min(...debuts);
  return `${String(Math.floor(apres / 60)).padStart(2, "0")}:${String(apres % 60).padStart(2, "0")}`;
}

// ---------- Durées ----------
/** Durée d'un palier (secondes) : déficit × minutes par point, bornée entre palier_min et palier_max. */
export function dureePalierS(deficit: number, minParPoint: number, c: Pick<CanalConfig, "palier_min" | "palier_max">): number {
  const brut = Math.max(0, deficit) * minParPoint * 60;
  return Math.round(Math.min(c.palier_max * 60, Math.max(c.palier_min * 60, brut)));
}

/**
 * Auto-calibrage : minutes par point observées sur le dernier palier, lissées (moyenne mobile exponentielle).
 * Retourne null si le gain est trop faible pour être significatif.
 */
export function nouveauMinParPoint(ancien: number, dureeS: number, gain: number): number | null {
  if (gain < 0.5 || dureeS < 60) return null;
  const obs = dureeS / 60 / gain;
  return Math.min(20, Math.max(0.2, Math.round((0.7 * ancien + 0.3 * obs) * 100) / 100));
}

// ---------- Aide à la saisie ----------
/** Seuil et cible suggérés d'après les seuils d'humidité du sol des plants (null si aucun plant n'en a). */
export function suggererSeuils(plants: { min: number | null; max: number | null }[]): { seuil: number; cible: number } | null {
  const mins = plants.map((p) => p.min).filter((v): v is number => v !== null);
  if (mins.length === 0) return null;
  const seuil = Math.round(Math.max(...mins));
  const milieux = plants.map((p) => (p.min !== null && p.max !== null ? (p.min + p.max) / 2 : p.min !== null ? p.min + 10 : null)).filter((v): v is number => v !== null);
  const moy = milieux.reduce((a, b) => a + b, 0) / milieux.length;
  return { seuil, cible: Math.min(100, Math.max(seuil + 5, Math.round(moy))) };
}
