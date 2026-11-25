import { all, get } from "./db";
import { getLive } from "./live";
import { METRICS, etatMesure, type Etat, type MetricKey } from "./metrics";

export type Zone = { id: number; nom: string; couleur: string };
export type Carre = { id: number; zone_id: number; nom: string; dimensions: string | null; exposition: string | null };
export type Plant = {
  id: number; carre_id: number | null; nom: string; variete: string | null; photo: string | null;
  opb_pid: string | null; opb_data: string | null;
  date_semis: string | null; date_plantation: string | null; date_recolte_prevue: string | null;
  statut: string; notes: string | null;
  temp_min: number | null; temp_max: number | null;
  hum_air_min: number | null; hum_air_max: number | null;
  hum_sol_min: number | null; hum_sol_max: number | null;
  ec_min: number | null; ec_max: number | null;
  lux_min: number | null; lux_max: number | null;
};
export type PlantRow = Plant & { carre_nom: string | null; zone_id: number | null; zone_nom: string | null };
export type Evenement = { id: number; plant_id: number; type: string; date: string; commentaire: string | null };

export const listZones = () => all<Zone>("SELECT * FROM zone ORDER BY nom");
export const listCarres = () =>
  all<Carre & { zone_nom: string; nb_plants: number }>(
    `SELECT c.*, z.nom zone_nom, (SELECT COUNT(*) FROM plant p WHERE p.carre_id = c.id) nb_plants
     FROM carre c JOIN zone z ON z.id = c.zone_id ORDER BY z.nom, c.nom`,
  );
export const getPlant = (id: number) => get<PlantRow>(PLANT_SQL + " WHERE p.id = ?", id);
export const listPlants = () => all<PlantRow>(PLANT_SQL + " ORDER BY z.nom, c.nom, p.nom");
export const listEvenements = (plantId: number) =>
  all<Evenement>("SELECT * FROM evenement WHERE plant_id = ? ORDER BY date DESC, id DESC", plantId);

const PLANT_SQL = `SELECT p.*, c.nom carre_nom, z.id zone_id, z.nom zone_nom
  FROM plant p LEFT JOIN carre c ON c.id = p.carre_id LEFT JOIN zone z ON z.id = c.zone_id`;

export function ageJours(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date).getTime();
  return Number.isNaN(d) ? null : Math.floor((Date.now() - d) / 86400000);
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("fr-FR");
}

export type PlantMesure = {
  metrique: MetricKey; capteur: string; champ: string;
  valeur: number | null; ts: number | null; etat: Etat;
};

/** Dernière mesure et état (vs seuils) pour chaque capteur associé au plant. */
export function plantMesures(p: Plant): PlantMesure[] {
  const rows = all<{ capteur_id: number; metrique: MetricKey; champ: string; nom: string }>(
    `SELECT pc.capteur_id, pc.metrique, pc.champ, c.friendly_name nom
     FROM plant_capteur pc JOIN capteur c ON c.id = pc.capteur_id WHERE pc.plant_id = ?`,
    p.id,
  );
  return rows.map((r) => {
    const m = get<{ valeur: number; ts: number }>(
      "SELECT valeur, ts FROM mesure WHERE capteur_id = ? AND champ = ? ORDER BY ts DESC LIMIT 1",
      r.capteur_id, r.champ,
    );
    const min = p[METRICS[r.metrique].min as keyof Plant] as number | null;
    const max = p[METRICS[r.metrique].max as keyof Plant] as number | null;
    return {
      metrique: r.metrique, capteur: r.nom, champ: r.champ,
      valeur: m?.valeur ?? null, ts: m?.ts ?? null, etat: etatMesure(m?.valeur ?? null, min, max),
    };
  });
}

export function plantAssoc(plantId: number): Partial<Record<MetricKey, string>> {
  const out: Partial<Record<MetricKey, string>> = {};
  for (const r of all<{ capteur_id: number; metrique: MetricKey; champ: string }>(
    "SELECT capteur_id, metrique, champ FROM plant_capteur WHERE plant_id = ?", plantId,
  )) out[r.metrique] = `${r.capteur_id}|${r.champ}`;
  return out;
}

export const STALE_MS = 3 * 3_600_000; // mesure considérée périmée au-delà de 3 h
export const BATTERIE_BASSE = 20;

export type PlantStatus = {
  mesures: PlantMesure[];
  pire: Etat;
  perime: boolean;
  batterie: number | null;
  batterieBasse: boolean;
  aArroser: boolean;
  dernierArrosage: string | null;
};

export function plantStatus(p: Plant): PlantStatus {
  const mesures = plantMesures(p);
  const pire: Etat = mesures.some((m) => m.etat === "haut") ? "haut" : mesures.some((m) => m.etat === "bas") ? "bas" : mesures.some((m) => m.etat === "ok") ? "ok" : "inconnu";
  const perime = mesures.some((m) => m.ts === null || Date.now() - m.ts > STALE_MS);
  // Batterie : dernière valeur reçue (mémoire) des capteurs associés.
  const noms = all<{ friendly_name: string }>(
    "SELECT DISTINCT c.friendly_name FROM plant_capteur pc JOIN capteur c ON c.id = pc.capteur_id WHERE pc.plant_id = ?", p.id,
  );
  const bats = noms.map((n) => getLive(n.friendly_name)?.values.battery).filter((b): b is number => typeof b === "number");
  const batterie = bats.length ? Math.min(...bats) : null;
  const sol = mesures.find((m) => m.metrique === "hum_sol");
  return {
    mesures, pire, perime, batterie,
    batterieBasse: batterie !== null && batterie <= BATTERIE_BASSE,
    aArroser: sol?.etat === "bas",
    dernierArrosage: get<{ d: string | null }>("SELECT MAX(date) d FROM evenement WHERE plant_id = ? AND type = 'arrosage'", p.id)?.d ?? null,
  };
}

export function ilYa(ts: number | null): string {
  if (ts === null) return "jamais";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.floor(min / 60)} h`;
  return `il y a ${Math.floor(min / 1440)} j`;
}
