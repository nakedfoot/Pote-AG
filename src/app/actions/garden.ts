"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { derniereHauteur } from "@/lib/queries";
import { removePlantNow, snapshotLive, syncAllNow, syncPlantNow } from "@/lib/mqtt-service";
import { copyUpload, deleteUpload, saveUpload } from "@/lib/image";
import { FIELD_KEYS, formatMois, MOIS_COLS, NUMBER_FIELDS, parseMois, parseSourcesData } from "@/lib/botanique";
import { METRIC_KEYS } from "@/lib/metrics";
import { formatDimensions } from "@/lib/carres";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const nul = (v: string) => (v === "" ? null : v);
const num = (f: FormData, k: string) => {
  const v = s(f, k).replace(",", ".");
  return v === "" || Number.isNaN(Number(v)) ? null : Number(v);
};

// ---- Zones ----
export async function saveZone(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id")) || 0;
  const nom = s(formData, "nom");
  const couleur = s(formData, "couleur") || "#16a34a";
  if (!nom) redirect("/zones");
  if (id) run("UPDATE zone SET nom = ?, couleur = ? WHERE id = ?", nom, couleur, id);
  else run("INSERT INTO zone (nom, couleur) VALUES (?, ?)", nom, couleur);
  syncAllNow().catch(() => {});
  redirect("/zones");
}

export async function deleteZone(formData: FormData) {
  await requireUser();
  run("DELETE FROM zone WHERE id = ?", Number(formData.get("id")));
  syncAllNow().catch(() => {});
  redirect("/zones");
}

// ---- Carrés ----
export async function saveCarre(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id")) || 0;
  const zone = Number(formData.get("zone_id"));
  const nom = s(formData, "nom");
  if (!nom || !zone) redirect("/carres");
  const pos = (k: string) => {
    const v = num(formData, k);
    return v !== null && v > 0 ? v : null;
  };
  const longueur = pos("longueur_cm");
  const largeur = pos("largeur_cm");
  const hauteur = pos("hauteur_cm");
  const dim = formatDimensions(longueur, largeur, hauteur);
  const expo = nul(s(formData, "exposition"));
  const pieds = formData.get("pieds") ? 1 : 0;
  if (id) run("UPDATE carre SET zone_id = ?, nom = ?, dimensions = ?, longueur_cm = ?, largeur_cm = ?, hauteur_cm = ?, pieds = ?, exposition = ? WHERE id = ?", zone, nom, dim, longueur, largeur, hauteur, pieds, expo, id);
  else run("INSERT INTO carre (zone_id, nom, dimensions, longueur_cm, largeur_cm, hauteur_cm, pieds, exposition) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", zone, nom, dim, longueur, largeur, hauteur, pieds, expo);
  syncAllNow().catch(() => {});
  redirect("/carres");
}

export async function deleteCarre(formData: FormData) {
  await requireUser();
  run("DELETE FROM carre WHERE id = ?", Number(formData.get("id")));
  syncAllNow().catch(() => {});
  redirect("/carres");
}

// ---- Plants ----
export async function savePlant(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id")) || 0;
  const nom = s(formData, "nom");
  if (!nom) redirect(id ? `/plants/${id}/edit` : "/plants/new");

  // Champs botaniques : seuils, calendrier (mois "3,4,5") et caractéristiques
  const botanique: Record<string, string | number | null> = {};
  for (const k of FIELD_KEYS) {
    if (NUMBER_FIELDS.has(k)) botanique[k] = num(formData, k);
    else if ((MOIS_COLS as readonly string[]).includes(k)) botanique[k] = nul(formatMois(parseMois(s(formData, k))));
    else botanique[k] = nul(s(formData, k));
  }
  // Provenance : on ne garde que les champs encore renseignés
  const sources = parseSourcesData(s(formData, "sources_data"));
  for (const k of Object.keys(sources.champs) as (keyof typeof sources.champs)[]) if (botanique[k] === null) delete sources.champs[k];

  const base = {
    carre_id: Number(formData.get("carre_id")) || null,
    nom,
    variete: nul(s(formData, "variete")),
    photo: nul(s(formData, "photo")),
    opb_pid: nul(s(formData, "opb_pid")),
    opb_data: nul(s(formData, "opb_data")),
    date_semis: nul(s(formData, "date_semis")),
    date_plantation: nul(s(formData, "date_plantation")),
    date_recolte_prevue: nul(s(formData, "date_recolte_prevue")),
    statut: s(formData, "statut") || "croissance",
    notes: nul(s(formData, "notes")),
    ...botanique,
    sources_data: JSON.stringify(sources),
  };
  const cols = Object.keys(base);
  const vals = Object.values(base) as (string | number | null)[];

  const previousPhoto = id ? get<{ photo: string | null }>("SELECT photo FROM plant WHERE id = ?", id)?.photo ?? null : null;
  let plantId = id;
  if (id) {
    run(`UPDATE plant SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, ...vals, id);
  } else {
    const r = run(
      `INSERT INTO plant (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      ...vals,
    );
    plantId = Number(r.lastInsertRowid);
  }
  // Photo envoyée depuis l'appareil (remplace la photo OpenPlantbook ou précédente)
  let photo = base.photo;
  const file = formData.get("photo_file");
  if (file instanceof File && file.size > 0 && file.type.startsWith("image/")) {
    try {
      photo = await saveUpload(file, plantId);
      run("UPDATE plant SET photo = ? WHERE id = ?", photo, plantId);
    } catch {
      /* image illisible : on conserve l'ancienne photo */
    }
  }
  if (previousPhoto && previousPhoto !== photo) deleteUpload(previousPhoto);

  // Association des capteurs : un champ de capteur par métrique ("capteurId|champ")
  run("DELETE FROM plant_capteur WHERE plant_id = ?", plantId);
  for (const k of METRIC_KEYS) {
    const [cid, champ] = s(formData, `capteur_${k}`).split("|");
    if (!cid || !champ) continue;
    run("INSERT INTO plant_capteur (plant_id, capteur_id, metrique, champ) VALUES (?, ?, ?, ?)", plantId, Number(cid), k, champ);
    snapshotLive(Number(cid), champ);
  }
  // Hauteur mesurée : une nouvelle entrée d'historique si la valeur a changé
  const hauteur = num(formData, "hauteur_actuelle");
  if (hauteur !== null && hauteur > 0 && derniereHauteur(plantId)?.hauteur_cm !== hauteur) {
    run("INSERT INTO plant_hauteur (plant_id, date, hauteur_cm) VALUES (?, ?, ?)", plantId, new Date().toISOString().slice(0, 10), hauteur);
  }
  syncPlantNow(plantId);
  redirect(`/plants/${plantId}`);
}

export async function addHauteur(formData: FormData) {
  await requireUser();
  const plantId = Number(formData.get("plant_id"));
  const cm = num(formData, "hauteur_cm");
  if (cm !== null && cm > 0 && get("SELECT 1 FROM plant WHERE id = ?", plantId)) {
    run(
      "INSERT INTO plant_hauteur (plant_id, date, hauteur_cm, commentaire) VALUES (?, ?, ?, ?)",
      plantId,
      s(formData, "date") || new Date().toISOString().slice(0, 10),
      cm,
      nul(s(formData, "commentaire")),
    );
    syncPlantNow(plantId);
  }
  redirect(`/plants/${plantId}?tab=hauteur`);
}

export async function deleteHauteur(formData: FormData) {
  await requireUser();
  const plantId = Number(formData.get("plant_id"));
  run("DELETE FROM plant_hauteur WHERE id = ? AND plant_id = ?", Number(formData.get("id")), plantId);
  syncPlantNow(plantId);
  redirect(`/plants/${plantId}?tab=hauteur`);
}

export async function deletePlant(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const photo = get<{ photo: string | null }>("SELECT photo FROM plant WHERE id = ?", id)?.photo;
  run("DELETE FROM plant WHERE id = ?", id);
  deleteUpload(photo);
  removePlantNow(id);
  redirect("/");
}

/** Duplique un plant : toutes ses données, sa photo (copiée) et ses capteurs Zigbee ; journal vide. */
export async function dupliquerPlant(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const src = get<Record<string, string | number | null>>("SELECT * FROM plant WHERE id = ?", id);
  if (!src) redirect("/");
  const cols = Object.keys(src).filter((c) => c !== "id" && c !== "created_at");
  const vals = cols.map((c) => (c === "nom" ? `${src.nom} (copie)` : src[c]));
  const r = run(`INSERT INTO plant (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...vals);
  const newId = Number(r.lastInsertRowid);
  // Photo téléversée : copie du fichier, pour que supprimer l'un des plants n'efface pas la photo de l'autre
  const photo = typeof src.photo === "string" ? src.photo : null;
  if (photo?.startsWith("/uploads/")) run("UPDATE plant SET photo = ? WHERE id = ?", copyUpload(photo, newId), newId);
  run(
    "INSERT INTO plant_capteur (plant_id, capteur_id, metrique, champ) SELECT ?, capteur_id, metrique, champ FROM plant_capteur WHERE plant_id = ?",
    newId,
    id,
  );
  syncPlantNow(newId);
  redirect(`/plants/${newId}/edit`);
}

export async function addEvenement(formData: FormData) {
  await requireUser();
  const plantId = Number(formData.get("plant_id"));
  const type = s(formData, "type") || "note";
  const date = s(formData, "date") || new Date().toISOString().slice(0, 10);
  run(
    "INSERT INTO evenement (plant_id, type, date, commentaire) VALUES (?, ?, ?, ?)",
    plantId,
    type,
    date,
    nul(s(formData, "commentaire")),
  );
  syncPlantNow(plantId);
  redirect(`/plants/${plantId}?tab=journal`);
}

/** Action rapide depuis l'accueil : note un arrosage aujourd'hui et rafraîchit la page. */
/** Affecte (ou réaffecte) un plant à un carré, sans passer par le formulaire complet. */
export async function affecterPlant(formData: FormData) {
  await requireUser();
  const plantId = Number(formData.get("plant_id"));
  const carreId = Number(formData.get("carre_id")) || null;
  run("UPDATE plant SET carre_id = ? WHERE id = ?", carreId, plantId);
  syncPlantNow(plantId);
  revalidatePath("/", "layout");
}

export async function arroser(formData: FormData) {
  await requireUser();
  const plantId = Number(formData.get("plant_id"));
  run("INSERT INTO evenement (plant_id, type, date) VALUES (?, 'arrosage', ?)", plantId, new Date().toISOString().slice(0, 10));
  syncPlantNow(plantId);
  revalidatePath("/");
}
