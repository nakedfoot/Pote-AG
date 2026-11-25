import { listPlants, plantStatus, type PlantRow, type PlantStatus } from "./queries";

/** Rappels « à faire » : calculés à la volée à partir des plants, de leurs capteurs et de leurs dates. */
export type RappelType = "arroser" | "recolte_retard" | "recolte" | "batterie" | "donnee_ancienne";
export type Rappel = { plant_id: number; nom: string; type: RappelType; message: string; urgence: 1 | 2 | 3 };

const RECOLTE_ANTICIPATION_J = 7;
const ICONE: Record<RappelType, string> = { arroser: "💧", recolte_retard: "🧺", recolte: "🧺", batterie: "🪫", donnee_ancienne: "⏱" };
export const rappelIcone = (t: RappelType) => ICONE[t];

/** Nombre de jours entre aujourd'hui et une date AAAA-MM-JJ (négatif si passée), ou null. */
function joursAvant(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function rappelsDuPlant(p: PlantRow, s: PlantStatus): Rappel[] {
  const out: Rappel[] = [];
  const add = (type: RappelType, message: string, urgence: Rappel["urgence"]) => out.push({ plant_id: p.id, nom: p.nom, type, message, urgence });

  if (s.aArroser) add("arroser", "Sol trop sec : à arroser", 3);

  if (p.statut !== "termine") {
    const j = joursAvant(p.date_recolte_prevue);
    if (j !== null && j < 0) add("recolte_retard", `Récolte prévue dépassée de ${-j} j`, 2);
    else if (j !== null && j <= RECOLTE_ANTICIPATION_J) add("recolte", j === 0 ? "Récolte prévue aujourd'hui" : `Récolte prévue dans ${j} j`, 2);
    else if (p.statut === "recolte") add("recolte", "À récolter", 2);
  }

  if (s.batterieBasse) add("batterie", `Batterie du capteur faible (${s.batterie} %)`, 1);
  if (s.perime && s.mesures.length > 0) add("donnee_ancienne", "Plus de nouvelles mesures du capteur", 1);
  return out;
}

export function listRappels(): Rappel[] {
  const all = listPlants().flatMap((p) => rappelsDuPlant(p, plantStatus(p)));
  return all.sort((a, b) => b.urgence - a.urgence || a.nom.localeCompare(b.nom));
}
