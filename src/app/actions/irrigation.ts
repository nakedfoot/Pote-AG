"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { HEURE_RE, parseConfig, validerConfig, type CanalConfig } from "@/lib/irrigation";
import { acquitterAlertes, arretUrgence as arretUrgenceService, arreter, demarrerManuel, getCanal, publierIrrigation, supprimerCanal } from "@/lib/irrigation-service";
import { refreshMeteo, resumeMeteo } from "@/lib/meteo";
import { getIrrigationSettings, saveIrrigationSettings, type Plage } from "@/lib/settings";
import type { ActionResult } from "./settings";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(",", ".");
  return v === "" ? NaN : Number(v);
};
const rafraichir = () => revalidatePath("/irrigation", "layout");

function plagesDuFormulaire(f: FormData): Plage[] | string {
  const d = f.getAll("plage_debut").map(String);
  const e = f.getAll("plage_fin").map(String);
  const out: Plage[] = [];
  for (let i = 0; i < d.length; i++) {
    if (!d[i] && !e[i]) continue; // ligne vide ignorée
    if (!HEURE_RE.test(d[i]) || !HEURE_RE.test(e[i])) return "Plage horaire invalide (format HH:MM).";
    out.push({ debut: d[i], fin: e[i] });
  }
  return out;
}

export async function saveCanal(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireUser();
  const id = Number(str(f, "id")) || null;
  const nom = str(f, "nom");
  const capteurId = Number(str(f, "capteur_id")) || null;
  const carres = [...new Set(f.getAll("carre").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!nom) return { ok: false, message: "Le nom du canal est obligatoire." };
  if (!capteurId || !get("SELECT 1 FROM capteur WHERE id = ? AND commutable = 1", capteurId)) return { ok: false, message: "Choisissez une vanne Zigbee." };
  if (get("SELECT 1 FROM irrigation_canal WHERE capteur_id = ? AND id IS NOT ?", capteurId, id)) return { ok: false, message: "Cette vanne est déjà utilisée par un autre canal." };
  if (carres.length === 0) return { ok: false, message: "Affectez au moins un carré au canal (il fournit les mesures d'humidité)." };
  const plages = plagesDuFormulaire(f);
  if (typeof plages === "string") return { ok: false, message: plages };

  const cfg: CanalConfig = {
    seuil: num(f, "seuil"), cible: num(f, "cible"), temp_min: num(f, "temp_min"),
    pluie_passee_h: num(f, "pluie_passee_h"), pluie_passee_mm: num(f, "pluie_passee_mm"), pluie_prevue_mm: num(f, "pluie_prevue_mm"),
    plages,
    min_par_point: num(f, "min_par_point"), auto_calibrage: f.get("auto_calibrage") === "on",
    palier_min: num(f, "palier_min"), palier_max: num(f, "palier_max"), pause_min: num(f, "pause_min"), paliers_max: num(f, "paliers_max"),
    duree_totale_max: num(f, "duree_totale_max"), cycles_jour_max: num(f, "cycles_jour_max"), duree_jour_max: num(f, "duree_jour_max"),
    delai_cycles_min: num(f, "delai_cycles_min"), on_time: f.get("on_time") === "on",
  };
  if (Object.values(cfg).some((v) => typeof v === "number" && !Number.isFinite(v))) return { ok: false, message: "Tous les champs numériques doivent être renseignés." };
  const err = validerConfig(cfg);
  if (err) return { ok: false, message: err };

  if (id) {
    const avant = getCanal(id);
    if (!avant) return { ok: false, message: "Canal introuvable." };
    const kReset = parseConfig(avant.config).min_par_point !== cfg.min_par_point; // l'utilisateur change la valeur de départ : on repart de zéro
    run("UPDATE irrigation_canal SET nom = ?, capteur_id = ?, config = ?, k_appris = CASE WHEN ? THEN NULL ELSE k_appris END WHERE id = ?", nom, capteurId, JSON.stringify(cfg), kReset ? 1 : 0, id);
    run("DELETE FROM irrigation_canal_carre WHERE canal_id = ?", id);
    for (const c of carres) run("INSERT INTO irrigation_canal_carre (canal_id, carre_id) VALUES (?, ?)", id, c);
  } else {
    const r = run("INSERT INTO irrigation_canal (nom, capteur_id, config) VALUES (?, ?, ?)", nom, capteurId, JSON.stringify(cfg));
    for (const c of carres) run("INSERT INTO irrigation_canal_carre (canal_id, carre_id) VALUES (?, ?)", Number(r.lastInsertRowid), c);
  }
  rafraichir();
  publierIrrigation();
  return { ok: true, message: "Canal enregistré." };
}

export async function deleteCanal(id: number): Promise<ActionResult> {
  await requireUser();
  supprimerCanal(id);
  rafraichir();
  return { ok: true, message: "Canal supprimé." };
}

export async function setCanalMode(id: number, champ: "actif" | "auto", valeur: boolean): Promise<ActionResult> {
  await requireUser();
  if (champ !== "actif" && champ !== "auto") return { ok: false, message: "Champ invalide." };
  run(`UPDATE irrigation_canal SET ${champ} = ? WHERE id = ?`, valeur ? 1 : 0, id);
  if (!valeur) arreter(id, champ === "actif" ? "Canal désactivé" : "Passage en mode manuel");
  rafraichir();
  return { ok: true, message: "" };
}

export async function arroserManuel(id: number, minutes: number): Promise<ActionResult> {
  await requireUser();
  const r = demarrerManuel(id, minutes);
  rafraichir();
  return r;
}

export async function arreterCanal(id: number): Promise<ActionResult> {
  await requireUser();
  const r = arreter(id);
  rafraichir();
  return r;
}

/** Ferme toutes les vannes et suspend les arrosages automatiques jusqu'à reprise manuelle. */
export async function arretUrgence(): Promise<ActionResult> {
  await requireUser();
  arretUrgenceService();
  saveIrrigationSettings({ ...getIrrigationSettings(), pause: true, pauseJusqu: null });
  rafraichir();
  return { ok: true, message: "Toutes les vannes sont fermées et les arrosages automatiques sont en pause." };
}

export async function setPause(actif: boolean, jusqu: string | null): Promise<ActionResult> {
  await requireUser();
  if (jusqu && !/^\d{4}-\d{2}-\d{2}$/.test(jusqu)) return { ok: false, message: "Date invalide." };
  saveIrrigationSettings({ ...getIrrigationSettings(), pause: actif, pauseJusqu: actif ? jusqu || null : null });
  rafraichir();
  return { ok: true, message: actif ? "Arrosages automatiques en pause." : "Arrosages automatiques repris." };
}

export async function marquerAlertesVues(): Promise<ActionResult> {
  await requireUser();
  acquitterAlertes();
  rafraichir();
  publierIrrigation();
  return { ok: true, message: "" };
}

export async function saveIrrigationGlobal(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  await requireUser();
  const plages = plagesDuFormulaire(f);
  if (typeof plages === "string") return { ok: false, message: plages };
  const lat = str(f, "latitude") === "" ? null : num(f, "latitude");
  const lon = str(f, "longitude") === "" ? null : num(f, "longitude");
  if ((lat === null) !== (lon === null)) return { ok: false, message: "Renseignez la latitude ET la longitude (ou aucune des deux)." };
  if ((lat !== null && !(lat >= -90 && lat <= 90)) || (lon !== null && !(lon >= -180 && lon <= 180))) return { ok: false, message: "Coordonnées invalides." };
  const fuseau = str(f, "fuseau") || "Europe/Paris";
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: fuseau });
  } catch {
    return { ok: false, message: `Fuseau horaire inconnu : ${fuseau} (exemple : Europe/Paris).` };
  }
  const mesureMaxMin = num(f, "mesure_max_min");
  if (!(mesureMaxMin >= 10 && mesureMaxMin <= 240)) return { ok: false, message: "L'âge maximal d'une mesure doit être compris entre 10 et 240 minutes." };
  saveIrrigationSettings({
    ...getIrrigationSettings(),
    latitude: lat, longitude: lon, fuseau, plages, mesureMaxMin,
    meteoIndispo: str(f, "meteo_indispo") === "bloquer" ? "bloquer" : "ignorer",
  });
  await refreshMeteo(true);
  rafraichir();
  const m = resumeMeteo();
  if (lat === null) return { ok: true, message: "Réglages enregistrés (sans position : les règles météo sont ignorées)." };
  if (!m.ok) return { ok: false, message: `Réglages enregistrés, mais la météo est injoignable${m.erreur ? ` (${m.erreur})` : ""}.` };
  return { ok: true, message: `Réglages enregistrés. Météo reçue : ${m.temp ?? "?"} °C, pluie 4 h passées ${m.passee} mm, prévue 24 h ${m.prevue} mm.` };
}
