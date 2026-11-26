import Link from "next/link";
import { deleteZone, saveZone } from "@/app/actions/garden";
import CarreGraphic from "@/components/CarreGraphic";
import { formatDimensions } from "@/lib/carres";
import { listCarres, listZones } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ZonesPage() {
  const zones = listZones();
  const carres = listCarres();
  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">📍 Zones</h1>

      <details className="card" open={zones.length === 0}>
        <summary className="cursor-pointer font-semibold">➕ Nouvelle zone</summary>
        <form action={saveZone} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="color" name="couleur" defaultValue="#16a34a" className="h-9 w-12 rounded" aria-label="Couleur" />
          <input name="nom" placeholder="Nom (ex. Serre, Jardin sud)" required className="input min-w-0 flex-1 basis-48" />
          <button className="btn">Ajouter</button>
        </form>
      </details>

      {zones.length === 0 && (
        <p className="card text-sm text-muted">Aucune zone pour l&apos;instant. Créez-en une (ex. « Serre », « Jardin sud ») pour y ajouter des carrés.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {zones.map((z) => {
          const mine = carres.filter((c) => c.zone_id === z.id);
          return (
            <section key={z.id} className="card flex flex-col gap-4 border-l-4" style={{ borderLeftColor: z.couleur }}>
              <div className="flex flex-wrap items-center gap-2">
                <form action={saveZone} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={z.id} />
                  <input type="color" name="couleur" defaultValue={z.couleur} className="h-9 w-12 rounded" aria-label="Couleur" />
                  <input name="nom" defaultValue={z.nom} className="input min-w-0 flex-1 basis-32 font-semibold" />
                  <button className="btn-secondary">Renommer</button>
                </form>
                <form action={deleteZone}>
                  <input type="hidden" name="id" value={z.id} />
                  <button className="btn-danger">Supprimer</button>
                </form>
              </div>

              <p className="text-xs text-muted">
                {mine.length} carré(s) · {mine.reduce((n, c) => n + c.nb_plants, 0)} plant(s)
              </p>

              {mine.length === 0 ? (
                <p className="rounded-lg bg-black/5 p-4 text-center text-sm text-muted dark:bg-white/5">
                  Aucun carré dans cette zone. <Link href="/carres" className="underline">Créer un carré</Link>.
                </p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(11rem,100%),1fr))] gap-3">
                  {mine.map((c) => (
                    <Link key={c.id} href="/carres" className="flex flex-col gap-1 rounded-lg border border-border p-2 transition hover:shadow-md">
                      <CarreGraphic longueur={c.longueur_cm} largeur={c.largeur_cm} hauteur={c.hauteur_cm} pieds={c.pieds === 1} />
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{c.nom}</span>
                        <span className="shrink-0 text-xs text-muted">🌱 {c.nb_plants}</span>
                      </div>
                      <span className="truncate text-xs text-muted">{formatDimensions(c.longueur_cm, c.largeur_cm, c.hauteur_cm) ?? "Dimensions non renseignées"}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
