import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

// Import différé : si le module natif est indisponible, seules les fonctions d'image échouent (pas tout le serveur).
const loadSharp = async () => (await import("sharp")).default;

export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const UPLOAD_NAME = /^[a-z0-9][a-z0-9._-]{0,80}\.jpg$/i;

/** Enregistre une photo envoyée : orientation corrigée, 1280 px max, JPEG. Retourne le chemin public. */
export async function saveUpload(file: File, plantId: number): Promise<string> {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const sharp = await loadSharp();
  const buf = Buffer.from(await file.arrayBuffer());
  const out = await sharp(buf).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const name = `plant-${plantId}-${Date.now()}.jpg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), out);
  return `/uploads/${name}`;
}

// ---------- Plan du jardin (image de fond de la vue potager) ----------
export const PLAN_FILE = path.join(DATA_DIR, "plan.jpg");

/** Enregistre l'image du plan (orientation corrigée, 2400 px max). */
export async function savePlanImage(file: File) {
  const sharp = await loadSharp();
  const buf = Buffer.from(await file.arrayBuffer());
  const out = await sharp(buf).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PLAN_FILE, out);
}

/** Date de dernière modification du plan (sert à invalider le cache navigateur), ou null s'il n'y a pas de plan. */
export function planVersion(): number | null {
  try {
    return Math.round(fs.statSync(PLAN_FILE).mtimeMs);
  } catch {
    return null;
  }
}

export function deletePlanImage() {
  fs.rmSync(PLAN_FILE, { force: true });
}

export function deleteUpload(photo: string | null | undefined) {
  if (!photo?.startsWith("/uploads/")) return;
  const name = photo.slice("/uploads/".length);
  if (!UPLOAD_NAME.test(name)) return;
  fs.rmSync(path.join(UPLOAD_DIR, name), { force: true });
}

/** Copie une photo téléversée pour un autre plant ; retourne le nouveau chemin (ou null si la source est absente). */
export function copyUpload(photo: string, plantId: number): string | null {
  const name = photo.slice("/uploads/".length);
  if (!UPLOAD_NAME.test(name)) return null;
  const dest = `plant-${plantId}-${Date.now()}.jpg`;
  try {
    fs.copyFileSync(path.join(UPLOAD_DIR, name), path.join(UPLOAD_DIR, dest));
    return `/uploads/${dest}`;
  } catch {
    return null;
  }
}

async function loadBytes(photo: string): Promise<Buffer | null> {
  try {
    if (photo.startsWith("/uploads/")) {
      const name = photo.slice("/uploads/".length);
      return UPLOAD_NAME.test(name) ? fs.readFileSync(path.join(UPLOAD_DIR, name)) : null;
    }
    if (/^https?:\/\//.test(photo)) {
      const res = await fetch(photo, { signal: AbortSignal.timeout(10_000) });
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    }
  } catch {
    /* image indisponible */
  }
  return null;
}

const cache = new Map<string, string | null>();

/** Miniature JPEG en base64 tenant sous `maxKb` Ko (réduit qualité puis dimensions). */
export async function thumbnailBase64(photo: string, maxKb: number): Promise<string | null> {
  const key = `${photo}|${maxKb}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const src = await loadBytes(photo);
  let result: string | null = null;
  if (src) try {
    const sharp = await loadSharp();
    // La taille base64 est ~4/3 de la taille binaire : on vise maxKb en base64.
    const maxBytes = (maxKb * 1024 * 3) / 4;
    for (const size of [320, 240, 180, 128, 96, 64]) {
      for (const quality of [75, 55, 35]) {
        const out = await sharp(src).rotate().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
        if (out.length <= maxBytes) {
          result = out.toString("base64");
          break;
        }
      }
      if (result) break;
    }
  } catch (e) {
    console.error("[potager] miniature impossible :", (e as Error).message);
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, result);
  return result;
}
