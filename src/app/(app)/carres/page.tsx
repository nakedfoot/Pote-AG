import Link from "next/link";
import { deleteCarre, saveCarre } from "@/app/actions/garden";
import CarreGraphic from "@/components/CarreGraphic";
import { formatDimensions, parseAncienneDimension, surfaceM2 } from "@/lib/carres";
import { listCarres, listZones } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CarresPage() {
  const zones = listZones();
  const carres = listCarres();
  if (zones.length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">🟩 Carrés</h1>
        <p className="card text-sm">Commencez par <Link href="/zones" className="underline">créer une zone</Link>.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">🟩 Carrés potager</h1>

      <details className="card" open={carres.length === 0}>
        <summary className="cursor-pointer font-semibold">➕ Nouveau carré</summary>
        <form action={saveCarre} className="mt-3">
          <CarreFields zones={zones} />
          <button className="btn mt-3">Ajouter</button>
        </form>
      </details>

      {carres.length === 0 && <p className="card text-sm text-muted">Aucun carré pour l&apos;instant.</p>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-4">
        {carres.map((c) => {
          // Ancienne saisie libre : sert de préremplissage tant que les nouvelles cotes sont vides.
          const ancien = c.longueur_cm === null && c.largeur_cm === null ? parseAncienneDimension(c.dimensions) : null;
          const longueur = c.longueur_cm ?? ancien?.longueur ?? null;
          const largeur = c.largeur_cm ?? ancien?.largeur ?? null;
          const surface = surfaceM2(longueur, largeur);
          return (
            <div key={c.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{c.nom}</h2>
                  <p className="truncate text-xs text-muted">📍 {c.zone_nom}</p>
                </div>
                <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">🌱 {c.nb_plants}</span>
              </div>
              <CarreGraphic longueur={longueur} largeur={largeur} hauteur={c.hauteur_cm} />
              <p className="text-xs text-muted">
                {formatDimensions(longueur, largeur, c.hauteur_cm) ?? "Dimensions non renseignées"}
                {surface !== null && ` · ${Number(surface.toFixed(2))} m²`}
                {c.exposition && ` · ${c.exposition}`}
              </p>
              {ancien && <p className="text-xs text-amber-700">Cotes reprises de « {c.dimensions} » : enregistrez pour les confirmer.</p>}
              <details className="mt-auto border-t border-border pt-2">
                <summary className="cursor-pointer text-sm text-muted hover:text-foreground">Modifier</summary>
                <form action={saveCarre} className="mt-3">
                  <input type="hidden" name="id" value={c.id} />
                  <CarreFields zones={zones} c={{ ...c, longueur_cm: longueur, largeur_cm: largeur }} />
                  <button className="btn-secondary mt-3 w-full">Enregistrer</button>
                </form>
                <form action={deleteCarre} className="mt-2">
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn-danger w-full">Supprimer</button>
                </form>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CarreFields({ zones, c }: { zones: { id: number; nom: string }[]; c?: { zone_id: number; nom: string; longueur_cm: number | null; largeur_cm: number | null; hauteur_cm: number | null; exposition: string | null } }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="col-span-3 sm:col-span-1">
        <label className="label">Zone</label>
        <select name="zone_id" defaultValue={c?.zone_id} className="input">
          {zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
        </select>
      </div>
      <div className="col-span-3 sm:col-span-2">
        <label className="label">Nom</label>
        <input name="nom" defaultValue={c?.nom} placeholder="ex. A1" required className="input" />
      </div>
      <div>
        <label className="label">Longueur (cm)</label>
        <input name="longueur_cm" type="number" step="any" min="1" defaultValue={c?.longueur_cm ?? ""} placeholder="120" className="input" />
      </div>
      <div>
        <label className="label">Largeur (cm)</label>
        <input name="largeur_cm" type="number" step="any" min="1" defaultValue={c?.largeur_cm ?? ""} placeholder="120" className="input" />
      </div>
      <div>
        <label className="label">Hauteur (cm)</label>
        <input name="hauteur_cm" type="number" step="any" min="1" defaultValue={c?.hauteur_cm ?? ""} placeholder="30" className="input" />
      </div>
      <div className="col-span-3">
        <label className="label">Exposition</label>
        <input name="exposition" defaultValue={c?.exposition ?? ""} placeholder="ex. Plein soleil" className="input" />
      </div>
    </div>
  );
}
