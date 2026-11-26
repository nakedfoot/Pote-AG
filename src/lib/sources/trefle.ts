import { cycleFr, lumiereFr, moisDepuisNoms, parseMois, partiesFr, toxiciteFr } from "../botanique";
import { getSourcesSettings } from "../settings";
import { cached, getJson, meilleur, SourceError } from "./http";
import type { Provider } from "./types";

const BASE = process.env.TREFLE_BASE_URL ?? "https://trefle.io/api/v1";
const LABEL = "Trefle";

type Mesure = { cm?: number | null; deg_c?: number | null } | null | undefined;
type Species = {
  scientific_name?: string; common_name?: string | null; image_url?: string | null;
  duration?: string[] | null; edible_part?: string[] | null; edible?: boolean | null;
  specifications?: { toxicity?: string | null; average_height?: Mesure; maximum_height?: Mesure } | null;
  growth?: {
    days_to_harvest?: number | null; ph_minimum?: number | null; ph_maximum?: number | null; light?: number | null;
    growth_months?: string[] | null; bloom_months?: string[] | null; fruit_months?: string[] | null;
    row_spacing?: Mesure; spread?: Mesure; minimum_temperature?: Mesure; maximum_temperature?: Mesure;
  } | null;
};

const token = () => {
  const t = getSourcesSettings().trefleToken;
  if (!t) throw new SourceError("Trefle : jeton non configuré.", 400);
  return encodeURIComponent(t);
};

export async function testTrefle(t: string) {
  await getJson(`${BASE}/plants?token=${encodeURIComponent(t)}&page_size=1`, LABEL);
}

export const trefle: Provider = {
  id: "trefle",
  configured: () => getSourcesSettings().trefleToken !== "",
  async fetch(sci, id, force) {
    let plantId = id;
    if (!plantId) {
      const s = await cached(`trefle:search:${sci.toLowerCase()}`, force, () =>
        getJson<{ data?: { id: number; scientific_name: string }[] }>(`${BASE}/plants/search?token=${token()}&q=${encodeURIComponent(sci)}`, LABEL),
      );
      const m = meilleur(s.data ?? [], (x) => x.scientific_name, sci);
      if (!m) return null;
      plantId = String(m.id);
    }
    let r: { data?: Species & { main_species?: Species } };
    try {
      r = await cached(`trefle:plant:${plantId}`, force, () => getJson(`${BASE}/plants/${encodeURIComponent(plantId)}?token=${token()}`, LABEL));
    } catch (e) {
      if (e instanceof SourceError && e.status === 404) return null;
      throw e;
    }
    const sp: Species = r.data?.main_species ?? r.data ?? {};
    const g = sp.growth ?? {};
    const spec = sp.specifications ?? {};
    // Dormance déduite : mois hors de la période de croissance (si celle-ci est partielle).
    const croissance = moisDepuisNoms(g.growth_months);
    const dormance = croissance.length > 0 && croissance.length < 12 ? parseMois([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !croissance.includes(m))) : [];
    return {
      id: plantId,
      fiche: {
        nom_scientifique: sp.scientific_name,
        nom_commun: sp.common_name,
        photo: sp.image_url,
        mois_floraison: moisDepuisNoms(g.bloom_months),
        mois_fructification: moisDepuisNoms(g.fruit_months),
        mois_dormance: dormance,
        jours_recolte: g.days_to_harvest,
        ph_min: g.ph_minimum,
        ph_max: g.ph_maximum,
        temp_min: g.minimum_temperature?.deg_c,
        temp_max: g.maximum_temperature?.deg_c,
        espacement_cm: g.row_spacing?.cm ?? g.spread?.cm,
        hauteur_cm: spec.average_height?.cm ?? spec.maximum_height?.cm,
        exposition: lumiereFr(g.light),
        cycle: cycleFr(sp.duration?.[0]),
        comestible: partiesFr(sp.edible_part) ?? (sp.edible === false ? "Non comestible" : null),
        toxicite: toxiciteFr(spec.toxicity),
      },
    };
  },
};
