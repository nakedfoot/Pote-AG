/**
 * Données botaniques d'un plant (calendrier, caractéristiques, seuils) et sources qui les fournissent.
 * Module partagé client/serveur : aucune dépendance serveur ici.
 */

export const PROVIDERS = {
  openplantbook: "OpenPlantbook",
  trefle: "Trefle",
  inaturalist: "iNaturalist",
  perenual: "Perenual",
} as const;
export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export const DEFAULT_ORDER: ProviderId[] = ["openplantbook", "trefle", "inaturalist", "perenual"];

// ---------- Calendrier ----------
export const PERIODES = {
  plantation: { label: "Plantation", icone: "🌱", col: "mois_plantation" },
  floraison: { label: "Floraison", icone: "🌸", col: "mois_floraison" },
  fructification: { label: "Fructification", icone: "🍅", col: "mois_fructification" },
  recolte: { label: "Récolte", icone: "🧺", col: "mois_recolte" },
  taille: { label: "Taille", icone: "✂️", col: "mois_taille" },
  dormance: { label: "Dormance", icone: "💤", col: "mois_dormance" },
} as const;
export type PeriodeKey = keyof typeof PERIODES;
export const PERIODE_KEYS = Object.keys(PERIODES) as PeriodeKey[];
export const MOIS_COLS = PERIODE_KEYS.map((k) => PERIODES[k].col);

export const MOIS_INITIALES = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
export const MOIS_NOMS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** "3,4,5" <-> [3,4,5] (mois 1 à 12, triés, sans doublon). */
export function parseMois(v: string | number[] | null | undefined): number[] {
  const arr = Array.isArray(v) ? v : String(v ?? "").split(",").map((x) => Number(x.trim()));
  return [...new Set(arr.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);
}
export const formatMois = (m: number[]) => parseMois(m).join(",");

/** Plage lisible : [6,7,8] -> « juin – août », [11,12,1] -> « novembre – janvier ». */
export function libelleMois(v: string | number[] | null | undefined): string {
  const m = parseMois(v);
  if (m.length === 0) return "—";
  if (m.length === 12) return "toute l'année";
  // Découpe en plages consécutives (en tenant compte du passage décembre -> janvier)
  const set = new Set(m);
  const debuts = m.filter((x) => !set.has(x === 1 ? 12 : x - 1));
  return debuts
    .map((d) => {
      let f = d;
      while (set.has(f === 12 ? 1 : f + 1) && (f === 12 ? 1 : f + 1) !== d) f = f === 12 ? 1 : f + 1;
      return f === d ? MOIS_NOMS[d - 1] : `${MOIS_NOMS[d - 1]} – ${MOIS_NOMS[f - 1]}`;
    })
    .join(", ");
}

// ---------- Caractéristiques ----------
export const CARACS = {
  cycle: { label: "Cycle", type: "text" },
  exposition: { label: "Exposition", type: "text" },
  arrosage: { label: "Arrosage", type: "text" },
  rusticite: { label: "Rusticité (zones USDA)", type: "text" },
  ph_min: { label: "pH min", type: "number" },
  ph_max: { label: "pH max", type: "number" },
  hauteur_cm: { label: "Hauteur (cm)", type: "number" },
  espacement_cm: { label: "Espacement (cm)", type: "number" },
  jours_recolte: { label: "Jours avant récolte", type: "number" },
  comestible: { label: "Parties comestibles", type: "text" },
  toxicite: { label: "Toxicité", type: "text" },
  description: { label: "Description", type: "textarea" },
} as const;
export type CaracKey = keyof typeof CARACS;
export const CARAC_KEYS = Object.keys(CARACS) as CaracKey[];

export const SEUIL_COLS = [
  "temp_min", "temp_max", "hum_air_min", "hum_air_max", "hum_sol_min", "hum_sol_max",
  "ec_min", "ec_max", "lux_min", "lux_max",
] as const;

/** Tous les champs d'un plant pouvant être complétés par les sources (= colonnes de la table plant). */
export const FIELD_KEYS = ["nom_scientifique", ...MOIS_COLS, ...CARAC_KEYS, ...SEUIL_COLS] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export const NUMBER_FIELDS = new Set<string>([...SEUIL_COLS, ...CARAC_KEYS.filter((k) => CARACS[k].type === "number")]);
export const MOIS_FIELDS = new Set<string>(MOIS_COLS);

export const FIELD_LABELS: Record<FieldKey, string> = {
  nom_scientifique: "Nom scientifique",
  ...(Object.fromEntries(PERIODE_KEYS.map((k) => [PERIODES[k].col, `Mois de ${PERIODES[k].label.toLowerCase()}`])) as Record<(typeof MOIS_COLS)[number], string>),
  ...(Object.fromEntries(CARAC_KEYS.map((k) => [k, CARACS[k].label])) as Record<CaracKey, string>),
  temp_min: "Température min", temp_max: "Température max",
  hum_air_min: "Humidité de l'air min", hum_air_max: "Humidité de l'air max",
  hum_sol_min: "Humidité du sol min", hum_sol_max: "Humidité du sol max",
  ec_min: "Conductivité min", ec_max: "Conductivité max",
  lux_min: "Luminosité min", lux_max: "Luminosité max",
};

/** Valeur renvoyée par une source : nombres, textes ou liste de mois. */
export type Valeur = string | number | number[] | null | undefined;
/** Fiche normalisée produite par une source (champs du plant + quelques informations annexes). */
export type Fiche = Partial<Record<FieldKey | "photo" | "nom_commun", Valeur>>;

export function estVide(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return !Number.isFinite(v);
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Valeur de fiche -> texte de formulaire / colonne. */
export function versTexte(k: string, v: Valeur): string {
  if (estVide(v)) return "";
  if (MOIS_FIELDS.has(k)) return formatMois(Array.isArray(v) ? v : parseMois(String(v)));
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  return String(v).trim();
}

/** Provenance des données d'un plant (stockée en JSON dans plant.sources_data). */
export type SourcesData = {
  champs: Partial<Record<FieldKey, ProviderId>>;
  ids: Partial<Record<ProviderId, string>>;
  verifie?: string; // dernière interrogation des sources (ISO)
};

export function parseSourcesData(v: string | null | undefined): SourcesData {
  try {
    const o = JSON.parse(v ?? "") as Partial<SourcesData>;
    const champs = Object.fromEntries(
      Object.entries(o.champs ?? {}).filter(([k, p]) => (FIELD_KEYS as readonly string[]).includes(k) && p in PROVIDERS),
    ) as SourcesData["champs"];
    const ids = Object.fromEntries(
      Object.entries(o.ids ?? {}).filter(([p, id]) => p in PROVIDERS && typeof id === "string" && id !== ""),
    ) as SourcesData["ids"];
    return { champs, ids, ...(typeof o.verifie === "string" ? { verifie: o.verifie } : {}) };
  } catch {
    return { champs: {}, ids: {} };
  }
}

// ---------- Traductions des valeurs renvoyées par les API (en anglais) ----------
const lower = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");

export function cycleFr(v: unknown): string | null {
  const s = lower(v);
  if (!s) return null;
  if (s.includes("bienn") || s.includes("biann")) return "Bisannuelle";
  if (s.includes("annual")) return "Annuelle";
  if (s.includes("perennial")) return "Vivace";
  return String(v);
}

export function arrosageFr(v: unknown): string | null {
  const s = lower(v);
  return ({ frequent: "Fréquent", average: "Moyen", minimum: "Faible", none: "Aucun" } as Record<string, string>)[s] ?? (s ? String(v) : null);
}

export function expositionFr(v: unknown): string | null {
  const items = (Array.isArray(v) ? v : [v]).map(lower).filter(Boolean);
  const out = new Set<string>();
  for (const s of items) {
    if (s.includes("full sun")) out.add("Plein soleil");
    else if (s.includes("full shade") || s === "deep shade") out.add("Ombre");
    else if (s.includes("part") || s.includes("filtered")) out.add("Mi-ombre");
  }
  return out.size ? [...out].join(", ") : null;
}

/** Échelle de lumière Trefle (0 = ombre totale, 10 = plein soleil). */
export function lumiereFr(v: unknown): string | null {
  if (typeof v !== "number") return null;
  return v <= 3 ? "Ombre" : v <= 6 ? "Mi-ombre" : "Plein soleil";
}

const PARTIES: Record<string, string> = {
  fruits: "fruits", fruit: "fruits", leaves: "feuilles", leaf: "feuilles", roots: "racines", root: "racines",
  seeds: "graines", seed: "graines", flowers: "fleurs", flower: "fleurs", stem: "tiges", stems: "tiges",
  tubers: "tubercules", tuber: "tubercules", bulbs: "bulbes", bulb: "bulbes", shoots: "pousses",
};
export const partiesFr = (v: unknown): string | null => {
  const arr = (Array.isArray(v) ? v : []).map(lower).filter(Boolean);
  return arr.length ? [...new Set(arr.map((p) => PARTIES[p] ?? p))].join(", ") : null;
};

export function toxiciteFr(v: unknown): string | null {
  const s = lower(v);
  return ({ none: "Non toxique", low: "Faible", medium: "Moyenne", high: "Élevée" } as Record<string, string>)[s] ?? null;
}

const MOIS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** ["jan","March",...] -> [1,3,...] */
export function moisDepuisNoms(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return parseMois(v.map((x) => MOIS_EN.indexOf(lower(x).slice(0, 3)) + 1));
}

/** Saison(s) en anglais -> mois (hémisphère nord). Ex. « Late Summer » -> [8], « Spring » -> [3,4,5]. */
export function moisDepuisSaison(v: unknown): number[] {
  const s = lower(v);
  if (!s) return [];
  const SAISONS: [string[], number[]][] = [
    [["spring"], [3, 4, 5]],
    [["summer"], [6, 7, 8]],
    [["fall", "autumn"], [9, 10, 11]],
    [["winter"], [12, 1, 2]],
  ];
  const out: number[] = [];
  for (const part of s.split(/[,/&]| and /)) {
    for (const [mots, mois] of SAISONS) {
      if (!mots.some((m) => part.includes(m))) continue;
      if (part.includes("early")) out.push(mois[0]);
      else if (part.includes("late")) out.push(mois[2]);
      else if (part.includes("mid")) out.push(mois[1]);
      else out.push(...mois);
    }
  }
  return parseMois(out);
}

/** Périodes du calendrier en cours pour un mois donné (1-12). */
export function periodesDuMois(p: Partial<Record<string, unknown>>, mois: number): PeriodeKey[] {
  return PERIODE_KEYS.filter((k) => parseMois(p[PERIODES[k].col] as string | null).includes(mois));
}
