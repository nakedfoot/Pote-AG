/** Pieds optionnels aux quatre coins : section carrée et hauteur, en cm. */
export const PIED_SECTION_CM = 7;
export const PIED_HAUTEUR_CM = 20;

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
