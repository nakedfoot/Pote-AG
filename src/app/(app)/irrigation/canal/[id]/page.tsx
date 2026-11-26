import Link from "next/link";
import { notFound } from "next/navigation";
import { CanalForm, type CarreOption, type VanneOption } from "@/components/IrrigationForms";
import { all } from "@/lib/db";
import { parseConfig } from "@/lib/irrigation";
import { carresDuCanal, getCanal } from "@/lib/irrigation-service";
import { getIrrigationSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CanalPage({ params }: PageProps<"/irrigation/canal/[id]">) {
  const { id } = await params;
  const canal = id === "new" ? null : getCanal(Number(id));
  if (id !== "new" && !canal) notFound();

  const utilisees = new Set(all<{ capteur_id: number }>("SELECT capteur_id FROM irrigation_canal WHERE capteur_id IS NOT NULL").map((r) => r.capteur_id));
  const vannes: VanneOption[] = all<{ id: number; friendly_name: string; modele: string | null }>("SELECT id, friendly_name, modele FROM capteur WHERE commutable = 1 ORDER BY friendly_name")
    .map((v) => ({ id: v.id, nom: v.friendly_name, modele: v.modele, utilisee: utilisees.has(v.id) }));

  const plants = all<{ carre_id: number; nom: string; min: number | null; max: number | null }>("SELECT carre_id, nom, hum_sol_min min, hum_sol_max max FROM plant WHERE carre_id IS NOT NULL");
  const capteurs = all<{ carre_id: number; n: number }>(
    `SELECT p.carre_id, COUNT(DISTINCT pc.capteur_id || '|' || pc.champ) n FROM plant_capteur pc JOIN plant p ON p.id = pc.plant_id
     WHERE pc.metrique = 'hum_sol' AND p.carre_id IS NOT NULL GROUP BY p.carre_id`,
  );
  const carres: CarreOption[] = all<{ id: number; nom: string; zone: string }>("SELECT c.id, c.nom, z.nom zone FROM carre c JOIN zone z ON z.id = c.zone_id ORDER BY z.nom, c.nom")
    .map((c) => ({
      ...c,
      nbCapteurs: capteurs.find((x) => x.carre_id === c.id)?.n ?? 0,
      plants: plants.filter((p) => p.carre_id === c.id).map((p) => ({ nom: p.nom, min: p.min, max: p.max })),
    }));

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/irrigation" className="text-sm text-muted hover:underline">← Irrigation</Link>
        <h1 className="text-2xl font-semibold">{canal ? `⚙ ${canal.nom}` : "➕ Nouveau canal"}</h1>
      </div>
      <CanalForm
        canal={canal ? { id: canal.id, nom: canal.nom, capteurId: canal.capteur_id, carres: carresDuCanal(canal.id), config: parseConfig(canal.config) } : null}
        vannes={vannes}
        carres={carres}
        plagesDefaut={getIrrigationSettings().plages}
      />
    </div>
  );
}
