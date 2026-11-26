import { getIrrigationSettings } from "./settings";

/** Météo Open-Meteo (gratuite, sans clé) : pluie passée et prévue, température. Mise en cache 15 min. */
export type Meteo = {
  ts: number; // dernière récupération réussie
  heures: { t: number; mm: number; temp: number | null }[]; // t = fin de l'heure (ms) ; mm = pluie de l'heure écoulée
};
type Cache = { meteo: Meteo | null; essai: number; erreur: string | null; cle: string };

const H = 3_600_000;
const TTL_MS = 15 * 60_000;
const VIEILLE_MS = 6 * H; // au-delà, les données ne sont plus considérées comme fiables

const g = globalThis as unknown as { __meteo?: Cache };
const cache = (): Cache => (g.__meteo ??= { meteo: null, essai: 0, erreur: null, cle: "" });

export function meteoActuelle(): { meteo: Meteo | null; erreur: string | null } {
  const c = cache();
  return { meteo: c.meteo, erreur: c.erreur };
}

/** Données utilisables : récupérées il y a moins de 6 h. */
export const meteoFiable = (m: Meteo | null, now = Date.now()): m is Meteo => !!m && now - m.ts < VIEILLE_MS;

/** Rafraîchit le cache si besoin. Ne lève jamais d'exception : l'erreur est mémorisée. */
export async function refreshMeteo(force = false): Promise<void> {
  const { latitude, longitude } = getIrrigationSettings();
  const c = cache();
  if (latitude === null || longitude === null) {
    c.meteo = null;
    c.erreur = null;
    return;
  }
  const cle = `${latitude},${longitude}`;
  if (!force && c.cle === cle && Date.now() - c.essai < TTL_MS) return;
  c.essai = Date.now();
  c.cle = cle;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&hourly=precipitation,temperature_2m&past_hours=24&forecast_hours=26&timezone=GMT`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { hourly?: { time?: string[]; precipitation?: (number | null)[]; temperature_2m?: (number | null)[] } };
    const time = j.hourly?.time ?? [];
    if (time.length === 0) throw new Error("réponse vide");
    c.meteo = {
      ts: Date.now(),
      heures: time.map((t, i) => ({
        t: Date.parse(`${t}Z`),
        mm: j.hourly?.precipitation?.[i] ?? 0,
        temp: j.hourly?.temperature_2m?.[i] ?? null,
      })),
    };
    c.erreur = null;
  } catch (e) {
    c.erreur = (e as Error).message;
  }
}

/** Cumul de pluie (mm) sur les `h` dernières heures. */
export function pluiePassee(m: Meteo, now: number, h: number): number {
  return round1(m.heures.filter((x) => x.t > now - h * H && x.t <= now).reduce((s, x) => s + x.mm, 0));
}

/** Cumul de pluie (mm) prévu dans les `h` prochaines heures. */
export function pluiePrevue(m: Meteo, now: number, h = 24): number {
  return round1(m.heures.filter((x) => x.t > now && x.t <= now + h * H).reduce((s, x) => s + x.mm, 0));
}

/** Température de l'heure en cours (°C). */
export function tempMeteo(m: Meteo, now: number): number | null {
  const passees = m.heures.filter((x) => x.t <= now && x.temp !== null);
  const futures = m.heures.filter((x) => x.t > now && x.temp !== null);
  return (futures[0] ?? passees[passees.length - 1])?.temp ?? null;
}

/** Résumé affichable de la météo actuelle (null si indisponible). */
export function resumeMeteo(now = Date.now()) {
  const { meteo, erreur } = meteoActuelle();
  if (!meteoFiable(meteo, now)) return { ok: false as const, erreur };
  return { ok: true as const, temp: tempMeteo(meteo, now), passee: pluiePassee(meteo, now, 4), prevue: pluiePrevue(meteo, now, 24) };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
