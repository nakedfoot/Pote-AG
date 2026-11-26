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
};

const sansAccent = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const MOTS: [TypePlante, RegExp][] = [
  ["arbre", /pommier|poirier|cerisier|prunier|olivier|figuier|abricotier|pecher|oranger|citronnier|noyer|chene|erable|chataignier|amandier|mirabellier|cognassier|\barbre\b/],
  ["grimpante", /vigne|clematite|lierre|kiwi|pois de senteur|chevrefeuille|houblon|glycine|jasmin|liseron|grimpant/],
  ["arbuste", /framboisier|groseillier|cassis|cassissier|myrtille|rosier|buis|noisetier|romarin|hortensia|lilas|laurier|forsythia|arbuste|murier/],
  ["fleur", /\brose\b|tulipe|lavande|tournesol|pivoine|dahlia|oeillet|capucine|souci|bleuet|pensee|\blys\b|iris|geranium|marguerite|narcisse|jonquille|cosmos|zinnia|petunia|primevere|fleur/],
];

/** Forme probable d'après le nom (et le nom scientifique) ; une hauteur adulte d'au moins 4 m évoque un arbre. */
export function devinerType(nom: string, nomScientifique: string | null, hauteurAdulteCm: number | null): TypePlante {
  const t = sansAccent(`${nom} ${nomScientifique ?? ""}`);
  for (const [type, re] of MOTS) if (re.test(t)) return type;
  return hauteurAdulteCm !== null && hauteurAdulteCm >= 400 ? "arbre" : "herbacee";
}

/** Fruitier : les sources botaniques (Perenual, Trefle) indiquent des fruits comestibles. */
export const estFruitier = (comestible: string | null) => !!comestible && /fruit/i.test(sansAccent(comestible));

const FRUITS: [RegExp, string][] = [
  [/mirabelle/, "#f0c23a"],
  [/pomm/, "#d9362b"],
  [/poir/, "#c8cf3a"],
  [/cerise|cerisier/, "#a3122a"],
  [/prun|quetsche/, "#6b3a8f"],
  [/abricot/, "#f2a03d"],
  [/pech/, "#f4a07a"],
  [/orang|clementine|mandarine/, "#f28c1c"],
  [/citron/, "#f2dc2e"],
  [/fig/, "#5b3a6e"],
  [/framboise/, "#c2185b"],
  [/groseille/, "#d11a2a"],
  [/cassis/, "#2b1b3a"],
  [/myrtille/, "#3b4a8a"],
  [/raisin|vigne|vitis/, "#6a3d7d"],
  [/kiwi/, "#8a6a3a"],
  [/noix|noyer|noisett/, "#8a6a3a"],
  [/olive/, "#5a6b2a"],
];

/** Couleur des fruits d'après le nom (et le nom scientifique) ; rouge orangé par défaut. */
export function couleurFruit(nom: string, nomScientifique: string | null): string {
  const t = sansAccent(`${nom} ${nomScientifique ?? ""}`);
  return FRUITS.find(([re]) => re.test(t))?.[1] ?? "#e0432f";
}

const FLEURS_ARBRES: [RegExp, string][] = [
  [/rosier|\brose\b/, "#e8457a"],
  [/lavande/, "#8e6bd1"],
  [/hortensia/, "#7aa7e8"],
  [/lilas/, "#b78ad9"],
  [/forsythia|mimosa|genet/, "#f7d63a"],
  [/magnolia|cerisier du japon|pecher/, "#f4b6c8"],
  [/camelia|rhododendron|azalee/, "#e0457f"],
  [/jasmin|seringat|sureau|aubepine/, "#fbf6ea"],
];
const PASTELS = ["#f9c6d8", "#fbf3df", "#f4a6c1", "#e6d4f5", "#fde68a"];

/** Couleur des fleurs d'un arbre ou arbuste d'après le nom ; une teinte pastel stable sinon. */
export function couleurFleur(nom: string, nomScientifique: string | null, id: number): string {
  const t = sansAccent(`${nom} ${nomScientifique ?? ""}`);
  return FLEURS_ARBRES.find(([re]) => re.test(t))?.[1] ?? PASTELS[id % PASTELS.length];
}

/** Grille régulière de `n` positions (fractions 0..1) dans un rectangle de proportions `ratio` = longueur / largeur. */
export function grille(n: number, ratio: number): { x: number; y: number }[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * ratio)));
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => ({ x: ((i % cols) + 0.5) / cols, y: (Math.floor(i / cols) + 0.5) / rows }));
}
