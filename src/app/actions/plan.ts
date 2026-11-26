"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { syncPlantNow } from "@/lib/mqtt-service";
import { deletePlanImage, savePlanImage } from "@/lib/image";
import type { ActionResult } from "./settings";

type Entry = { type: "zone" | "carre"; id: number; rect: { x: number; y: number; w: number; h: number } | null; rot?: number };

const clamp = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0));

/** Enregistre la position (fractions 0..1 de l'image) des zones et carrés sur le plan. */
export async function savePlan(json: string): Promise<ActionResult> {
  await requireUser();
  let entries: Entry[];
  try {
    entries = JSON.parse(json);
    if (!Array.isArray(entries)) throw new Error();
  } catch {
    return { ok: false, message: "Données invalides." };
  }
  for (const e of entries) {
    const table = e.type === "zone" ? "zone" : e.type === "carre" ? "carre" : null;
    const id = Number(e.id);
    if (!table || !id) continue;
    if (e.rect) {
      const x = clamp(e.rect.x), y = clamp(e.rect.y);
      const w = Math.min(clamp(e.rect.w), 1 - x), h = Math.min(clamp(e.rect.h), 1 - y);
      run(`UPDATE ${table} SET plan_x = ?, plan_y = ?, plan_w = ?, plan_h = ? WHERE id = ?`, x, y, w, h, id);
      if (table === "carre") run("UPDATE carre SET plan_rot = ? WHERE id = ?", e.rot ? 1 : 0, id);
    } else {
      run(`UPDATE ${table} SET plan_x = NULL, plan_y = NULL, plan_w = NULL, plan_h = NULL WHERE id = ?`, id);
    }
  }
  revalidatePath("/vue-potager");
  return { ok: true, message: "Plan enregistré." };
}

/**
 * Place un plant sur un carré ou le retire (carreId null). x, y : centre de sa zone de plantation et w, h : taille de
 * cette zone, en fractions 0..1 de la terre ; w et h null = taille par défaut (selon le nombre d'unités).
 */
export async function placerPlant(
  plantId: number, carreId: number | null, x: number, y: number, w: number | null = null, h: number | null = null,
): Promise<ActionResult> {
  await requireUser();
  const id = Number(plantId);
  const plant = get<{ carre_id: number | null }>("SELECT carre_id FROM plant WHERE id = ?", id);
  if (!plant) return { ok: false, message: "Plant introuvable." };
  if (carreId === null) {
    run("UPDATE plant SET carre_id = NULL, plan_x = NULL, plan_y = NULL, plan_w = NULL, plan_h = NULL WHERE id = ?", id);
  } else {
    if (!get("SELECT id FROM carre WHERE id = ?", Number(carreId))) return { ok: false, message: "Carré introuvable." };
    const taille = (v: number | null) => (v === null ? null : Math.min(1, Math.max(0.03, Number(v) || 0.03)));
    run("UPDATE plant SET carre_id = ?, plan_x = ?, plan_y = ?, plan_w = ?, plan_h = ? WHERE id = ?", Number(carreId), clamp(x), clamp(y), taille(w), taille(h), id);
  }
  if (plant.carre_id !== carreId) syncPlantNow(id); // zone et carré font partie du message publié
  return { ok: true, message: "Enregistré." };
}

/** Largeur réelle (en cm) représentée par l'image du plan : sert à placer les carrés à l'échelle. */
export async function savePlanEchelle(cm: number): Promise<ActionResult> {
  await requireUser();
  const v = Number(cm);
  if (!Number.isFinite(v) || v < 50 || v > 1_000_000) return { ok: false, message: "Largeur invalide (entre 0,5 m et 10 km)." };
  run("INSERT INTO settings (cle, valeur) VALUES ('plan_longueur_cm', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur", String(v));
  revalidatePath("/vue-potager");
  return { ok: true, message: "Échelle enregistrée." };
}

export async function uploadPlan(formData: FormData) {
  await requireUser();
  const file = formData.get("plan");
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("image/")) redirect("/vue-potager?erreur=image");
  try {
    await savePlanImage(file);
  } catch {
    redirect("/vue-potager?erreur=image");
  }
  revalidatePath("/vue-potager");
  redirect("/vue-potager?vue=plan");
}

export async function supprimerPlan() {
  await requireUser();
  deletePlanImage();
  revalidatePath("/vue-potager");
}
