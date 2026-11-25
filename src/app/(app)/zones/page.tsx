import { deleteZone, saveZone } from "@/app/actions/garden";
import { listCarres, listZones } from "@/lib/queries";

export default async function ZonesPage() {
  const zones = listZones();
  const carres = listCarres();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">📍 Zones</h1>
      {zones.length === 0 && (
        <p className="card text-sm text-muted">Aucune zone pour l&apos;instant. Créez-en une (ex. « Serre », « Jardin sud ») pour y ajouter des carrés.</p>
      )}
      <div className="space-y-2">
        {zones.map((z) => (
          <div key={z.id} className="card flex items-center gap-3">
            <form action={saveZone} className="flex flex-1 items-center gap-3">
              <input type="hidden" name="id" value={z.id} />
              <input type="color" name="couleur" defaultValue={z.couleur} className="h-9 w-12 rounded" />
              <input name="nom" defaultValue={z.nom} className="input" />
              <span className="shrink-0 text-xs text-muted">{carres.filter((c) => c.zone_id === z.id).length} carré(s)</span>
              <button className="btn-secondary">Renommer</button>
            </form>
            <form action={deleteZone}>
              <input type="hidden" name="id" value={z.id} />
              <button className="btn-danger">Supprimer</button>
            </form>
          </div>
        ))}
      </div>
      <form action={saveZone} className="card flex items-center gap-3">
        <input type="color" name="couleur" defaultValue="#16a34a" className="h-9 w-12 rounded" />
        <input name="nom" placeholder="Nouvelle zone" required className="input" />
        <button className="btn">Ajouter</button>
      </form>
    </div>
  );
}
