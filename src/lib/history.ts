import { all } from "./db";
import { METRICS, METRIC_KEYS, type MetricKey } from "./metrics";
import type { Plant } from "./queries";

export type Range = "24h" | "7j" | "30j" | "saison";
export const RANGES: Record<Range, string> = { "24h": "24 h", "7j": "7 jours", "30j": "30 jours", saison: "Saison" };
export const isRange = (v: unknown): v is Range => typeof v === "string" && v in RANGES;

const DAY = 86_400_000;
export type Point = { t: number; v: number };

export function rangeWindow(range: Range, datePlantation: string | null): { from: number; to: number } {
  const to = Date.now();
  if (range === "24h") return { from: to - DAY, to };
  if (range === "7j") return { from: to - 7 * DAY, to };
  if (range === "30j") return { from: to - 30 * DAY, to };
  const planted = datePlantation ? new Date(datePlantation).getTime() : NaN;
  const from = Number.isNaN(planted) ? to - 90 * DAY : planted;
  return { from: Math.max(from, to - 730 * DAY, 0), to };
}

/** Série moyennée par tranches de temps (max ~maxPoints points). */
export function serie(capteurId: number, champ: string, from: number, to: number, maxPoints = 150) {
  const bucketMs = Math.max(60_000, Math.ceil((to - from) / maxPoints));
  const rows = all<{ t: number; v: number }>(
    `SELECT CAST(ts / ? AS INTEGER) * ? AS t, AVG(valeur) AS v
     FROM mesure WHERE capteur_id = ? AND champ = ? AND ts >= ? AND ts <= ?
     GROUP BY t ORDER BY t`,
    bucketMs, bucketMs, capteurId, champ, from, to,
  );
  return { points: rows as Point[], bucketMs };
}

export type PlantSerie = {
  metrique: MetricKey;
  capteur: string;
  points: Point[];
  bucketMs: number;
  min: number | null;
  max: number | null;
};

export function plantSeries(p: Plant, from: number, to: number): PlantSerie[] {
  const assoc = all<{ capteur_id: number; metrique: MetricKey; champ: string; nom: string }>(
    `SELECT pc.capteur_id, pc.metrique, pc.champ, c.friendly_name nom
     FROM plant_capteur pc JOIN capteur c ON c.id = pc.capteur_id WHERE pc.plant_id = ?`,
    p.id,
  );
  return METRIC_KEYS.flatMap((k) => {
    const a = assoc.find((x) => x.metrique === k);
    if (!a) return [];
    const { points, bucketMs } = serie(a.capteur_id, a.champ, from, to);
    return [{
      metrique: k, capteur: a.nom, points, bucketMs,
      min: p[METRICS[k].min as keyof Plant] as number | null,
      max: p[METRICS[k].max as keyof Plant] as number | null,
    }];
  });
}

/** Séries des dernières 24 h (sparklines). */
export function recentSeries(p: Plant, ms = DAY): PlantSerie[] {
  const to = Date.now();
  return plantSeries(p, to - ms, to);
}

/** Évènements à superposer aux courbes (arrosage, engrais). */
export function plantMarks(plantId: number, from: number, to: number) {
  return all<{ type: string; date: string; commentaire: string | null }>(
    "SELECT type, date, commentaire FROM evenement WHERE plant_id = ? AND type IN ('arrosage','engrais') ORDER BY date",
    plantId,
  )
    .map((e) => ({
      t: new Date(`${e.date}T12:00:00`).getTime(),
      icone: e.type === "arrosage" ? "💧" : "🧴",
      label: `${e.type === "arrosage" ? "Arrosage" : "Engrais"} le ${e.date}${e.commentaire ? ` — ${e.commentaire}` : ""}`,
    }))
    .filter((m) => m.t >= from && m.t <= to);
}
