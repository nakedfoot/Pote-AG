import Link from "next/link";
import PlanView, { type CarreItem, type Etat2, type PlantInfo, type Rect, type ZoneItem } from "@/components/PlanView";
import PotagerBoard, { type BoardCarre, type BoardPlant } from "@/components/PotagerBoard";
import { all } from "@/lib/db";
import { planVersion } from "@/lib/image";
import { listCarres, listPlants, listZones, plantStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ORDRE: Etat2[] = ["haut", "bas", "ok", "inconnu", "vide"]; // du plus grave au moins grave
const pire = (etats: Etat2[]): Etat2 => ORDRE.find((e) => etats.includes(e)) ?? "vide";

type PlanCols = { id: number; plan_x: number | null; plan_y: number | null; plan_w: number | null; plan_h: number | null };
const rectOf = (r?: PlanCols): Rect | null =>
  r && r.plan_x !== null && r.plan_y !== null && r.plan_w !== null && r.plan_h !== null
    ? { x: r.plan_x, y: r.plan_y, w: r.plan_w, h: r.plan_h }
    : null;

const VUES = { carres: "🟩 Carrés (vue du dessus)", plan: "🗺️ Plan du jardin" } as const;
type Vue = keyof typeof VUES;

export default async function VuePotagerPage({ searchParams }: PageProps<"/vue-potager">) {
  const sp = await searchParams;
  const vue: Vue = sp.vue === "plan" || sp.erreur ? "plan" : "carres";
  const zones = listZones();
  const carres = listCarres();
  const plants = listPlants();

  return (
    <div className={`space-y-4 ${vue === "plan" ? "max-w-6xl" : ""}`}>
      <h1 className="text-2xl font-semibold">🗺️ Vue potager</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {(Object.keys(VUES) as Vue[]).map((v) => (
          <Link
            key={v}
            href={v === "carres" ? "/vue-potager" : "/vue-potager?vue=plan"}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm sm:px-4 ${vue === v ? "border-green-700 font-medium text-green-800 dark:text-green-300" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {VUES[v]}
          </Link>
        ))}
      </nav>

      {vue === "carres" ? <Carres zones={zones} carres={carres} plants={plants} /> : <Plan zones={zones} carres={carres} plants={plants} erreur={sp.erreur} />}
    </div>
  );
}

function Carres({ zones, carres, plants }: { zones: ReturnType<typeof listZones>; carres: ReturnType<typeof listCarres>; plants: ReturnType<typeof listPlants> }) {
  const couleur = new Map(zones.map((z) => [z.id, z.couleur]));
  const boardCarres: BoardCarre[] = carres.map((c) => ({
    id: c.id, zone_id: c.zone_id, zone_nom: c.zone_nom, zone_couleur: couleur.get(c.zone_id) ?? "#16a34a", nom: c.nom,
    longueur: c.longueur_cm, largeur: c.largeur_cm, hauteur: c.hauteur_cm,
  }));
  const boardPlants: BoardPlant[] = plants.map((p) => {
    const s = plantStatus(p);
    return {
      id: p.id, nom: p.nom, variete: p.variete, photo: p.photo, espacement: p.espacement_cm,
      carre_id: p.carre_id, x: p.plan_x, y: p.plan_y, w: p.plan_w, h: p.plan_h, quantite: p.quantite, etat: s.mesures.length ? s.pire : "inconnu",
    };
  });
  return <PotagerBoard carres={boardCarres} plants={boardPlants} />;
}

function Plan({ zones, carres, plants, erreur }: { zones: ReturnType<typeof listZones>; carres: ReturnType<typeof listCarres>; plants: ReturnType<typeof listPlants>; erreur: string | string[] | undefined }) {
  const planZ = new Map(all<PlanCols>("SELECT id, plan_x, plan_y, plan_w, plan_h FROM zone").map((r) => [r.id, r]));
  const planC = new Map(all<PlanCols>("SELECT id, plan_x, plan_y, plan_w, plan_h FROM carre").map((r) => [r.id, r]));

  const parCarre = new Map<number, PlantInfo[]>();
  for (const p of plants) {
    if (p.carre_id === null) continue;
    const s = plantStatus(p);
    const list = parCarre.get(p.carre_id) ?? [];
    list.push({
      id: p.id, nom: p.nom, variete: p.variete,
      etat: s.mesures.length ? s.pire : "inconnu",
      aArroser: s.aArroser, batterieBasse: s.batterieBasse,
    });
    parCarre.set(p.carre_id, list);
  }

  const carreItems: CarreItem[] = carres.map((c) => {
    const list = parCarre.get(c.id) ?? [];
    return { id: c.id, zone_id: c.zone_id, nom: c.nom, rect: rectOf(planC.get(c.id)), etat: list.length ? pire(list.map((p) => p.etat)) : "vide", plants: list };
  });
  const zoneItems: ZoneItem[] = zones.map((z) => {
    const mine = carreItems.filter((c) => c.zone_id === z.id);
    return { id: z.id, nom: z.nom, couleur: z.couleur, rect: rectOf(planZ.get(z.id)), etat: pire(mine.map((c) => c.etat)) };
  });

  return (
    <div className="space-y-4">
      {erreur === "image" && (
        <p className="rounded-lg bg-red-100 p-2 text-sm text-red-700">Image illisible : choisissez une photo ou un dessin (JPEG, PNG, WebP…).</p>
      )}
      {zones.length === 0 && (
        <p className="card text-sm">
          Commencez par créer vos <Link href="/zones" className="underline">zones</Link> et vos <Link href="/carres" className="underline">carrés</Link>, puis placez-les sur le plan.
        </p>
      )}
      <PlanView version={planVersion()} zones={zoneItems} carres={carreItems} />
    </div>
  );
}
