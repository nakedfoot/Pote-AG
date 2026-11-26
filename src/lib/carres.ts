/** Pieds optionnels aux quatre coins : section carrée et hauteur, en cm. */
export const PIED_SECTION_CM = 7;
export const PIED_HAUTEUR_CM = 20;
/** Dimensions supposées d'un carré dont la longueur ou la largeur n'est pas renseignée (cm). */
export const DEFAUT_CARRE_CM = 120;
/** Épaisseur des planches du cadre, en cm. */
export const EPAISSEUR_CM = 2.1;

const fmt = (n: number) => String(Number(n.toFixed(1))).replace(".", ",");

/** « 120 × 80 × 30 cm » (les dimensions absentes sont ignorées) ; null si aucune. */
export function formatDimensions(longueur: number | null, largeur: number | null, hauteur: number | null): string | null {
  const parts = [longueur, largeur, hauteur].filter((v): v is number => v !== null).map(fmt);
  return parts.length ? `${parts.join(" × ")} cm` : null;
}

/** Surface au sol en m². */
export function surfaceM2(longueur: number | null, largeur: number | null): number | null {
  return longueur !== null && largeur !== null ? (longueur * largeur) / 10_000 : null;
}

/**
 * Reprend l'ancienne saisie libre (« 1.2×1.2 m », « 120x80 cm », « 2 x 1 ») pour préremplir longueur et largeur.
 * Sans unité, un nombre inférieur à 10 est compris en mètres.
 */
export function parseAncienneDimension(txt: string | null): { longueur: number; largeur: number } | null {
  if (!txt) return null;
  const m = txt.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(?:cm|m)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(cm|m)?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const enMetres = m[3] === "m" || (!m[3] && Math.max(a, b) < 10);
  const k = enMetres ? 100 : 1;
  return { longueur: Math.round(a * k), largeur: Math.round(b * k) };
}

// ---------- Plants représentés dans le carré ----------

/** Forme de la plante, pour son dessin dans le carré. */
export const TYPES_PLANTE = {
  herbacee: "Légume, aromatique, herbacée",
  fleur: "Fleur",
  arbuste: "Arbuste",
  arbre: "Arbre",
  grimpante: "Grimpante",
  fraisier: "Fraisier",
} as const;
export type TypePlante = keyof typeof TYPES_PLANTE;
export const estTypePlante = (v: unknown): v is TypePlante => typeof v === "string" && v in TYPES_PLANTE;

/** Hauteur dessinée quand le plant n'a aucune hauteur mesurée. */
export const HAUTEUR_DEFAUT_CM = 15;

/** Plant tel que dessiné dans un carré : position (fractions 0..1 de la terre, y = 0 au fond), forme, hauteur en cm. */
export type PlantDessin = {
  id: number; nom: string; x: number; y: number; type: TypePlante; hauteur: number; espacement: number | null;
  /** Couleur des fruits à dessiner (arbres et arbustes fruitiers), sinon null */
  fruit: string | null;
  /** Couleur des petites fleurs (arbres et arbustes non fruitiers qui fleurissent), sinon null */
  fleurs: string | null;
  /** Numéro de l'unité quand la fiche en représente plusieurs (0 sinon) : même id, dessins différents */
  k?: number;
};

const sansAccent = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const MOTS: [TypePlante, RegExp][] = [
  ["fraisier", /fraisier|fraise|fragaria/],
  ["arbre", /pommier|poirier|cerisier|prunier|olivier|figuier|abricotier|pecher|oranger|citronnier|noyer|chene|erable|chataignier|amandier|mirabellier|cognassier|\barbre\b|prunus|malus|pyrus|citrus|ficus|juglans|olea\b|castanea|amygdalus|quercus|fagus|acer\b/],
  ["grimpante", /vigne|clematite|lierre|kiwi|pois de senteur|chevrefeuille|houblon|glycine|jasmin|liseron|grimpant/],
  ["arbuste", /framboisier|groseillier|cassis|cassissier|myrtille|rosier|buis|noisetier|romarin|hortensia|lilas|laurier|forsythia|arbuste|murier|ribes|rubus|vaccinium|rosa\b|corylus|buxus/],
  ["fleur", /\brose\b|tulipe|lavande|tournesol|pivoine|dahlia|oeillet|capucine|souci|bleuet|pensee|\blys\b|iris|geranium|marguerite|narcisse|jonquille|cosmos|zinnia|petunia|primevere|fleur/],
];

/** Forme probable d'après le nom (et le nom scientifique) ; une hauteur adulte d'au moins 4 m évoque un arbre. */
export function devinerType(nom: string, nomScientifique: string | null, hauteurAdulteCm: number | null): TypePlante {
  const t = sansAccent(`${nom} ${nomScientifique ?? ""}`);
  for (const [type, re] of MOTS) if (re.test(t)) return type;
  return hauteurAdulteCm !== null && hauteurAdulteCm >= 400 ? "arbre" : "herbacee";
}

/**
 * Fruitier : les sources botaniques (Perenual, Trefle) indiquent des fruits comestibles, ou bien l'espèce est un
 * fruitier connu d'après son nom ou son nom scientifique (OpenPlantbook ne renseigne pas les parties comestibles).
 */
export function estFruitier(comestible: string | null, nom = "", nomScientifique: string | null = null): boolean {
  if (comestible && /fruit/i.test(sansAccent(comestible))) return true;
  const t = sansAccent(`${nom} ${nomScientifique ?? ""}`);
  if (/laurier/.test(t)) return false; // laurier-cerise, laurier-rose… : pas des fruitiers
  return FRUITS.some(([re]) => re.test(t));
}

const FRUITS: [RegExp, string][] = [
  [/fraise|fraisier|fragaria/, "#d3142b"],
  [/mirabelle/, "#f0c23a"],
  [/pomm|malus/, "#d9362b"],
  [/poir|pyrus/, "#c8cf3a"],
  [/cerise|cerisier|prunus avium|prunus cerasus/, "#a3122a"],
  [/pech|prunus persica|amygdalus persica|nectarine/, "#f4a07a"],
  [/abricot|prunus armeniaca/, "#f2a03d"],
  [/prun|quetsche|prunus domestica|prunus(?! laurocerasus| serrulata| lusitanica)/, "#6b3a8f"],
  [/orang|clementine|mandarine|citrus sinensis|citrus reticulata/, "#f28c1c"],
  [/citron|citrus/, "#f2dc2e"],
  [/\bfig|ficus carica/, "#5b3a6e"],
  [/framboise|rubus idaeus/, "#c2185b"],
  [/groseille|ribes rubrum/, "#d11a2a"],
  [/cassis|ribes nigrum/, "#2b1b3a"],
  [/myrtille|vaccinium/, "#3b4a8a"],
  [/raisin|vigne|vitis/, "#6a3d7d"],
  [/kiwi/, "#8a6a3a"],
  [/noix|noyer|noisett|juglans|corylus/, "#8a6a3a"],
  [/olive|olea europaea/, "#5a6b2a"],
];

/** Couleur des fruits d'après le nom (et le nom scientifique) ; rouge orangé par défaut. */
export function couleurFruit(nom: string, nomScientifique: string | null): string {
  const t = sansAccent(`${nom} ${nomScientifique ?? ""}`);
  return FRUITS.find(([re]) => re.test(t))?.[1] ?? "#e0432f";
}

/**
 * Arbres et arbustes à fleurs bien visibles, avec la couleur de leurs fleurs. Les mois de floraison des sources
 * (surtout iNaturalist) existent pour presque toutes les plantes, même à fleurs insignifiantes (érable, ficus…) :
 * on s'appuie donc sur l'espèce. Pour ajouter une espèce, compléter cette liste (noms sans accent).
 */
const FLEURS_ARBRES: [RegExp, string][] = [
  [/rosier|\brose\b|\brosa\b|chaenomeles|cognassier du japon|pyracantha/, "#e8457a"],
  [/lavande|lavandula|buddleia|buddleja|arbre a papillons|ceanothus|romarin|rosmarinus/, "#8e6bd1"],
  [/hortensia|hydrangea/, "#7aa7e8"],
  [/lilas|syringa|lagerstroemia|paulownia|glycine/, "#b78ad9"],
  [/forsythia|mimosa|genet|cytise|cytisus|spartium|laburnum|mahonia|millepertuis|hypericum/, "#f7d63a"],
  [/magnolia|cerisier du japon|prunus serrulata|spiree|spiraea|weigela|althea|abelia/, "#f4b6c8"],
  [/camelia|camellia|rhododendron|azalee|fuchsia|hibiscus|oleandre|laurier rose|nerium/, "#e0457f"],
  [/jasmin|seringat|philadelphus|sureau|sambucus|aubepine|crataegus|viburnum|deutzia|escallonia|cistus|tilleul|robinier|bruyere|erica|calluna/, "#fbf6ea"],
];

/** Couleur des fleurs d'un arbre ou arbuste à fleurs visibles ; null pour les autres (aucune fleur dessinée). */
export function couleurFleur(nom: string, nomScientifique: string | null): string | null {
  const t = sansAccent(`${nom} ${nomScientifique ?? ""}`);
  return FLEURS_ARBRES.find(([re]) => re.test(t))?.[1] ?? null;
}

/** Nombre maximal d'unités dessinées en vue du dessus et en 3D (au-delà : « +N » ou plafonné). */
export const UNITES_MAX_DESSUS = 60;
export const UNITES_MAX_3D = 36;
/** Taille minimale d'une zone de plantation (fraction de la terre). */
export const ZONE_MIN = 0.06;

/** Colonnes et lignes d'une grille de `n` unités dans une zone de wCm × hCm. */
export function dimsGrille(n: number, wCm: number, hCm: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt((n * wCm) / Math.max(hCm, 1)))));
  return { cols, rows: Math.ceil(n / cols) };
}

/** Positions (fractions 0..1 de la zone) de `n` unités réparties en grille régulière dans une zone de wCm × hCm. */
export function grilleUnites(n: number, wCm: number, hCm: number): { x: number; y: number }[] {
  const { cols, rows } = dimsGrille(n, wCm, hCm);
  return Array.from({ length: n }, (_, i) => ({ x: ((i % cols) + 0.5) / cols, y: (Math.floor(i / cols) + 0.5) / rows }));
}

/**
 * Taille par défaut (fractions 0..1 de la terre) de la zone de plantation d'un plant, d'après son nombre d'unités et
 * son espacement : un plant seul occupe un petit carré, plusieurs unités une grille aux mailles de l'espacement.
 */
export function tailleZoneDefaut(quantite: number, espacement: number | null, solLongCm: number, solLargCm: number): { w: number; h: number } {
  const n = Math.max(1, quantite);
  if (n === 1) {
    const d = Math.min(60, Math.max(15, espacement ?? 30));
    return { w: Math.min(1, d / solLongCm), h: Math.min(1, d / solLargCm) };
  }
  const maille = Math.min(40, Math.max(5, espacement ?? 20));
  const { cols, rows } = dimsGrille(n, solLongCm, solLargCm);
  return { w: Math.min(0.95, (cols * maille) / solLongCm), h: Math.min(0.95, (rows * maille) / solLargCm) };
}

/** Grille régulière de `n` positions (fractions 0..1) dans un rectangle de proportions `ratio` = longueur / largeur. */
export function grille(n: number, ratio: number): { x: number; y: number }[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * ratio)));
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => ({ x: ((i % cols) + 0.5) / cols, y: (Math.floor(i / cols) + 0.5) / rows }));
}
