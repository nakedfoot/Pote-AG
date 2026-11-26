import { parseMois } from "../botanique";
import { getSourcesSettings } from "../settings";
import { cached, getJson, meilleur, sansHtml, SourceError } from "./http";
import type { Provider } from "./types";

const BASE = process.env.INAT_BASE_URL ?? "https://api.inaturalist.org/v1";
const LABEL = "iNaturalist";
const PLANTAE = 47126; // taxon racine du règne végétal
const EUROPE = 97391; // repli si trop peu d'observations dans le lieu choisi
// Annotation « Phénologie de la plante » : 13 = en fleurs, 14 = fruits ou graines.
const PHENO_TERM = 12;
const FLORAISON = 13;
const FRUCTIFICATION = 14;
const MIN_OBS = 15; // en dessous, le profil mensuel n'est pas significatif
const SEUIL = 0.3; // un mois est retenu s'il atteint 30 % du mois le plus observé

// iNaturalist demande de rester sous ~1 requête/seconde.
const g = globalThis as unknown as { __inatLast?: number };
async function inat<T>(path: string): Promise<T> {
  const wait = (g.__inatLast ?? 0) + 1000 - Date.now();
  g.__inatLast = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return getJson<T>(`${BASE}${path}`, LABEL);
}

export type InatTaxon = {
  id: number; name: string; rank: string; preferred_common_name?: string;
  wikipedia_summary?: string | null; default_photo?: { square_url?: string; medium_url?: string } | null;
};

/** Recherche (noms français acceptés) limitée aux plantes. */
export async function searchInat(q: string, force = false): Promise<InatTaxon[]> {
  const r = await cached(`inat:search:${q.toLowerCase()}`, force, () =>
    inat<{ results?: InatTaxon[] }>(`/taxa?q=${encodeURIComponent(q)}&taxon_id=${PLANTAE}&is_active=true&locale=fr&per_page=10`),
  );
  return r.results ?? [];
}

const RANGS_ESPECE = new Set(["species", "subspecies", "variety", "form", "hybrid"]);

/** Nom commun (« tomate ») -> nom scientifique de l'espèce la plus probable, ou null. */
export async function resoudreNom(nom: string): Promise<{ sci: string; id: string } | null> {
  const t = (await searchInat(nom)).find((x) => RANGS_ESPECE.has(x.rank));
  return t ? { sci: t.name, id: String(t.id) } : null;
}

async function phenologie(taxonId: string, valeur: number, force: boolean): Promise<number[]> {
  const place = getSourcesSettings().inatPlaceId;
  const lieux = [...new Set([place, EUROPE].filter((x): x is number => typeof x === "number" && x > 0))];
  for (const lieu of lieux) {
    const r = await cached(`inat:pheno:${taxonId}:${valeur}:${lieu}`, force, () =>
      inat<{ results?: { month_of_year?: Record<string, number> } }>(
        `/observations/histogram?taxon_id=${taxonId}&place_id=${lieu}&date_field=observed&interval=month_of_year&term_id=${PHENO_TERM}&term_value_id=${valeur}`,
      ),
    );
    const counts = Object.entries(r.results?.month_of_year ?? {}).map(([m, c]) => [Number(m), Number(c) || 0] as const);
    const total = counts.reduce((a, [, c]) => a + c, 0);
    if (total < MIN_OBS) continue;
    const max = Math.max(...counts.map(([, c]) => c));
    return parseMois(counts.filter(([, c]) => c >= max * SEUIL).map(([m]) => m));
  }
  return [];
}

export const inaturalist: Provider = {
  id: "inaturalist",
  configured: () => true,
  async fetch(sci, id, force) {
    let taxonId = id;
    if (!taxonId) {
      const m = meilleur(await searchInat(sci, force), (t) => t.name, sci);
      if (!m) return null;
      taxonId = String(m.id);
    }
    let t: InatTaxon | undefined;
    try {
      t = (await cached(`inat:taxon:${taxonId}`, force, () => inat<{ results?: InatTaxon[] }>(`/taxa/${taxonId}?locale=fr`))).results?.[0];
    } catch (e) {
      if (e instanceof SourceError && e.status === 404) return null;
      throw e;
    }
    if (!t) return null;
    return {
      id: taxonId,
      fiche: {
        nom_scientifique: t.name,
        nom_commun: t.preferred_common_name,
        photo: t.default_photo?.medium_url,
        description: sansHtml(t.wikipedia_summary),
        mois_floraison: await phenologie(taxonId, FLORAISON, force),
        mois_fructification: await phenologie(taxonId, FRUCTIFICATION, force),
      },
    };
  },
};
