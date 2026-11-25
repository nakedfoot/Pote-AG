import Link from "next/link";
import PlanView, { type CarreItem, type Etat2, type PlantInfo, type Rect, type ZoneItem } from "@/components/PlanView";
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

export default async function VuePotagerPage({ searchParams }: PageProps<"/vue-potager">) {
  const sp = await searchParams;
  const zones = listZones();
  const carres = listCarres();
  const planZ = new Map(all<PlanCols>("SELECT id, plan_x, plan_y, plan_w, plan_h FROM zone").map((r) => [r.id, r]));
  const planC = new Map(all<PlanCols>("SELECT id, plan_x, plan_y, plan_w, plan_h FROM carre").map((r) => [r.id, r]));

  const parCarre = new Map<number, PlantInfo[]>();
  for (const p of listPlants()) {
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
    const plants = parCarre.get(c.id) ?? [];
    return { id: c.id, zone_id: c.zone_id, nom: c.nom, rect: rectOf(planC.get(c.id)), etat: plants.length ? pire(plants.map((p) => p.etat)) : "vide", plants };
  });
  const zoneItems: ZoneItem[] = zones.map((z) => {
    const mine = carreItems.filter((c) => c.zone_id === z.id);
    return { id: z.id, nom: z.nom, couleur: z.couleur, rect: rectOf(planZ.get(z.id)), etat: pire(mine.map((c) => c.etat)) };
  });

  const version = planVersion();
  return (
    <div className="max-w-6xl space-y-4">
      <h1 className="text-2xl font-semibold">🗺️ Vue potager</h1>
      {sp.erreur === "image" && (
        <p className="rounded-lg bg-red-100 p-2 text-sm text-red-700">Image illisible : choisissez une photo ou un dessin (JPEG, PNG, WebP…).</p>
      )}
      {zones.length === 0 && (
        <p className="card text-sm">
          Commencez par créer vos <Link href="/zones" className="underline">zones</Link> et vos <Link href="/carres" className="underline">carrés</Link>, puis placez-les sur le plan.
        </p>
      )}
      <PlanView version={version} zones={zoneItems} carres={carreItems} />
    </div>
  );
}
