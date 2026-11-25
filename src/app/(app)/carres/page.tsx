import Link from "next/link";
import { deleteCarre, saveCarre } from "@/app/actions/garden";
import { listCarres, listZones } from "@/lib/queries";

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
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">🟩 Carrés potager</h1>
      {carres.length === 0 && <p className="card text-sm text-muted">Aucun carré pour l&apos;instant.</p>}
      <div className="space-y-2">
        {carres.map((c) => (
          <div key={c.id} className="card flex items-center gap-3">
            <form action={saveCarre} className="grid flex-1 grid-cols-4 gap-2">
              <input type="hidden" name="id" value={c.id} />
              <select name="zone_id" defaultValue={c.zone_id} className="input">
                {zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
              </select>
              <input name="nom" defaultValue={c.nom} className="input" />
              <input name="dimensions" defaultValue={c.dimensions ?? ""} placeholder="Dimensions (1.2×1.2 m)" className="input" />
              <div className="flex gap-2">
                <input name="exposition" defaultValue={c.exposition ?? ""} placeholder="Exposition" className="input" />
                <button className="btn-secondary">OK</button>
              </div>
            </form>
            <span className="shrink-0 text-xs text-muted">{c.nb_plants} plant(s)</span>
            <form action={deleteCarre}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn-danger">Supprimer</button>
            </form>
          </div>
        ))}
      </div>
      <form action={saveCarre} className="card grid grid-cols-4 gap-2">
        <h2 className="col-span-4 font-semibold">Nouveau carré</h2>
        <select name="zone_id" className="input">
          {zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
        </select>
        <input name="nom" placeholder="Nom (ex. A1)" required className="input" />
        <input name="dimensions" placeholder="Dimensions" className="input" />
        <input name="exposition" placeholder="Exposition" className="input" />
        <button className="btn col-span-4">Ajouter</button>
      </form>
    </div>
  );
}
