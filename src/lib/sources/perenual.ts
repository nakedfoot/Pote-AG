import { arrosageFr, cycleFr, expositionFr, moisDepuisNoms, moisDepuisSaison } from "../botanique";
import { getSourcesSettings } from "../settings";
import { cached, getJson, meilleur, SourceError } from "./http";
import type { Provider } from "./types";

const BASE = process.env.PERENUAL_BASE_URL ?? "https://perenual.com/api/v2";
const LABEL = "Perenual";

type Dimension = { type?: string; min_value?: number; max_value?: number; unit?: string };
type Detail = {
  common_name?: string; scientific_name?: string[]; cycle?: string; watering?: string; sunlight?: string[];
  pruning_month?: string[]; hardiness?: { min?: string; max?: string } | null;
  flowering_season?: string | null; fruiting_season?: string | null; harvest_season?: string | null;
  dimensions?: Dimension | Dimension[] | null; edible_fruit?: boolean | number; edible_leaf?: boolean | number;
  poisonous_to_humans?: boolean | number; poisonous_to_pets?: boolean | number; description?: string | null;
  default_image?: { medium_url?: string; regular_url?: string } | null;
};

const key = () => {
  const k = getSourcesSettings().perenualKey;
  if (!k) throw new SourceError("Perenual : clé non configurée.", 400);
  return encodeURIComponent(k);
};

export async function testPerenual(k: string) {
  await getJson(`${BASE}/species-list?key=${encodeURIComponent(k)}&q=tomato`, LABEL);
}

/** L'offre gratuite remplace certaines valeurs par « Upgrade Plans To Premium… » : on les ignore. */
const PAYANT = /upgrade|premium|subscription/i;
function propre<T>(v: T): T | null {
  if (typeof v === "string" && PAYANT.test(v)) return null;
  if (Array.isArray(v) && v.some((x) => typeof x === "string" && PAYANT.test(x))) return null;
  return v;
}

const VERS_CM: Record<string, number> = { feet: 30.48, foot: 30.48, ft: 30.48, inches: 2.54, inch: 2.54, in: 2.54, cm: 1, m: 100, meters: 100 };
function hauteurCm(d: Detail["dimensions"]): number | null {
  const list = Array.isArray(d) ? d : d ? [d] : [];
  const h = list.find((x) => /height/i.test(x.type ?? "")) ?? list[0];
  const f = VERS_CM[(h?.unit ?? "").toLowerCase()];
  const v = h?.max_value ?? h?.min_value;
  return f && typeof v === "number" && v > 0 ? Math.round(v * f) : null;
}

const oui = (v: unknown) => v === true || v === 1;
const connu = (v: unknown) => typeof v === "boolean" || v === 0 || v === 1;

function toxicite(humains: unknown, animaux: unknown): string | null {
  if (!connu(humains) && !connu(animaux)) return null;
  if (oui(humains)) return oui(animaux) ? "Toxique (humains et animaux)" : "Toxique pour l'humain";
  return oui(animaux) ? "Toxique pour les animaux" : "Non toxique";
}

export const perenual: Provider = {
  id: "perenual",
  configured: () => getSourcesSettings().perenualKey !== "",
  async fetch(sci, id, force) {
    let speciesId = id;
    if (!speciesId) {
      const s = await cached(`perenual:search:${sci.toLowerCase()}`, force, () =>
        getJson<{ data?: { id: number; scientific_name?: string[] }[] }>(`${BASE}/species-list?key=${key()}&q=${encodeURIComponent(sci)}`, LABEL),
      );
      const m = meilleur(s.data ?? [], (x) => x.scientific_name?.[0], sci);
      if (!m) return null;
      speciesId = String(m.id);
    }
    let d: Detail;
    try {
      d = await cached(`perenual:detail:${speciesId}`, force, () => getJson<Detail>(`${BASE}/species/details/${encodeURIComponent(speciesId)}?key=${key()}`, LABEL));
    } catch (e) {
      if (e instanceof SourceError && e.status === 404) return null;
      throw e;
    }
    const hardiness = propre(d.hardiness);
    const parties = [oui(propre(d.edible_fruit)) && "fruits", oui(propre(d.edible_leaf)) && "feuilles"].filter(Boolean);
    return {
      id: speciesId,
      fiche: {
        nom_scientifique: propre(d.scientific_name?.[0]),
        nom_commun: propre(d.common_name),
        photo: propre(d.default_image?.medium_url ?? d.default_image?.regular_url ?? null),
        mois_floraison: moisDepuisSaison(propre(d.flowering_season)),
        mois_fructification: moisDepuisSaison(propre(d.fruiting_season)),
        mois_recolte: moisDepuisSaison(propre(d.harvest_season)),
        mois_taille: moisDepuisNoms(propre(d.pruning_month)),
        cycle: cycleFr(propre(d.cycle)),
        arrosage: arrosageFr(propre(d.watering)),
        exposition: expositionFr(propre(d.sunlight)),
        rusticite: hardiness?.min ? (hardiness.max && hardiness.max !== hardiness.min ? `${hardiness.min}–${hardiness.max}` : hardiness.min) : null,
        hauteur_cm: hauteurCm(propre(d.dimensions)),
        comestible: parties.length ? parties.join(", ") : null,
        toxicite: toxicite(propre(d.poisonous_to_humans), propre(d.poisonous_to_pets)),
        description: propre(d.description),
      },
    };
  },
};
