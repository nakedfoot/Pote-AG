import Link from "next/link";
import { STATUTS } from "@/lib/metrics";
import { ageJours, listPlants } from "@/lib/queries";

export default async function PlantsPage() {
  const plants = listPlants();
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">🌱 Plants</h1>
        <Link href="/plants/new" className="btn">➕ Nouveau plant</Link>
      </div>
      {plants.length === 0 ? (
        <p className="card text-sm text-muted">Aucun plant. Créez-en un pour commencer.</p>
      ) : (
        <div className="card divide-y divide-border p-0">
          {plants.map((p) => {
            const age = ageJours(p.date_plantation);
            return (
              <Link key={p.id} href={`/plants/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5">
                <div>
                  <div className="font-medium">{p.nom}{p.variete && <span className="font-normal text-muted"> · {p.variete}</span>}</div>
                  <div className="text-xs text-muted">{p.zone_nom ? `${p.zone_nom} › ${p.carre_nom}` : "Non affecté"}</div>
                </div>
                <div className="text-right text-xs text-muted">
                  <div>{STATUTS[p.statut as keyof typeof STATUTS] ?? p.statut}</div>
                  {age !== null && <div>{age} j</div>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
