"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { deletePlanImage, savePlanImage } from "@/lib/image";
import type { ActionResult } from "./settings";

type Entry = { type: "zone" | "carre"; id: number; rect: { x: number; y: number; w: number; h: number } | null };

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
    } else {
      run(`UPDATE ${table} SET plan_x = NULL, plan_y = NULL, plan_w = NULL, plan_h = NULL WHERE id = ?`, id);
    }
  }
  revalidatePath("/vue-potager");
  return { ok: true, message: "Plan enregistré." };
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
  redirect("/vue-potager");
}

export async function supprimerPlan() {
  await requireUser();
  deletePlanImage();
  revalidatePath("/vue-potager");
}
