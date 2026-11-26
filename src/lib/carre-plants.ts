import { DEFAUT_CARRE_CM, HAUTEUR_DEFAUT_CM, devinerType, estTypePlante, grille, type PlantDessin } from "./carres";
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
    out.set(
      carreId,
      plants.map((p) => {
        const i = sans.indexOf(p);
        const mesuree = derniereHauteur(p.id)?.hauteur_cm;
        return {
          id: p.id,
          nom: p.nom,
          x: i >= 0 ? auto[i].x : (p.plan_x as number),
          y: i >= 0 ? auto[i].y : (p.plan_y as number),
          type: estTypePlante(p.type_plante) ? p.type_plante : devinerType(p.nom, p.nom_scientifique, p.hauteur_cm),
          hauteur: mesuree && mesuree > 0 ? mesuree : HAUTEUR_DEFAUT_CM,
          espacement: p.espacement_cm,
        };
      }),
    );
  }
  return out;
}
