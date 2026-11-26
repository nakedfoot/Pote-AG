import Link from "next/link";
import { arroser } from "@/app/actions/garden";
import AutoRefresh from "@/components/AutoRefresh";
import { libelleQuand } from "@/lib/irrigation";
import { listPrevisions } from "@/lib/irrigation-service";
import { METRICS } from "@/lib/metrics";
import { rappelsDuPlant } from "@/lib/rappels";
import { getIrrigationSettings } from "@/lib/settings";
import { ageJours, listPlants, plantStatus, type PlantRow, type PlantStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Sans capteur : un plant arrosé il y a plus de ce nombre de jours (ou jamais) est signalé. */
const SANS_CAPTEUR_JOURS = 3;

type Item = { p: PlantRow; s: PlantStatus };

function Kpi({ icone, valeur, label, alerte }: { icone: string; valeur: number; label: string; alerte?: boolean }) {
  return (
    <div className={`card flex items-center gap-3 ${alerte && valeur > 0 ? "border-amber-400" : ""}`}>
      <span className="text-3xl" aria-hidden>{icone}</span>
      <div>
        <div className="text-2xl font-semibold leading-none">{valeur}</div>
        <div className="mt-1 text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}

function dernierTexte(s: PlantStatus) {
  const j = s.dernierArrosage ? ageJours(s.dernierArrosage) : null;
  return j === null ? "jamais arrosé" : j === 0 ? "arrosé aujourd'hui" : `arrosé il y a ${j} j`;
}

function Ligne({ p, s, detail }: { p: PlantRow; s: PlantStatus; detail: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <Link href={`/plants/${p.id}`} className="min-w-0 flex-1 hover:underline">
        <span className="font-medium">{p.nom}</span>
        {p.variete && <span className="text-muted"> · {p.variete}</span>}
        <div className="truncate text-xs text-muted">📍 {p.zone_nom ?? "Non affecté"} · 🟩 {p.carre_nom ?? "—"}</div>
      </Link>
      <div className="text-right text-xs">
        <div className="font-medium text-amber-700 dark:text-amber-400">{detail}</div>
        <div className="text-muted">💧 {dernierTexte(s)}</div>
      </div>
      <form action={arroser}>
        <input type="hidden" name="plant_id" value={p.id} />
        <button className="btn-secondary px-2 py-1 text-xs">💧 J&apos;ai arrosé</button>
      </form>
    </li>
  );
}

export default function SynthesePage() {
  const items: Item[] = listPlants()
    .filter((p) => p.statut !== "termine")
    .map((p) => ({ p, s: plantStatus(p) }));

  // 1) Sol trop sec selon le capteur, les plus secs d'abord (écart relatif au seuil minimum)
  const secs = items
    .filter((i) => i.s.aArroser)
    .map((i) => {
      const sol = i.s.mesures.find((m) => m.metrique === "hum_sol");
      return { ...i, sol, manque: sol?.valeur != null && i.p.hum_sol_min != null ? i.p.hum_sol_min - sol.valeur : 0 };
    })
    .sort((a, b) => b.manque - a.manque);

  // 2) Pas de mesure d'humidité du sol : on se fie à la date du dernier arrosage noté
  const sansCapteur = items
    .filter((i) => !i.s.mesures.some((m) => m.metrique === "hum_sol"))
    .map((i) => ({ ...i, j: i.s.dernierArrosage ? ageJours(i.s.dernierArrosage) : null }))
    .filter((i) => i.j === null || i.j >= SANS_CAPTEUR_JOURS)
    .sort((a, b) => (b.j ?? 9999) - (a.j ?? 9999));

  const surveiller = items.filter(({ s }) => s.pire === "bas" || s.pire === "haut" || s.batterieBasse).length;
  const recoltes = items.flatMap(({ p, s }) => rappelsDuPlant(p, s)).filter((r) => r.type === "recolte" || r.type === "recolte_retard").length;

  const previsions = listPrevisions();
  const fuseau = getIrrigationSettings().fuseau;

  // Résumé par zone
  const zones = new Map<string, { total: number; secs: number; autres: number }>();
  for (const { p, s } of items) {
    const z = p.zone_nom ?? "Non affectés";
    const e = zones.get(z) ?? { total: 0, secs: 0, autres: 0 };
    e.total++;
    if (s.aArroser) e.secs++;
    else if (!s.mesures.some((m) => m.metrique === "hum_sol") && (!s.dernierArrosage || (ageJours(s.dernierArrosage) ?? 0) >= SANS_CAPTEUR_JOURS)) e.autres++;
    zones.set(z, e);
  }

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <h1 className="text-2xl font-semibold">📊 Synthèse</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icone="🌱" valeur={items.length} label="plants suivis" />
        <Kpi icone="💧" valeur={secs.length} label="sol trop sec (capteur)" alerte />
        <Kpi icone="🚿" valeur={sansCapteur.length} label={`sans capteur, arrosage ≥ ${SANS_CAPTEUR_JOURS} j`} alerte />
        <Kpi icone="⚠️" valeur={surveiller} label="à surveiller" alerte />
        <Kpi icone="🧺" valeur={recoltes} label="récoltes proches" />
      </div>

      {previsions.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">💦 Prochaines irrigations <Link href="/irrigation" className="ml-2 text-sm font-normal hover:underline">Voir l&apos;irrigation →</Link></h2>
          <ul className="divide-y divide-border text-sm">
            {previsions.map((p) => (
              <li key={p.canalId} className="flex flex-wrap items-baseline gap-x-3 py-2">
                <span className="w-44 shrink-0 font-medium">🚿 {p.nom}</span>
                <span className={`w-36 shrink-0 ${p.type === "en_cours" ? "font-semibold text-blue-700 dark:text-blue-300" : p.type === "bloque" ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  {p.quand !== null ? libelleQuand(p.quand, fuseau) : "—"}
                </span>
                <span className="min-w-0 flex-1 text-muted">{p.texte}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">L&apos;irrigation est déclenchée par les capteurs (pas par un calendrier) : les dates sont des estimations qui évoluent avec l&apos;humidité, la météo et les plages horaires.</p>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold">💧 À arroser <span className="font-normal text-muted">· {secs.length}</span></h2>
        {secs.length === 0 ? (
          <p className="text-sm text-muted">Aucun plant n&apos;a soif d&apos;après les capteurs 🎉</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {secs.map(({ p, s, sol }) => (
              <Ligne
                key={p.id}
                p={p}
                s={s}
                detail={`${METRICS.hum_sol.icone} ${sol?.valeur ?? "—"} ${METRICS.hum_sol.unite}${p.hum_sol_min != null ? ` (min ${p.hum_sol_min})` : ""}`}
              />
            ))}
          </ul>
        )}
      </section>

      {sansCapteur.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">🚿 Sans capteur — arrosage à vérifier <span className="font-normal text-muted">· {sansCapteur.length}</span></h2>
          <p className="text-xs text-muted">Plants sans mesure d&apos;humidité du sol, pas arrosés depuis {SANS_CAPTEUR_JOURS} jours ou plus.</p>
          <ul className="divide-y divide-border text-sm">
            {sansCapteur.map(({ p, s, j }) => (
              <Ligne key={p.id} p={p} s={s} detail={j === null ? "jamais arrosé" : `${j} jours sans eau`} />
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold">📍 Par zone</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-1 pr-4 font-medium">Zone</th><th className="pr-4 font-medium">Plants</th><th className="pr-4 font-medium">Sol sec</th><th className="font-medium">Arrosage à vérifier</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...zones].map(([nom, z]) => (
                <tr key={nom}>
                  <td className="py-1.5 pr-4">{nom}</td>
                  <td className="pr-4">{z.total}</td>
                  <td className={`pr-4 ${z.secs ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted"}`}>{z.secs}</td>
                  <td className={z.autres ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted"}>{z.autres}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
