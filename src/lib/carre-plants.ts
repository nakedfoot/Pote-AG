import { DEFAUT_CARRE_CM, EPAISSEUR_CM, HAUTEUR_DEFAUT_CM, UNITES_MAX_3D, dimsGrille, grilleUnites, tailleZoneDefaut, couleurFleur, couleurFruit, devinerType, estFruitier, estTypePlante, grille, type PlantDessin } from "./carres";
import { derniereHauteur, listPlants } from "./queries";

/** Plants de chaque carré, prêts à être dessinés (positions de la vue potager, hauteur mesurée ou 15 cm). */
export function plantsParCarre(carres: { id: number; longueur_cm: number | null; largeur_cm: number | null }[]): Map<number, PlantDessin[]> {
  const parCarre = new Map<number, ReturnType<typeof listPlants>>();
  for (const p of listPlants()) {
    if (p.carre_id === null) continue;
    parCarre.set(p.carre_id, [...(parCarre.get(p.carre_id) ?? []), p]);
  }
  const out = new Map<number, PlantDessin[]>();
  for (const [carreId, plants] of parCarre) {
    const c = carres.find((x) => x.id === carreId);
    // Plants jamais placés à la main : même grille automatique que dans la vue potager
    const sans = plants.filter((p) => p.plan_x === null || p.plan_y === null);
    const auto = grille(sans.length, (c?.longueur_cm ?? DEFAUT_CARRE_CM) / (c?.largeur_cm ?? DEFAUT_CARRE_CM));
    const solL = (c?.longueur_cm ?? DEFAUT_CARRE_CM) - 2 * EPAISSEUR_CM;
    const solW = (c?.largeur_cm ?? DEFAUT_CARRE_CM) - 2 * EPAISSEUR_CM;
    out.set(
      carreId,
      plants.flatMap((p) => {
        const i = sans.indexOf(p);
        const mesuree = derniereHauteur(p.id)?.hauteur_cm;
        const fruitier = estFruitier(p.comestible, p.nom, p.nom_scientifique);
        const type = estTypePlante(p.type_plante) ? p.type_plante : devinerType(p.nom, p.nom_scientifique, p.hauteur_cm);
        const base = {
          id: p.id,
          nom: p.nom,
          type,
          hauteur: mesuree && mesuree > 0 ? mesuree : HAUTEUR_DEFAUT_CM,
          fruit: fruitier ? couleurFruit(p.nom, p.nom_scientifique) : null,
          // Non fruitier mais espèce à fleurs visibles : petites fleurs
          fleurs: fruitier ? null : couleurFleur(p.nom, p.nom_scientifique),
        };
        const cx = i >= 0 ? auto[i].x : (p.plan_x as number);
        const cy = i >= 0 ? auto[i].y : (p.plan_y as number);
        // Un arbre ou arbuste reste un seul modèle ; les autres plantes se répartissent dans leur zone de plantation
        if (p.quantite <= 1 || type === "arbre" || type === "arbuste") return [{ ...base, x: cx, y: cy, espacement: p.espacement_cm }];
        const n = Math.min(p.quantite, UNITES_MAX_3D);
        const def = tailleZoneDefaut(p.quantite, p.espacement_cm, solL, solW);
        const w = p.plan_w ?? def.w, h = p.plan_h ?? def.h;
        const wCm = w * solL, hCm = h * solW;
        const { cols, rows } = dimsGrille(n, wCm, hCm);
        const maille = Math.min(wCm / cols, hCm / rows); // largeur disponible pour chaque unité
        return grilleUnites(n, wCm, hCm).map((g, k) => ({
          ...base,
          k,
          x: Math.min(1, Math.max(0, cx - w / 2 + g.x * w)),
          y: Math.min(1, Math.max(0, cy - h / 2 + g.y * h)),
          espacement: maille,
        }));
      }),
    );
  }
  return out;
}
